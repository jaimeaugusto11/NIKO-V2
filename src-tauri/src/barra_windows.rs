use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Mutex, Once};
use std::time::Duration;

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABE_TOP, ABM_GETSTATE, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, ABM_SETSTATE, ABS_AUTOHIDE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, FindWindowExW, FindWindowW, GetClassNameW, GetMessageW, IsWindowVisible, ShowWindow, TranslateMessage, CHILDID_SELF, EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_SHOW, MSG,
    OBJID_WINDOW, SW_HIDE, SW_SHOWNA, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WM_APP,
};

use crate::monitores::sobrepostas;
use crate::{ALTURA_DOCK, ALTURA_ILHA};

static OCULTA: AtomicBool = AtomicBool::new(false);
/// Estado da barra antes do Niko mexer nela; permite restaurá-la mesmo sem o AppHandle (num pânico, por exemplo).
static ESTADO_ORIGINAL: AtomicU32 = AtomicU32::new(u32::MAX);
/// Fica verdadeiro quando o dock pede explicitamente para ocultar ou mostrar a barra.
static DOCK_DECIDIU: AtomicBool = AtomicBool::new(false);
static VIGIAS: Once = Once::new();

/// Se o dock não responder neste tempo depois de retomar uma ocultação antiga, a barra volta: nunca fica presa escondida.
const PRAZO_DO_DOCK: Duration = Duration::from_secs(30);
/// Rede de segurança para o gancho de eventos (por exemplo, quando o Explorer reinicia e cria barras novas).
const INTERVALO_DA_VIGIA: Duration = Duration::from_millis(400);

fn arquivo_recuperacao(app: &AppHandle) -> Option<PathBuf> {
    let pasta = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&pasta);
    Some(pasta.join("barra-windows.flag"))
}

fn barras_do_windows() -> Vec<HWND> {
    let mut lista = Vec::new();
    if let Ok(principal) = unsafe { FindWindowW(w!("Shell_TrayWnd"), None) } {
        lista.push(principal);
    }
    let mut anterior: Option<HWND> = None;
    while let Ok(secundaria) = unsafe { FindWindowExW(None, anterior, w!("Shell_SecondaryTrayWnd"), None) } {
        if secundaria.is_invalid() {
            break;
        }
        lista.push(secundaria);
        anterior = Some(secundaria);
    }
    lista
}

fn dados_appbar(estado: u32) -> APPBARDATA {
    APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, lParam: LPARAM(estado as isize), ..Default::default() }
}

fn estado_da_barra() -> u32 {
    let mut dados = dados_appbar(0);
    unsafe { SHAppBarMessage(ABM_GETSTATE, &mut dados) as u32 }
}

fn definir_estado_da_barra(estado: u32) {
    let mut dados = dados_appbar(estado);
    unsafe {
        SHAppBarMessage(ABM_SETSTATE, &mut dados);
    }
}

fn garantir_ocultacao_automatica() {
    let atual = estado_da_barra();
    if atual & ABS_AUTOHIDE == 0 {
        definir_estado_da_barra(atual | ABS_AUTOHIDE);
    }
}

fn e_barra_do_windows(janela: HWND) -> bool {
    let mut classe = [0u16; 32];
    let tamanho = unsafe { GetClassNameW(janela, &mut classe) }.max(0) as usize;
    let nome = String::from_utf16_lossy(&classe[..tamanho]);
    nome == "Shell_TrayWnd" || nome == "Shell_SecondaryTrayWnd"
}

fn esconder_barras() {
    for barra in barras_do_windows() {
        if unsafe { IsWindowVisible(barra) }.as_bool() {
            let _ = unsafe { ShowWindow(barra, SW_HIDE) };
        }
    }
}

