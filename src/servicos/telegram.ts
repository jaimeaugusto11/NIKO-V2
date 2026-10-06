import { useComunicacao } from "../estado/comunicacao";
import { useConfig } from "../estado/configuracoes";
import { useAgentes } from "../estado/agentes";
import { useIlha } from "../estado/ilha";
import { conexoesPonte } from "../ponte/conexoesReais";
import { detectarIntencao } from "../utilitarios/intencoes";
import { confirmarComando, executarComando } from "../utilitarios/comandos";
import { capturarLivre } from "../utilitarios/captura";
import { T } from "../textos/textos";

const AJUDA = /^\/(start|ajuda|help)\b/i;

/**
 * Transforma uma mensagem do chat emparelhado num registo do Niko e devolve o texto de resposta.
 * A mensagem vem do próprio utilizador pelo celular, por isso um cartão de confirmação (como o de gasto) já conta como confirmado.
 */
export async function respostaParaTelegram(texto: string): Promise<string> {
  const limpo = texto.trim();
  if (!limpo || AJUDA.test(limpo)) return T.telegram.ajuda;
  const intencao = detectarIntencao(limpo);
  if (intencao.tipo === "saudacao") return T.telegram.ajuda;
  if (intencao.tipo === "comando" && intencao.comando) {
    const r = executarComando(intencao.comando);
    return r.confirmacao ? await confirmarComando(r.confirmacao) : r.resposta;
  }
  return capturarLivre(limpo).resposta;
}

const semMarcacao = (texto: string) => texto.replace(/<[^>]+>/g, "").replace(/\*\*/g, "");

let processando = false;

export async function processarTelegram() {
  if (processando || useConfig.getState().pausarConexoes) return;
  const conexao = useComunicacao.getState().conexoes.find((c) => c.id === "telegram");
  if (!conexao?.ligada || !conexao.chaveSalva) return;
  processando = true;
  try {
    const { mensagens } = await conexoesPonte.mensagensTelegram();
    for (const m of mensagens) {
      let resposta: string;
      try {
        resposta = semMarcacao(await respostaParaTelegram(m.texto));
      } catch (e) {
        resposta = T.telegram.falhou((e as Error).message);
      }
      await conexoesPonte.responderTelegram(resposta, m.texto).catch(() => undefined);
      useAgentes.getState().registrar("organizador", T.telegram.atividade(m.texto));
      useIlha.getState().revelar({ texto: T.telegram.atividade(m.texto), tipo: "sucesso", marca: "telegram", aba: "conexoes" }, 3200, "normal");
    }
  } catch {
    return;
  } finally {
    processando = false;
  }
}
