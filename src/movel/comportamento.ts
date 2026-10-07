import { useEffect } from "react";
import { AGENTES, useAgentes } from "../estado/agentes";
import { useIlha } from "../estado/ilha";
import { useInterface } from "../estado/interface";
import { useRotina } from "../estado/rotina";
import { tocarSom } from "../ponte/sons";
import { hojeISO } from "../utilitarios/datas";
import { T } from "../textos/textos";
import type { AgenteId } from "../tipos";

const AUSENCIA_PARA_SAUDAR_MS = 20 * 60000;

function tarefasDeHoje(): number {
  const hoje = hojeISO();
  return useRotina.getState().tarefas.filter((t) => t.status !== "concluida" && t.status !== "cancelada" && Boolean(t.data) && (t.data as string) <= hoje).length;
}

function agenteDoChat(): AgenteId {
  const pedido = useInterface.getState().parametros.agente as AgenteId | undefined;
  return pedido && AGENTES.includes(pedido) ? pedido : "organizador";
}

function campoDoChat(alvo: EventTarget | null): boolean {
  return alvo instanceof HTMLElement && alvo.matches("textarea, input") && Boolean(alvo.closest(".chat"));
}

/** O time reage ao uso do celular: acorda quando você volta e escuta enquanto você escreve no chat. */
export function usarComportamentoMovel() {
  useEffect(() => {
    let saiuEm = 0;
    const aoMudar = () => {
      if (document.hidden) {
        saiuEm = Date.now();
        return;
      }
      if (!saiuEm || Date.now() - saiuEm < AUSENCIA_PARA_SAUDAR_MS) return;
      saiuEm = 0;
      const agentes = useAgentes.getState();
      const dormiam = AGENTES.some((a) => agentes.dormindo[a]);
      AGENTES.forEach((a) => agentes.acordar(a));
      void tocarSom(dormiam ? "yawn" : "greet", "personagens");
      useIlha.getState().revelar({ texto: T.movel.voltou(tarefasDeHoje()), tipo: "info", agente: "organizador", aba: "hoje" }, 4200, "alta");
    };

    let ouvindo: AgenteId | null = null;
    const pararDeOuvir = () => {
      if (ouvindo) useAgentes.getState().ouvir(ouvindo, false);
      ouvindo = null;
    };
    const aoFocar = (e: FocusEvent) => {
      if (!campoDoChat(e.target)) return;
      pararDeOuvir();
      ouvindo = agenteDoChat();
      useAgentes.getState().ouvir(ouvindo, true);
    };
    const aoDesfocar = (e: FocusEvent) => {
      if (campoDoChat(e.target)) pararDeOuvir();
    };

    document.addEventListener("visibilitychange", aoMudar);
    document.addEventListener("focusin", aoFocar);
    document.addEventListener("focusout", aoDesfocar);
    return () => {
      pararDeOuvir();
      document.removeEventListener("visibilitychange", aoMudar);
      document.removeEventListener("focusin", aoFocar);
      document.removeEventListener("focusout", aoDesfocar);
    };
  }, []);
}
