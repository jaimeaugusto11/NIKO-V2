import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./estilos/tokens.css";
import "./estilos/base.css";
import "./estilos/componentes.css";
import "./estilos/sistema.css";
import "./estilos/modulos.css";
import { iniciarArmazenamento } from "./ponte/armazenamento";
import { JANELA, MOVEL, NATIVO, prepararPonte, desviarLinksExternos } from "./desktop/desktop";
import { T } from "./textos/textos";

document.documentElement.dataset.tema = "claro";

async function iniciar() {
  if (JANELA === "ilha" || JANELA === "dock") document.documentElement.classList.add("janela-sobreposta");
  await prepararPonte();
  desviarLinksExternos();
  let modo = "local";
  const tentativas = NATIVO && !MOVEL ? 120 : 1;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    modo = await iniciarArmazenamento();
    if (modo === "banco" || tentativa === tentativas) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const raiz = document.getElementById("raiz");
  if (!raiz) return;
  if (NATIVO && !MOVEL && modo !== "banco") {
    if (JANELA !== "sistema") return;
    raiz.innerHTML = `<div class="falha-ponte"><h1>${T.app.ponteFalhou}</h1><p>${T.app.ponteFalhouDica}</p></div>`;
    return;
  }
  let Raiz: () => React.ReactElement;
  const siteMovel = MOVEL || (import.meta.env.PROD && !NATIVO);
  if (siteMovel) Raiz = (await import("./movel/AppMovel")).AppMovel;
  else if (!NATIVO) Raiz = (await import("./janelas/area-de-trabalho/AreaDeTrabalho")).AreaDeTrabalho;
  else {
    const apps = await import("./desktop/Aplicativos");
    Raiz = JANELA === "ilha" ? apps.AppIlha : JANELA === "dock" ? apps.AppDock : apps.AppSistema;
  }
  createRoot(raiz).render(
    <StrictMode>
      <Raiz />
    </StrictMode>,
  );
  if (!NATIVO && import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
  }
}

void iniciar();