/// O Explorer volta a mostrar a barra sozinho (tecla Windows, rato no fundo do ecrã, app a piscar, notificação,
/// fim da suspensão...). O gancho apanha esse instante e esconde-a de novo antes de ela chegar a ficar à vista.
unsafe extern "system" fn ao_mostrar_janela(_gancho: HWINEVENTHOOK, _evento: u32, janela: HWND, objeto: i32, filho: i32, _thread: u32, _tempo: u32) {
    if !OCULTA.load(Ordering::SeqCst) || janela.is_invalid() || objeto != OBJID_WINDOW.0 || filho != CHILDID_SELF as i32 {
        return;
    }
    if e_barra_do_windows(janela) && unsafe { IsWindowVisible(janela) }.as_bool() {
        let _ = unsafe { ShowWindow(janela, SW_HIDE) };
    }
}

fn iniciar_vigias() {
    VIGIAS.call_once(|| {
        std::thread::spawn(|| unsafe {
            let flags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
            let mostrar = SetWinEventHook(EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW, None, Some(ao_mostrar_janela), 0, 0, flags);
            let mover = SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, None, Some(ao_mostrar_janela), 0, 0, flags);
            if mostrar.is_invalid() && mover.is_invalid() {
                return;
            }
            // Ganchos fora de contexto só disparam enquanto esta thread processa mensagens.
            let mut mensagem = MSG::default();
            while GetMessageW(&mut mensagem, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&mensagem);
                DispatchMessageW(&mensagem);
            }
        });
        std::thread::spawn(|| loop {
            std::thread::sleep(INTERVALO_DA_VIGIA);
            if OCULTA.load(Ordering::SeqCst) && !crate::encerrando() {
                // Reinícios do Explorer ou mudanças de ecrã podem desligar a ocultação automática.
                garantir_ocultacao_automatica();
                esconder_barras();
            }
        });
    });
}

/// Mostra a barra sem depender do AppHandle; usado no pânico e por `restaurar`.
pub fn mostrar_barras_agora() {
    if !OCULTA.swap(false, Ordering::SeqCst) {
        return;
    }
    let original = ESTADO_ORIGINAL.load(Ordering::SeqCst);
    if original != u32::MAX {
        definir_estado_da_barra(original & !ABS_AUTOHIDE);
    }
    for barra in barras_do_windows() {
        let _ = unsafe { ShowWindow(barra, SW_SHOWNA) };
    }
}

fn reposicionar_dock(app: &AppHandle, rotulo: &str) {
    let app = app.clone();
    let rotulo = rotulo.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        let Some(dock) = app.get_webview_window(&rotulo) else { return };
        let Ok(Some(monitor)) = dock.current_monitor() else { return };
        let escala = monitor.scale_factor();
        let (posicao, tamanho) = if OCULTA.load(Ordering::SeqCst) {
            (*monitor.position(), *monitor.size())
        } else {
            let area = monitor.work_area();
            (area.position, area.size)
        };
        let altura = (ALTURA_DOCK * escala).round() as i32;
        let _ = dock.set_size(PhysicalSize::new(tamanho.width, altura as u32));
        let _ = dock.set_position(PhysicalPosition::new(posicao.x, posicao.y + tamanho.height as i32 - altura));
    });
}

/// Quando a área de trabalho muda, o Windows empurra as janelas para dentro dela; a ilha tem de voltar ao topo do monitor.
fn reposicionar_ilha(app: &AppHandle, rotulo: &str) {
    let app = app.clone();
    let rotulo = rotulo.to_string();
    std::thread::spawn(move || {
        for espera in [300, 1200] {
            std::thread::sleep(Duration::from_millis(espera));
            let Some(ilha) = app.get_webview_window(&rotulo) else { return };
            let Ok(Some(monitor)) = ilha.current_monitor() else { return };
            let altura = (ALTURA_ILHA * monitor.scale_factor()).round() as u32;
            let _ = ilha.set_size(PhysicalSize::new(monitor.size().width, altura));
            let _ = ilha.set_position(*monitor.position());
        }
    });
}

fn reposicionar(app: &AppHandle, rotulo: &str) {
    if rotulo.starts_with("ilha") {
        reposicionar_ilha(app, rotulo);
    } else {
        reposicionar_dock(app, rotulo);
    }
}

fn reposicionar_docks(app: &AppHandle) {
    for janela in sobrepostas(app) {
        if janela.label().starts_with("dock") {
            reposicionar_dock(app, janela.label());
        }
    }
}

