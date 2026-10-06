use std::time::Duration;

use tauri::{AppHandle, Manager, Monitor, WebviewWindow};

use crate::{barra_windows, ALTURA_DOCK, ALTURA_ILHA};

const INTERVALO: Duration = Duration::from_secs(2);

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

/// Garante uma ilha e um dock em cada monitor ligado e fecha os de monitores desligados.
pub fn sincronizar(app: &AppHandle) {
    let Ok(monitores) = app.available_monitors() else { return };
    let principal = app.primary_monitor().ok().flatten();
    let mut desejados: Vec<String> = Vec::new();
    let mut mudou = false;
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
    for janela in sobrepostas(app) {
        let rotulo = janela.label().to_string();
        if !desejados.contains(&rotulo) {
            barra_windows::liberar(app, &rotulo);
            let _ = janela.destroy();
            mudou = true;
        }
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
