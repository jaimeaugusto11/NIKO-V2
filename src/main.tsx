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
import { LimiteDeErro } from "./desktop/LimiteDeErro";
import { T } from "./textos/textos";

document.documentElement.dataset.tema = "claro";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mostrarFalhaDaPonte(raiz: HTMLElement) {
  raiz.innerHTML = `<div class="falha-ponte"><h1>${T.app.ponteFalhou}</h1><p>${T.app.ponteFalhouDica}</p><p><button type="button" class="botao botao-primario">${T.app.tentarDeNovo}</button></p></div>`;
  raiz.querySelector("button")?.addEventListener("click", () => window.location.reload());
  // Continua a sondar; quando a ponte responder, recomeça do zero.
  const sondar = async () => {
    if ((await iniciarArmazenamento()) === "banco") window.location.reload();
    else window.setTimeout(() => void sondar(), 5000);
  };
  window.setTimeout(() => void sondar(), 5000);
}

async function iniciar() {
  const sobreposta = JANELA === "ilha" || JANELA === "dock";
  if (sobreposta) document.documentElement.classList.add("janela-sobreposta");
  await prepararPonte();
  desviarLinksExternos();
  let modo = "local";
  const tentativas = NATIVO && !MOVEL ? (sobreposta ? Infinity : 120) : 1;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    modo = await iniciarArmazenamento();
    if (modo === "banco" || tentativa === tentativas) break;
    // A ilha e o dock não têm onde mostrar o erro: esperam pela ponte o tempo que for preciso.
    await esperar(sobreposta ? Math.min(500 * 2 ** Math.min(tentativa - 1, 5), 10000) : 500);
  }
  const raiz = document.getElementById("raiz");
  if (!raiz) return;
  if (NATIVO && !MOVEL && modo !== "banco") {
    if (JANELA === "sistema") mostrarFalhaDaPonte(raiz);
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
  createRoot(raiz, {
    onUncaughtError: (erro, info) => console.error("Erro não tratado na interface", erro, info.componentStack),
    onCaughtError: (erro, info) => console.error("Erro apanhado na interface", erro, info.componentStack),
  }).render(
    <StrictMode>
      <LimiteDeErro tipo={NATIVO && sobreposta ? "sobreposta" : "sistema"}>
        <Raiz />
      </LimiteDeErro>
    </StrictMode>,
  );
  if (!NATIVO && import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
  }
}

void iniciar();