fn estado_guardado(app: &AppHandle) -> Option<u32> {
    arquivo_recuperacao(app).and_then(|a| std::fs::read_to_string(a).ok()).and_then(|t| t.trim().parse::<u32>().ok())
}

fn manter_oculta(original: u32) {
    ESTADO_ORIGINAL.store(original, Ordering::SeqCst);
    OCULTA.store(true, Ordering::SeqCst);
    iniciar_vigias();
    garantir_ocultacao_automatica();
    esconder_barras();
}

pub fn ocultar(app: &AppHandle) {
    DOCK_DECIDIU.store(true, Ordering::SeqCst);
    if OCULTA.load(Ordering::SeqCst) {
        return;
    }
    // O arquivo guarda o estado de antes do Niko; se já existe, a barra atual pode estar alterada por nós.
    let original = match estado_guardado(app) {
        Some(guardado) => guardado,
        None => {
            let atual = estado_da_barra();
            if let Some(arquivo) = arquivo_recuperacao(app) {
                let _ = std::fs::write(&arquivo, atual.to_string());
            }
            atual
        }
    };
    manter_oculta(original);
    reposicionar_docks(app);
}

pub fn restaurar(app: &AppHandle) {
    if let Some(original) = estado_guardado(app) {
        if !OCULTA.load(Ordering::SeqCst) {
            ESTADO_ORIGINAL.store(original, Ordering::SeqCst);
            OCULTA.store(true, Ordering::SeqCst);
        }
    }
    if !OCULTA.load(Ordering::SeqCst) {
        return;
    }
    mostrar_barras_agora();
    if let Some(arquivo) = arquivo_recuperacao(app) {
        let _ = std::fs::remove_file(arquivo);
    }
    reposicionar_docks(app);
}

/// No arranque: se o Niko fechou sem restaurar a barra (queda, atualização, desligar o PC), ela continua escondida
/// em vez de aparecer e sumir quando o dock carregar. Se o dock não confirmar a tempo, a barra volta.
pub fn retomar(app: &AppHandle) {
    let Some(original) = estado_guardado(app) else { return };
    manter_oculta(original);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(PRAZO_DO_DOCK);
        if !DOCK_DECIDIU.load(Ordering::SeqCst) {
            restaurar(&app);
        }
    });
}

const ALTURA_RESERVADA_DOCK: f64 = 62.0;
const ALTURA_MAXIMA_RESERVADA: f64 = 120.0;

/// Faixas reservadas por janela (rótulo → altura em pixels lógicos): a ilha no topo e o dock na base do seu monitor.
static RESERVAS: Mutex<Option<HashMap<String, f64>>> = Mutex::new(None);

fn com_reservas<T>(f: impl FnOnce(&mut HashMap<String, f64>) -> T) -> T {
    let mut guarda = RESERVAS.lock().unwrap_or_else(|e| e.into_inner());
    f(guarda.get_or_insert_with(HashMap::new))
}

fn dados_da_appbar(janela: &WebviewWindow) -> Option<(APPBARDATA, tauri::Monitor)> {
    let hwnd = janela.hwnd().ok()?;
    let monitor = janela.current_monitor().ok()??;
    let topo = janela.label().starts_with("ilha");
    let dados = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: HWND(hwnd.0),
        uCallbackMessage: WM_APP + if topo { 0x4f } else { 0x4e },
        uEdge: if topo { ABE_TOP } else { ABE_BOTTOM },
        ..Default::default()
    };
    Some((dados, monitor))
}

/// Põe em série as mudanças de reserva: o dock, a ilha e o vigia de monitores mexem nelas a partir de threads
/// diferentes. Nunca é pedida na thread principal enquanto outra thread a segura (os comandos são assíncronos),
/// porque `reservar_sem_fila` chama métodos de janela que esperam pela thread principal.
static FILA_DAS_RESERVAS: Mutex<()> = Mutex::new(());

fn em_fila<T>(f: impl FnOnce() -> T) -> T {
    let _vez = FILA_DAS_RESERVAS.lock().unwrap_or_else(|e| e.into_inner());
    f()
}

