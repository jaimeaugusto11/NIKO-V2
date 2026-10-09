use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Porta preferida da ponte: os ganchos do Claude instalados no settings.json apontam para ela.
const PORTA_PREFERIDA: u16 = 47831;
pub(crate) const ALTURA_ILHA: f64 = 720.0;
pub(crate) const ALTURA_DOCK: f64 = 250.0;

#[derive(Deserialize, Clone, Copy)]
struct Retangulo {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct Estado {
    areas: Mutex<HashMap<String, Vec<Retangulo>>>,
    token: String,
    ponte: Mutex<Option<Child>>,
    porta: u16,
}

/// Escolhe a porta uma vez no arranque. Se a preferida estiver ocupada (outro programa, ponte órfã), usa uma livre.
fn escolher_porta() -> u16 {
    if std::net::TcpListener::bind(("127.0.0.1", PORTA_PREFERIDA)).is_ok() {
        return PORTA_PREFERIDA;
    }
    std::net::TcpListener::bind(("127.0.0.1", 0)).and_then(|l| l.local_addr()).map(|a| a.port()).unwrap_or(PORTA_PREFERIDA)
}

fn gerar_token() -> String {
    use windows::Win32::Security::Cryptography::{BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG};
    let mut bytes = [0u8; 32];
    let status = unsafe { BCryptGenRandom(None, &mut bytes, BCRYPT_USE_SYSTEM_PREFERRED_RNG) };
    assert!(status.is_ok(), "falha ao gerar o token da ponte");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
fn area_interativa(janela: String, retangulos: Vec<Retangulo>, estado: tauri::State<Estado>) {
    if let Ok(mut areas) = estado.areas.lock() {
        areas.insert(janela, retangulos);
    }
}

#[tauri::command]
fn token_ponte(estado: tauri::State<Estado>) -> String {
    estado.token.clone()
}

#[tauri::command]
fn porta_ponte(estado: tauri::State<Estado>) -> u16 {
    estado.porta
}

#[tauri::command]
fn mostrar_sistema(app: AppHandle) {
    mostrar(&app);
}

/// Última janela da frente que não é uma sobreposta; atualizada pelo vigia do cursor.
static ULTIMA_FRENTE: AtomicIsize = AtomicIsize::new(0);

#[tauri::command]
fn alternar_sistema(app: AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let visivel = janela.is_visible().unwrap_or(false) && !janela.is_minimized().unwrap_or(false);
        let focada = janela.hwnd().map(|h| h.0 as isize == ULTIMA_FRENTE.load(Ordering::Relaxed)).unwrap_or(false);
        if visivel && focada {
            let _ = janela.minimize();
        } else {
            mostrar(&app);
        }
    }
}

#[tauri::command(async)]
fn abrir_link(url: String) -> Result<(), String> {
    let endereco = url.trim();
    if !(endereco.starts_with("https://") || endereco.starts_with("http://")) || endereco.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("link_invalido".into());
    }
    let largo: Vec<u16> = endereco.encode_utf16().chain(std::iter::once(0)).collect();
    let resultado = unsafe {
        windows::Win32::UI::Shell::ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::PCWSTR(largo.as_ptr()),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if resultado.0 as isize > 32 {
        Ok(())
    } else {
        Err("falha_ao_abrir".into())
    }
}

#[tauri::command]
fn sair(app: AppHandle) {
    sair_salvando(&app);
}

const ESPERA_PARA_SALVAR: Duration = Duration::from_millis(700);

fn sair_salvando(app: &AppHandle) {
    if ENCERRANDO.swap(true, Ordering::Relaxed) {
        return;
    }
    let _ = app.emit("niko://saindo", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(ESPERA_PARA_SALVAR);
        app.exit(0);
    });
}

fn mostrar(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

pub(crate) fn criar_sobreposta(app: &AppHandle, rotulo: &str, y: f64, x: f64, largura: f64, altura: f64) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, rotulo, WebviewUrl::App("index.html".into()))
        .title("Niko")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .position(x, y)
        .inner_size(largura, altura)
        .build()
}

