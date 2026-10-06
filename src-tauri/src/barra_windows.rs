use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABE_TOP, ABM_GETSTATE, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, ABM_SETSTATE, ABS_AUTOHIDE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, FindWindowW, IsWindowVisible, ShowWindow, SW_HIDE, SW_SHOWNA, WM_APP};

use crate::monitores::sobrepostas;
use crate::{ALTURA_DOCK, ALTURA_ILHA};

static OCULTA: AtomicBool = AtomicBool::new(false);

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

fn esconder_barras() {
    for barra in barras_do_windows() {
        if unsafe { IsWindowVisible(barra) }.as_bool() {
            let _ = unsafe { ShowWindow(barra, SW_HIDE) };
        }
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

fn vigiar_barra() {
    std::thread::spawn(|| {
        while OCULTA.load(Ordering::SeqCst) {
            esconder_barras();
            std::thread::sleep(Duration::from_millis(1000));
        }
    });
}

pub fn ocultar(app: &AppHandle) {
    if OCULTA.swap(true, Ordering::SeqCst) {
        return;
    }
    let original = estado_da_barra();
    if let Some(arquivo) = arquivo_recuperacao(app) {
        if !arquivo.exists() {
            let _ = std::fs::write(&arquivo, original.to_string());
        }
    }
    definir_estado_da_barra(original | ABS_AUTOHIDE);
    esconder_barras();
    vigiar_barra();
    reposicionar_docks(app);
}

pub fn restaurar(app: &AppHandle) {
    let arquivo = arquivo_recuperacao(app);
    let guardado = arquivo.as_ref().and_then(|a| std::fs::read_to_string(a).ok()).and_then(|t| t.trim().parse::<u32>().ok());
    let estava_oculta = OCULTA.swap(false, Ordering::SeqCst);
    if guardado.is_none() && !estava_oculta {
        return;
    }
    if let Some(original) = guardado {
        definir_estado_da_barra(original & !ABS_AUTOHIDE);
    }
    for barra in barras_do_windows() {
        let _ = unsafe { ShowWindow(barra, SW_SHOWNA) };
    }
    if let Some(arquivo) = arquivo {
        let _ = std::fs::remove_file(arquivo);
    }
    reposicionar_docks(app);
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

/// Reserva (ou libera, com `None`) a faixa da janela no seu monitor: janelas maximizadas deixam de passar por baixo dela.
pub fn reservar_espaco(app: &AppHandle, rotulo: &str, altura: Option<f64>) {
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

pub fn liberar_tudo(app: &AppHandle) {
    for rotulo in com_reservas(|r| r.keys().cloned().collect::<Vec<_>>()) {
        liberar(app, &rotulo);
    }
}

/// Depois de monitores mudarem, as reservas e os tamanhos de todas as sobrepostas são refeitos.
pub fn reacomodar_sobrepostas(app: &AppHandle) {
    let reservas = com_reservas(|r| r.clone());
    for (rotulo, altura) in &reservas {
        liberar(app, rotulo);
        reservar_espaco(app, rotulo, Some(*altura));
    }
    for janela in sobrepostas(app) {
        if !reservas.contains_key(janela.label()) {
            reposicionar(app, janela.label());
        }
    }
}

#[tauri::command]
pub fn reservar_dock(janela: WebviewWindow, reservar: bool) {
    reservar_espaco(janela.app_handle(), janela.label(), reservar.then_some(ALTURA_RESERVADA_DOCK));
}

#[tauri::command]
pub fn reservar_ilha(janela: WebviewWindow, reservar: bool, altura: f64) {
    reservar_espaco(janela.app_handle(), janela.label(), reservar.then_some(altura));
}

#[tauri::command]
pub fn barra_windows(app: AppHandle, ocultar_barra: bool) {
    if ocultar_barra {
        ocultar(&app);
    } else {
        restaurar(&app);
    }
}