/// Reserva (ou libera, com `None`) a faixa da janela no seu monitor: janelas maximizadas deixam de passar por baixo dela.
pub fn reservar_espaco(app: &AppHandle, rotulo: &str, altura: Option<f64>) {
    em_fila(|| reservar_sem_fila(app, rotulo, altura));
}

fn reservar_sem_fila(app: &AppHandle, rotulo: &str, altura: Option<f64>) {
    let Some(janela) = app.get_webview_window(rotulo) else { return };
    let Some((mut dados, monitor)) = dados_da_appbar(&janela) else { return };
    let Some(altura) = altura.filter(|a| *a > 0.0) else {
        if com_reservas(|r| r.remove(rotulo)).is_some() {
            unsafe {
                SHAppBarMessage(ABM_REMOVE, &mut dados);
            }
            reposicionar(app, rotulo);
        }
        return;
    };
    if com_reservas(|r| r.insert(rotulo.to_string(), altura)).is_none() {
        unsafe {
            SHAppBarMessage(ABM_NEW, &mut dados);
        }
    }
    let fisica = (altura.min(ALTURA_MAXIMA_RESERVADA) * monitor.scale_factor()).round() as i32;
    let posicao = monitor.position();
    let tamanho = monitor.size();
    let (esquerda, direita) = (posicao.x, posicao.x + tamanho.width as i32);
    let topo = dados.uEdge == ABE_TOP;
    dados.rc = if topo {
        RECT { left: esquerda, top: posicao.y, right: direita, bottom: posicao.y + fisica }
    } else {
        let base = posicao.y + tamanho.height as i32;
        RECT { left: esquerda, top: base - fisica, right: direita, bottom: base }
    };
    unsafe {
        SHAppBarMessage(ABM_QUERYPOS, &mut dados);
        if topo {
            dados.rc.bottom = dados.rc.top + fisica;
        } else {
            dados.rc.top = dados.rc.bottom - fisica;
        }
        SHAppBarMessage(ABM_SETPOS, &mut dados);
    }
    reposicionar(app, rotulo);
}

pub fn liberar(app: &AppHandle, rotulo: &str) {
    reservar_espaco(app, rotulo, None);
}

/// Chamado na thread principal ao sair: não espera pela fila (outra thread pode estar à espera da thread principal).
pub fn liberar_tudo(app: &AppHandle) {
    let _vez = FILA_DAS_RESERVAS.try_lock();
    for rotulo in com_reservas(|r| r.keys().cloned().collect::<Vec<_>>()) {
        reservar_sem_fila(app, &rotulo, None);
    }
}

/// Depois de monitores mudarem (ou de o Explorer reiniciar), as reservas e os tamanhos de todas as sobrepostas são refeitos.
pub fn reacomodar_sobrepostas(app: &AppHandle) {
    let reservas = em_fila(|| {
        let reservas = com_reservas(|r| r.clone());
        for (rotulo, altura) in &reservas {
            reservar_sem_fila(app, rotulo, None);
            reservar_sem_fila(app, rotulo, Some(*altura));
        }
        reservas
    });
    for janela in sobrepostas(app) {
        if !reservas.contains_key(janela.label()) {
            reposicionar(app, janela.label());
        }
    }
}

#[tauri::command(async)]
pub fn reservar_dock(janela: WebviewWindow, reservar: bool) {
    reservar_espaco(janela.app_handle(), janela.label(), reservar.then_some(ALTURA_RESERVADA_DOCK));
}

#[tauri::command(async)]
pub fn reservar_ilha(janela: WebviewWindow, reservar: bool, altura: f64) {
    reservar_espaco(janela.app_handle(), janela.label(), reservar.then_some(altura));
}

#[tauri::command(async)]
pub fn barra_windows(app: AppHandle, ocultar_barra: bool) {
    if ocultar_barra {
        ocultar(&app);
    } else {
        DOCK_DECIDIU.store(true, Ordering::SeqCst);
        restaurar(&app);
    }
}
