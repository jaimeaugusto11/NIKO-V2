#[cfg(windows)]
mod barra_windows;
#[cfg(windows)]
mod janela_frente;
#[cfg(windows)]
mod miniaturas;
#[cfg(windows)]
mod monitores;
#[cfg(windows)]
mod sessao_windows;

#[cfg(windows)]
mod ambiente_desktop;
#[cfg(windows)]
pub(crate) use ambiente_desktop::{criar_sobreposta, encerrando, esquecer_sobreposta, ALTURA_DOCK, ALTURA_ILHA};

#[cfg(target_os = "android")]
mod ambiente_movel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    ambiente_desktop::run();

    #[cfg(target_os = "android")]
    ambiente_movel::run();
}
