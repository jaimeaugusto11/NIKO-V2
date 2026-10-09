use std::sync::OnceLock;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Shutdown::{ShutdownBlockReasonCreate, ShutdownBlockReasonDestroy};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW, TranslateMessage, MSG, WINDOW_EX_STYLE, WM_ENDSESSION, WM_QUERYENDSESSION, WNDCLASSW, WS_OVERLAPPED,
};

/// Tempo dado às janelas para gravarem o que está pendente antes de o Windows terminar a sessão.
const ESPERA_PARA_SALVAR: Duration = Duration::from_millis(900);

static APP: OnceLock<AppHandle> = OnceLock::new();

unsafe extern "system" fn ao_receber(janela: HWND, mensagem: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match mensagem {
        WM_QUERYENDSESSION => {
            // O tao só trata WM_ENDSESSION e sai logo; aqui as janelas ainda podem gravar.
            if let Some(app) = APP.get() {
                let _ = unsafe { ShutdownBlockReasonCreate(janela, w!("O Niko está a guardar os seus dados")) };
                let _ = app.emit("niko://saindo", ());
                std::thread::sleep(ESPERA_PARA_SALVAR);
            }
            LRESULT(1)
        }
        WM_ENDSESSION => {
            let _ = unsafe { ShutdownBlockReasonDestroy(janela) };
            if wparam.0 != 0 {
                crate::barra_windows::mostrar_barras_agora();
            }
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(janela, mensagem, wparam, lparam) },
    }
}

/// Janela oculta de nível superior (janelas só de mensagens não recebem os avisos de fim de sessão).
pub fn vigiar(app: AppHandle) {
    if APP.set(app).is_err() {
        return;
    }
    std::thread::spawn(|| unsafe {
        let Ok(modulo) = GetModuleHandleW(None) else { return };
        let classe = WNDCLASSW { lpfnWndProc: Some(ao_receber), hInstance: modulo.into(), lpszClassName: w!("NikoSessao"), ..Default::default() };
        if RegisterClassW(&classe) == 0 {
            return;
        }
        let Ok(_janela) = CreateWindowExW(WINDOW_EX_STYLE(0), w!("NikoSessao"), w!("Niko"), WS_OVERLAPPED, 0, 0, 0, 0, None, None, Some(modulo.into()), None) else { return };
        let mut mensagem = MSG::default();
        while GetMessageW(&mut mensagem, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&mensagem);
            DispatchMessageW(&mensagem);
        }
    });
}
