use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, Monitor, WebviewWindow};
use windows::core::w;
use windows::Win32::UI::WindowsAndMessaging::FindWindowW;

use crate::{barra_windows, ALTURA_DOCK, ALTURA_ILHA};

const INTERVALO: Duration = Duration::from_secs(2);
/// Ciclos seguidos sem o monitor antes de fechar as suas janelas. Ao acordar da suspensão, num reset do driver
/// de vídeo ou ao ligar por RDP o Windows chega a listar zero ou só parte dos monitores por instantes.
const CICLOS_ATE_REMOVER: u8 = 3;

#[derive(Default)]
struct Memoria {
    /// Ciclos seguidos em que cada sobreposta ficou sem monitor.
    ausencias: HashMap<String, u8>,
    /// Escala de cada monitor (por posição) no último ciclo: mudar a escala não muda posição nem tamanho físicos.
    escalas: HashMap<(i32, i32), u32>,
    /// Janela da barra do Explorer: quando muda, o Explorer reiniciou e esqueceu as faixas reservadas.
    explorer: isize,
}

static MEMORIA: Mutex<Option<Memoria>> = Mutex::new(None);

fn com_memoria<T>(f: impl FnOnce(&mut Memoria) -> T) -> T {
    let mut guarda = MEMORIA.lock().unwrap_or_else(|e| e.into_inner());
    f(guarda.get_or_insert_with(Memoria::default))
}

/// A ilha e o dock existem em cada monitor, como a barra de tarefas do Windows. As do monitor principal
/// se chamam "ilha" e "dock"; as dos outros levam a posição do monitor no rótulo.
pub fn e_sobreposta(rotulo: &str) -> bool {
    rotulo == "ilha" || rotulo == "dock" || rotulo.starts_with("ilha-") || rotulo.starts_with("dock-")
}

pub fn sobrepostas(app: &AppHandle) -> Vec<WebviewWindow> {
    app.webview_windows().into_iter().filter(|(rotulo, _)| e_sobreposta(rotulo)).map(|(_, janela)| janela).collect()
}

fn mesmo_monitor(a: &Monitor, b: &Monitor) -> bool {
    a.position() == b.position() && a.size() == b.size()
}

fn rotulos(monitor: &Monitor, principal: bool) -> [String; 2] {
    if principal {
        return ["ilha".into(), "dock".into()];
    }
    let p = monitor.position();
    let sufixo = format!("m{}_{}", p.x, p.y).replace('-', "n");
    [format!("ilha-{sufixo}"), format!("dock-{sufixo}")]
}

fn criar(app: &AppHandle, rotulo: &str, monitor: &Monitor) -> Option<WebviewWindow> {
    let escala = monitor.scale_factor();
    let p = monitor.position();
    let altura = if rotulo.starts_with("ilha") { ALTURA_ILHA } else { ALTURA_DOCK };
    let janela = crate::criar_sobreposta(app, rotulo, p.y as f64 / escala, p.x as f64 / escala, monitor.size().width as f64 / escala, altura).ok()?;
    let _ = janela.set_position(*p);
    let _ = janela.set_ignore_cursor_events(true);
    Some(janela)
}

fn escalas_mudaram(monitores: &[Monitor]) -> bool {
    let atuais: HashMap<(i32, i32), u32> = monitores.iter().map(|m| ((m.position().x, m.position().y), (m.scale_factor() * 100.0).round() as u32)).collect();
    com_memoria(|m| {
        let mudou = m.escalas.iter().any(|(posicao, escala)| atuais.get(posicao).is_some_and(|nova| nova != escala));
        m.escalas = atuais;
        mudou
    })
}

fn explorer_reiniciou() -> bool {
    let atual = unsafe { FindWindowW(w!("Shell_TrayWnd"), None) }.map(|h| h.0 as isize).unwrap_or(0);
    if atual == 0 {
        return false;
    }
    com_memoria(|m| {
        let anterior = std::mem::replace(&mut m.explorer, atual);
        anterior != 0 && anterior != atual
    })
}

/// Garante uma ilha e um dock em cada monitor ligado e fecha os de monitores desligados.
pub fn sincronizar(app: &AppHandle) {
    let Ok(monitores) = app.available_monitors() else { return };
    if monitores.is_empty() {
        return;
    }
    let principal = app.primary_monitor().ok().flatten();
    let mut desejados: Vec<String> = Vec::new();
    let mut mudou = escalas_mudaram(&monitores);
    for monitor in &monitores {
        let e_principal = principal.as_ref().map(|p| mesmo_monitor(p, monitor)).unwrap_or(desejados.is_empty());
        for rotulo in rotulos(monitor, e_principal) {
            match app.get_webview_window(&rotulo) {
                Some(janela) => {
                    // O monitor principal pode mudar nas definições do Windows; "ilha" e "dock" acompanham.
                    let no_lugar = janela.current_monitor().ok().flatten().map(|m| mesmo_monitor(&m, monitor)).unwrap_or(true);
                    if !no_lugar {
                        let _ = janela.set_position(*monitor.position());
                        mudou = true;
                    }
                }
                None => {
                    if criar(app, &rotulo, monitor).is_some() {
                        mudou = true;
                    }
                }
            }
            desejados.push(rotulo);
        }
    }
    com_memoria(|m| m.ausencias.retain(|rotulo, _| !desejados.contains(rotulo)));
    for janela in sobrepostas(app) {
        let rotulo = janela.label().to_string();
        if desejados.contains(&rotulo) {
            continue;
        }
        let ciclos = com_memoria(|m| {
            let contagem = m.ausencias.entry(rotulo.clone()).or_insert(0);
            *contagem += 1;
            *contagem
        });
        if ciclos < CICLOS_ATE_REMOVER {
            continue;
        }
        com_memoria(|m| m.ausencias.remove(&rotulo));
        barra_windows::liberar(app, &rotulo);
        crate::esquecer_sobreposta(app, &rotulo);
        let _ = janela.destroy();
        mudou = true;
    }
    if explorer_reiniciou() {
        mudou = true;
    }
    if mudou {
        std::thread::sleep(Duration::from_millis(150));
        barra_windows::reacomodar_sobrepostas(app);
    }
}

pub fn vigiar(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(INTERVALO);
        if crate::encerrando() {
            return;
        }
        sincronizar(&app);
    });
}
