import { useEffect } from "react";
import { claudeCode, ouvirClaudeCode, type EventoClaude } from "../../../ponte/claudeCode";
import { frenteCobreAIlha, frenteEmTelaCheia, notificarWindows } from "../../../desktop/desktop";
import { useClaudeCode } from "../../../estado/claudeCode";
import { useIlha } from "../../../estado/ilha";
import { useConfig } from "../../../estado/configuracoes";
import { tocarSom } from "../../../ponte/sons";
import { T } from "../../../textos/textos";
import { abaLigada } from "../../../utilitarios/funcoes";

const TOLERANCIA_MS = 1500;

export function claudeNaIlha(): boolean {
  const { ilha, claudeInstalado, funcoesDesligadas } = useConfig.getState();
  return ilha.ativa && ilha.blocos.claude && ilha.ordemAbas.includes("claude") && claudeInstalado && abaLigada("claude", funcoesDesligadas);
}

async function notificarSeEscondida(corpo: string) {
  const cfg = useConfig.getState();
  if (!cfg.notificarClaude || cfg.naoPerturbe) return;
  const ilha = useIlha.getState();
  if (ilha.estado === "expandida" && ilha.aba === "claude") return;
  if (ilha.estado !== "escondida" && !(await frenteCobreAIlha())) return;
  await notificarWindows(T.app.nome, corpo);
}

function devolverAoTerminal(pedidoId: string) {
  useClaudeCode.getState().removerPedido(pedidoId);
  void claudeCode.decidir(pedidoId, "terminal").catch(() => undefined);
}

export function devolverPendentesAoTerminal() {
  for (const p of useClaudeCode.getState().pedidos) devolverAoTerminal(p.pedidoId);
}

function reagir(e: EventoClaude) {
  const estado = useClaudeCode.getState();
  const sessao = estado.sessoes[e.sessao];
  const projeto = sessao?.projeto ?? "";
  const silencio = useConfig.getState().naoPerturbe;
  const ilha = useIlha.getState();
  switch (e.evento) {
    case "PermissionRequest": {
      const pedidoId = e.pedidoId;
      if (!pedidoId) return;
      if (!claudeNaIlha()) {
        devolverAoTerminal(pedidoId);
        return;
      }
      void frenteEmTelaCheia().then((cheia) => {
        if (cheia) {
          devolverAoTerminal(pedidoId);
          return;
        }
        if (!useClaudeCode.getState().pedidos.some((p) => p.pedidoId === pedidoId)) return;
        useClaudeCode.getState().focar(e.sessao);
        void tocarSom("approval", "avisos");
        void notificarSeEscondida(T.ilha.claude.notificacao.permissao(projeto));
        const ilhaAgora = useIlha.getState();
        if (ilhaAgora.estado === "escondida") ilhaAgora.definirEstado("compacta");
      });
      return;
    }
    case "Stop":
      if (silencio || !claudeNaIlha()) return;
      estado.focar(e.sessao);
      void tocarSom("finish", "avisos");
      void notificarSeEscondida(T.ilha.claude.notificacao.terminou(projeto));
      if (ilha.estado !== "expandida") ilha.revelar({ texto: T.ilha.claude.terminouAviso(projeto), tipo: "sucesso", marca: "claudecode", aba: "claude" }, 7000, "normal");
      return;
    case "StopFailure":
      if (!claudeNaIlha()) return;
      void tocarSom("error", "avisos");
      void notificarSeEscondida(T.ilha.claude.notificacao.erro(projeto));
      ilha.revelar({ texto: T.ilha.claude.erroAviso(projeto), tipo: "alerta", marca: "claudecode", aba: "claude" }, 6000);
      return;
    case "NikoPedidoEncerrado": {
      const motivo = e.dados.motivo;
      if (!claudeNaIlha() || (motivo !== "expirou" && motivo !== "cancelado")) return;
      ilha.revelar({ texto: T.ilha.claude.pedidoEncerrado[motivo], tipo: "alerta", marca: "claudecode", aba: "claude" }, 6000);
      return;
    }
    case "Notification":
      if (!claudeNaIlha()) return;
      if (sessao?.estado === "esperando") {
        void tocarSom("question", "avisos");
        ilha.revelar({ texto: T.ilha.claude.esperandoAviso(projeto), tipo: "info", marca: "claudecode", aba: "claude" }, 6000);
      } else if (sessao?.estado === "limite") {
        void tocarSom("rate", "avisos");
        ilha.revelar({ texto: T.ilha.claude.limiteAviso(projeto), tipo: "alerta", marca: "claudecode", aba: "claude" }, 6000);
      }
      return;
    default:
      return;
  }
}

function marcarInstalado(instalado: boolean) {
  const cfg = useConfig.getState();
  if (cfg.claudeInstalado !== instalado) cfg.definir({ claudeInstalado: instalado });
}

export function usarClaudeCode(ligado: boolean, reagirAosEventos = true) {
  useEffect(() => {
    if (!ligado) return;
    claudeCode
      .instalacao()
      .then((e) => marcarInstalado(e.instalado || e.parcial || e.desatualizado))
      .catch(() => undefined);
  }, [ligado]);

  useEffect(() => {
    if (!ligado) {
      useClaudeCode.getState().definirConectado(false);
      return;
    }
    let conectadoEm = Date.now();
    return ouvirClaudeCode(
      (e) => {
        if (e.sessao) marcarInstalado(true);
        useClaudeCode.getState().aplicar(e);
        if (reagirAosEventos && Date.parse(e.recebidoEm) >= conectadoEm - TOLERANCIA_MS) reagir(e);
      },
      (conectado) => {
        if (conectado) conectadoEm = Date.now();
        useClaudeCode.getState().definirConectado(conectado);
      },
    );
  }, [ligado, reagirAosEventos]);
}
