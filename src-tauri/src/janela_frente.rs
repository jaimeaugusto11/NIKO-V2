use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsZoomed};

const CLASSES_DO_SHELL: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

#[derive(Serialize, Default, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TipoDaFrente {
    #[default]
    AreaDeTrabalho,
    Sobreposta,
    App,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDaFrente {
    cobre: bool,
    tela_cheia: bool,
    maximizada: bool,
    invade_topo: bool,
    frente: TipoDaFrente,
    #[serde(skip)]
    noutro_monitor: bool,
}

/// Zona central do topo do monitor principal ocupada pela ilha, em pixels físicos.
#[derive(Deserialize, Clone, Copy)]
pub struct ZonaDoTopo {
    largura: f64,
    altura: f64,
}

fn windows_em_tela_cheia() -> bool {
    match unsafe { SHQueryUserNotificationState() } {
        Ok(estado) => estado == QUNS_RUNNING_D3D_FULL_SCREEN || estado == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

unsafe fn retangulo_cobre_monitor(janela: HWND, monitor: HMONITOR) -> bool {
    let mut retangulo = RECT::default();
    if GetWindowRect(janela, &mut retangulo).is_err() {
        return false;
    }
    let Some(tela) = retangulo_do_monitor(monitor) else {
        return false;
    };
    retangulo.left <= tela.left && retangulo.top <= tela.top && retangulo.right >= tela.right && retangulo.bottom >= tela.bottom
}

unsafe fn retangulo_do_monitor(monitor: HMONITOR) -> Option<RECT> {
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    GetMonitorInfoW(monitor, &mut info).as_bool().then_some(info.rcMonitor)
}

/// Retângulo visível da janela: GetWindowRect inclui as bordas invisíveis de redimensionamento do Windows 10/11.
unsafe fn retangulo_visivel(janela: HWND) -> Option<RECT> {
    let mut retangulo = RECT::default();
    let tamanho = std::mem::size_of::<RECT>() as u32;
    if DwmGetWindowAttribute(janela, DWMWA_EXTENDED_FRAME_BOUNDS, &mut retangulo as *mut RECT as *mut core::ffi::c_void, tamanho).is_ok() {
        return Some(retangulo);
    }
    let mut retangulo = RECT::default();
    GetWindowRect(janela, &mut retangulo).ok().map(|_| retangulo)
}

unsafe fn invade_zona_do_topo(janela: HWND, monitor: HMONITOR, zona: ZonaDoTopo) -> bool {
    match (retangulo_visivel(janela), retangulo_do_monitor(monitor)) {
        (Some(janela), Some(tela)) => retangulo_invade_zona(janela, tela, zona),
        _ => false,
    }
}

fn retangulo_invade_zona(janela: RECT, tela: RECT, zona: ZonaDoTopo) -> bool {
    let centro = (tela.left + tela.right) / 2;
    let meia = (zona.largura / 2.0).round() as i32;
    let (esquerda, direita, topo, base) = (centro - meia, centro + meia, tela.top, tela.top + zona.altura.round() as i32);
    janela.left < direita && janela.right > esquerda && janela.top < base && janela.bottom > topo
}

fn e_janela_do_sistema(app: &AppHandle, janela: HWND) -> bool {
    app.get_webview_window("sistema").and_then(|j| j.hwnd().ok()).map(|h| h.0 == janela.0).unwrap_or(false)
}

unsafe fn ler_janela_da_frente(app: &AppHandle, monitor_da_sobreposta: HMONITOR, zona: Option<ZonaDoTopo>) -> EstadoDaFrente {
    let frente = GetForegroundWindow();
    if frente.is_invalid() {
        return EstadoDaFrente::default();
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(frente, Some(&mut pid));
    if pid == std::process::id() {
        if e_janela_do_sistema(app, frente) {
            return EstadoDaFrente { frente: TipoDaFrente::App, maximizada: IsZoomed(frente).as_bool(), ..Default::default() };
        }
        return EstadoDaFrente { frente: TipoDaFrente::Sobreposta, ..Default::default() };
    }
    let mut classe = [0u16; 64];
    let tamanho = GetClassNameW(frente, &mut classe).max(0) as usize;
    let nome = String::from_utf16_lossy(&classe[..tamanho]);
    if CLASSES_DO_SHELL.contains(&nome.as_str()) {
        return EstadoDaFrente::default();
    }
    let monitor = MonitorFromWindow(frente, MONITOR_DEFAULTTONEAREST);
    if monitor != monitor_da_sobreposta {
        return EstadoDaFrente { frente: TipoDaFrente::App, noutro_monitor: true, ..Default::default() };
    }
    let maximizada = IsZoomed(frente).as_bool();
    let cobre_monitor = retangulo_cobre_monitor(frente, monitor);
    let invade_topo = zona.map(|z| invade_zona_do_topo(frente, monitor, z)).unwrap_or(false);
    EstadoDaFrente { cobre: maximizada || cobre_monitor, tela_cheia: !maximizada && cobre_monitor, maximizada, invade_topo, frente: TipoDaFrente::App, noutro_monitor: false }
}

#[tauri::command]
pub fn frente_cobre_tela(app: AppHandle, sobreposta: WebviewWindow, zona: Option<ZonaDoTopo>) -> EstadoDaFrente {
    let Ok(hwnd) = sobreposta.hwnd() else {
        return EstadoDaFrente::default();
    };
    let monitor = unsafe { MonitorFromWindow(HWND(hwnd.0), MONITOR_DEFAULTTONEAREST) };
    let janela = unsafe { ler_janela_da_frente(&app, monitor, zona) };
    // O aviso de tela cheia do Windows é global; só conta quando o app em tela cheia está no monitor desta sobreposta.
    let tela_cheia = janela.tela_cheia || (!janela.noutro_monitor && windows_em_tela_cheia());
    EstadoDaFrente {
        cobre: janela.cobre || tela_cheia,
        tela_cheia,
        maximizada: janela.maximizada,
        invade_topo: janela.invade_topo || tela_cheia,
        frente: if tela_cheia { TipoDaFrente::App } else { janela.frente },
        noutro_monitor: janela.noutro_monitor,
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    const TELA: RECT = RECT { left: 0, top: 0, right: 1920, bottom: 1080 };
    const ZONA: ZonaDoTopo = ZonaDoTopo { largura: 660.0, altura: 36.0 };

    fn janela(left: i32, top: i32, right: i32, bottom: i32) -> RECT {
        RECT { left, top, right, bottom }
    }

    #[test]
    fn janela_maximizada_ou_encaixada_no_topo_invade() {
        assert!(retangulo_invade_zona(janela(0, 0, 1920, 1040), TELA, ZONA));
        assert!(retangulo_invade_zona(janela(0, 0, 960, 1040), TELA, ZONA));
        assert!(retangulo_invade_zona(janela(960, 0, 1920, 1040), TELA, ZONA));
    }

    #[test]
    fn janela_abaixo_da_faixa_ou_ao_lado_da_ilha_nao_invade() {
        assert!(!retangulo_invade_zona(janela(0, 36, 1920, 1040), TELA, ZONA));
        assert!(!retangulo_invade_zona(janela(200, 300, 900, 800), TELA, ZONA));
        assert!(!retangulo_invade_zona(janela(0, 0, 500, 600), TELA, ZONA));
        assert!(!retangulo_invade_zona(janela(1400, 0, 1920, 600), TELA, ZONA));
    }

    #[test]
    fn considera_monitor_que_nao_comeca_na_origem() {
        let tela = RECT { left: -1920, top: 0, right: 0, bottom: 1080 };
        assert!(retangulo_invade_zona(janela(-1500, 10, -400, 900), tela, ZONA));
        assert!(!retangulo_invade_zona(janela(-1500, 10, -1300, 900), tela, ZONA));
    }
}