/// Muda sempre que uma sobreposta é destruída, para o vigia do cursor refazer a lista de janelas na hora.
static GERACAO_DAS_SOBREPOSTAS: AtomicUsize = AtomicUsize::new(0);

/// Chamado antes de destruir uma sobreposta: esquece a área interativa dela (uma recriada com o mesmo rótulo começa limpa).
pub(crate) fn esquecer_sobreposta(app: &AppHandle, rotulo: &str) {
    if let Ok(mut areas) = app.state::<Estado>().areas.lock() {
        areas.remove(rotulo);
    }
    GERACAO_DAS_SOBREPOSTAS.fetch_add(1, Ordering::SeqCst);
}

const INTERVALO_DO_CURSOR: Duration = Duration::from_millis(45);
/// A lista de sobrepostas (que passa pela thread principal) só é refeita de tempos a tempos.
const VOLTAS_ATE_REFAZER_LISTA: u32 = 22;

fn vigiar_cursor(app: AppHandle) {
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetForegroundWindow, GetWindowRect};

    std::thread::spawn(move || {
        let mut fora: HashMap<String, bool> = HashMap::new();
        let mut janelas: Vec<(WebviewWindow, isize)> = Vec::new();
        let mut voltas = 0u32;
        let mut geracao = usize::MAX;
        loop {
            std::thread::sleep(INTERVALO_DO_CURSOR);
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            // Ler cursor e retângulos por Win32 não acorda a thread principal; os métodos das janelas Tauri acordam.
            let geracao_atual = GERACAO_DAS_SOBREPOSTAS.load(Ordering::SeqCst);
            if voltas.is_multiple_of(VOLTAS_ATE_REFAZER_LISTA) || geracao != geracao_atual {
                geracao = geracao_atual;
                janelas = super::monitores::sobrepostas(&app).into_iter().filter_map(|j| j.hwnd().ok().map(|h| (j, h.0 as isize))).collect();
                fora.retain(|rotulo, _| janelas.iter().any(|(j, _)| j.label() == rotulo));
            }
            voltas = voltas.wrapping_add(1);

            let frente = unsafe { GetForegroundWindow() }.0 as isize;
            if frente != 0 && !janelas.iter().any(|(_, h)| *h == frente) {
                ULTIMA_FRENTE.store(frente, Ordering::Relaxed);
            }

            let mut cursor = POINT::default();
            if unsafe { GetCursorPos(&mut cursor) }.is_err() {
                continue;
            }
            let areas = match app.state::<Estado>().areas.lock() {
                Ok(a) => a.clone(),
                Err(_) => continue,
            };
            for (janela, hwnd) in &janelas {
                let hwnd = HWND(*hwnd as *mut core::ffi::c_void);
                let mut retangulo = RECT::default();
                if unsafe { GetWindowRect(hwnd, &mut retangulo) }.is_err() {
                    continue;
                }
                let dpi = unsafe { GetDpiForWindow(hwnd) };
                let escala = if dpi == 0 { 1.0 } else { dpi as f64 / 96.0 };
                let rotulo = janela.label();
                let x = (cursor.x - retangulo.left) as f64 / escala;
                let y = (cursor.y - retangulo.top) as f64 / escala;
                let dentro = areas.get(rotulo).map(|lista| lista.iter().any(|r| x >= r.x - 4.0 && x <= r.x + r.w + 4.0 && y >= r.y - 4.0 && y <= r.y + r.h + 4.0)).unwrap_or(false);
                let agora_fora = !dentro;
                if fora.get(rotulo) != Some(&agora_fora) {
                    let _ = janela.set_ignore_cursor_events(agora_fora);
                    if agora_fora {
                        let _ = janela.emit_to(rotulo, "niko://cursor-fora", ());
                    }
                    fora.insert(rotulo.to_string(), agora_fora);
                }
            }
        }
    });
}

fn sem_prefixo(caminho: std::path::PathBuf) -> std::path::PathBuf {
    let texto = caminho.to_string_lossy().to_string();
    match texto.strip_prefix(r"\\?\UNC\") {
        Some(resto) => std::path::PathBuf::from(format!(r"\\{}", resto)),
        None => match texto.strip_prefix(r"\\?\") {
            Some(resto) => std::path::PathBuf::from(resto),
            None => caminho,
        },
    }
}

fn iniciar_ponte(app: &AppHandle, token: &str, reinicio: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let dados = app.path().app_data_dir().ok();
    let registrar = |texto: String| registrar_log(app, &texto, reinicio);
    let Ok(pasta) = app.path().resource_dir() else {
        registrar("sem pasta de recursos".into());
        return;
    };
    let recursos = sem_prefixo(pasta.join("recursos"));
    let node = recursos.join("node.exe");
    let script = recursos.join("ponte.mjs");
    let saida_erro = dados.as_ref().and_then(|p| {
        let caminho = sem_prefixo(p.join("ponte.log"));
        if reinicio {
            std::fs::OpenOptions::new().create(true).append(true).open(caminho).ok()
        } else {
            std::fs::File::create(caminho).ok()
        }
    });
    let mut comando = Command::new(&node);
    comando.current_dir(&recursos).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::null());
    match saida_erro {
        Some(arquivo) => {
            comando.stderr(arquivo);
        }
        None => {
            comando.stderr(std::process::Stdio::null());
        }
    }
    comando.arg("ponte.mjs").env("NIKO_PORTA", app.state::<Estado>().porta.to_string()).env("NIKO_TOKEN", token).env("NIKO_PAI", std::process::id().to_string()).env("NIKO_ENCERRAR_PELO_STDIN", "1");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        comando.creation_flags(0x0800_0000);
    }
    match comando.spawn() {
        Ok(filho) => {
            registrar(format!("ponte iniciada: {} {} (pid {})", node.display(), script.display(), filho.id()));
            if let Ok(mut ponte) = app.state::<Estado>().ponte.lock() {
                // O Niko pode ter começado a fechar enquanto esta ponte arrancava: ninguém a pararia depois.
                if ENCERRANDO.load(Ordering::Relaxed) {
                    let mut filho = filho;
                    drop(filho.stdin.take());
                    let _ = filho.kill();
                    return;
                }
                *ponte = Some(filho);
            }
        }
        Err(erro) => registrar(format!("falha ao iniciar a ponte: {} {} {}", node.display(), script.display(), erro)),
    }
}

fn registrar_log(app: &AppHandle, texto: &str, anexar: bool) {
    use std::io::Write;
    let Ok(pasta) = app.path().app_data_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&pasta);
    let arquivo = std::fs::OpenOptions::new().create(true).write(true).append(anexar).truncate(!anexar).open(pasta.join("niko.log"));
    if let Ok(mut arquivo) = arquivo {
        let segundos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let _ = writeln!(arquivo, "[{segundos}] {texto}");
    }
}

fn parar_ponte(app: &AppHandle) {
    ENCERRANDO.store(true, Ordering::Relaxed);
    if let Ok(mut ponte) = app.state::<Estado>().ponte.lock() {
        if let Some(mut filho) = ponte.take() {
            // Fechar o stdin pede à ponte que feche o banco e os processos do PowerShell; só mata se ela não sair a tempo.
            drop(filho.stdin.take());
            let limite = std::time::Instant::now() + Duration::from_secs(2);
            while std::time::Instant::now() < limite {
                if matches!(filho.try_wait(), Ok(Some(_))) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            let _ = filho.kill();
        }
    }
}

static ENCERRANDO: AtomicBool = AtomicBool::new(false);

pub(crate) fn encerrando() -> bool {
    ENCERRANDO.load(Ordering::Relaxed)
}
const MAXIMO_REINICIOS_DA_PONTE: u32 = 5;
/// Depois de muitas quedas seguidas a ponte espera este tempo antes de voltar a tentar, em vez de desistir.
const PAUSA_APOS_MUITAS_QUEDAS: Duration = Duration::from_secs(60);
/// Falhas seguidas no teste de saúde (a cada ~9 s) antes de matar uma ponte viva mas presa.
const FALHAS_DE_SAUDE_PARA_REINICIAR: u32 = 3;

/// Pede GET /ponte/estado com prazo curto: o processo pode estar vivo mas com o event loop preso.
fn ponte_responde(porta: u16, token: &str) -> bool {
    use std::io::{Read, Write};
    let endereco = std::net::SocketAddr::from(([127, 0, 0, 1], porta));
    let Ok(mut conexao) = std::net::TcpStream::connect_timeout(&endereco, Duration::from_secs(2)) else { return false };
    let _ = conexao.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = conexao.set_write_timeout(Some(Duration::from_secs(2)));
    let pedido = format!("GET /ponte/estado HTTP/1.1\r\nHost: 127.0.0.1:{porta}\r\nx-niko: 1\r\nx-niko-token: {token}\r\nConnection: close\r\n\r\n");
    if conexao.write_all(pedido.as_bytes()).is_err() {
        return false;
    }
    let mut inicio = [0u8; 12];
    conexao.read_exact(&mut inicio).is_ok() && inicio.starts_with(b"HTTP/1.1 200")
}

fn vigiar_ponte(app: AppHandle, token: String) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        let porta = app.state::<Estado>().porta;
        let mut reinicios = 0u32;
        let mut falhas_de_saude = 0u32;
        let mut voltas = 0u32;
        let mut estavel_desde = std::time::Instant::now();
        loop {
            std::thread::sleep(Duration::from_secs(3));
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            voltas = voltas.wrapping_add(1);
            let caiu = match app.state::<Estado>().ponte.lock() {
                Ok(mut ponte) => match ponte.as_mut() {
                    Some(filho) => matches!(filho.try_wait(), Ok(Some(_))),
                    // Sem processo: o primeiro arranque falhou (antivírus, ficheiro em atualização) e tem de ser repetido.
                    None => true,
                },
                Err(_) => false,
            };
            // Só testa a saúde depois de a ponte ter tido tempo de abrir a porta.
            if !caiu && voltas.is_multiple_of(3) && estavel_desde.elapsed() > Duration::from_secs(15) {
                if ponte_responde(porta, &token) {
                    falhas_de_saude = 0;
                } else {
                    falhas_de_saude += 1;
                    if falhas_de_saude >= FALHAS_DE_SAUDE_PARA_REINICIAR {
                        registrar_log(&app, "a ponte deixou de responder e será reiniciada", true);
                        falhas_de_saude = 0;
                        if let Ok(mut ponte) = app.state::<Estado>().ponte.lock() {
                            if let Some(mut filho) = ponte.take() {
                                let _ = filho.kill();
                                let _ = filho.wait();
                            }
                        }
                        continue;
                    }
                }
            }
            if !caiu {
                if estavel_desde.elapsed() > Duration::from_secs(120) {
                    reinicios = 0;
                }
                continue;
            }
            if reinicios >= MAXIMO_REINICIOS_DA_PONTE {
                registrar_log(&app, "a ponte caiu muitas vezes seguidas; nova tentativa daqui a 60 s", true);
                std::thread::sleep(PAUSA_APOS_MUITAS_QUEDAS);
                reinicios = 0;
            }
            reinicios += 1;
            std::thread::sleep(Duration::from_secs(u64::from(reinicios) * 2));
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            iniciar_ponte(&app, &token, true);
            estavel_desde = std::time::Instant::now();
            falhas_de_saude = 0;
        }
    });
}

/// Com windows_subsystem = "windows" uma falha no arranque seria silenciosa; regista e avisa o utilizador.
fn falhar_no_arranque(erro: &str) -> ! {
    if let Some(pasta) = std::env::var_os("APPDATA").map(|a| std::path::PathBuf::from(a).join("com.niko.desktop")) {
        let _ = std::fs::create_dir_all(&pasta);
        let _ = std::fs::write(pasta.join("falha-arranque.log"), erro);
    }
    super::barra_windows::mostrar_barras_agora();
    let texto = windows::core::HSTRING::from(format!("O Niko não conseguiu iniciar.\n\n{erro}\n\nSe o problema continuar, reinstale o Microsoft Edge WebView2."));
    unsafe {
        windows::Win32::UI::WindowsAndMessaging::MessageBoxW(None, &texto, windows::core::w!("Niko"), windows::Win32::UI::WindowsAndMessaging::MB_ICONERROR);
    }
    std::process::exit(1);
}

pub fn run() {
    // Com panic = "abort" o RunEvent::Exit não chega; a barra do Windows tem de voltar mesmo assim.
    let aviso_padrao = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        super::barra_windows::mostrar_barras_agora();
        aviso_padrao(info);
    }));

    let token = gerar_token();
    let escondido = std::env::args().any(|a| a == "--escondido");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Um segundo arranque automático (--escondido) não deve abrir a janela por cima do que o utilizador faz.
            if !args.iter().any(|a| a == "--escondido") {
                mostrar(app);
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--escondido"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _atalho, evento| {
                    if evento.state() == ShortcutState::Pressed {
                        mostrar(app);
                        let _ = app.emit_to("sistema", "niko://captura", ());
                    }
                })
                .build(),
        )
        .manage(Estado { areas: Mutex::new(HashMap::new()), token: token.clone(), ponte: Mutex::new(None), porta: escolher_porta() })
        .manage(super::miniaturas::Miniaturas::default())
        .invoke_handler(tauri::generate_handler![
            area_interativa,
            token_ponte,
            porta_ponte,
            mostrar_sistema,
            alternar_sistema,
            abrir_link,
            sair,
            super::barra_windows::barra_windows,
            super::barra_windows::reservar_dock,
            super::barra_windows::reservar_ilha,
            super::janela_frente::frente_cobre_tela,
            super::miniaturas::miniaturas_janelas
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            super::barra_windows::retomar(&handle);
            iniciar_ponte(&handle, &token, false);
            vigiar_ponte(handle.clone(), token.clone());

            // Sem ecrã no arranque (RDP, monitor a acordar) usa um tamanho padrão em vez de falhar.
            let monitor = app.primary_monitor().ok().flatten().or_else(|| app.available_monitors().ok()?.into_iter().next());
            let (mw, mh) = match &monitor {
                Some(m) => {
                    let escala = m.scale_factor();
                    let area = m.work_area();
                    (area.size.width as f64 / escala, area.size.height as f64 / escala)
                }
                None => (1920.0, 1040.0),
            };

            let sistema = WebviewWindowBuilder::new(app, "sistema", WebviewUrl::App("index.html".into()))
                .title("Niko")
                .decorations(false)
                .inner_size(1320.0_f64.min(mw - 40.0), 860.0_f64.min(mh - 40.0))
                .min_inner_size(960.0, 600.0)
                .background_color(tauri::window::Color(14, 14, 16, 255))
                .disable_drag_drop_handler()
                .center()
                .visible(!escondido)
                .build()?;
            let sistema_ref = sistema.clone();
            sistema.on_window_event(move |evento| {
                if let WindowEvent::CloseRequested { api, .. } = evento {
                    api.prevent_close();
                    let _ = sistema_ref.hide();
                }
            });

            super::monitores::sincronizar(&handle);
            vigiar_cursor(handle.clone());
            super::monitores::vigiar(handle.clone());
            super::sessao_windows::vigiar(handle.clone());

            let abrir = MenuItem::with_id(app, "abrir", "Abrir o Niko", true, None::<&str>)?;
            let sair_item = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair_item])?;
            let mut bandeja = TrayIconBuilder::with_id("niko").menu(&menu).show_menu_on_left_click(false).tooltip("Niko");
            if let Some(icone) = app.default_window_icon() {
                bandeja = bandeja.icon(icone.clone());
            }
            bandeja
                .on_menu_event(|app, evento| match evento.id.as_ref() {
                    "abrir" => mostrar(app),
                    "sair" => sair_salvando(app),
                    _ => {}
                })
                .on_tray_icon_event(|bandeja, evento| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                        mostrar(bandeja.app_handle());
                    }
                })
                .build(app)?;

            let _ = app.global_shortcut().register("ctrl+alt+space");
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|erro| falhar_no_arranque(&erro.to_string()));

    app.run(|handle, evento| {
        if let RunEvent::Exit = evento {
            super::barra_windows::liberar_tudo(handle);
            super::barra_windows::restaurar(handle);
            parar_ponte(handle);
        }
    });
}
