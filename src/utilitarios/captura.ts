import { executarComando, type ResultadoComando } from "./comandos";
import { useRotina, DIA_VAZIO } from "../estado/rotina";
import { hojeISO } from "./datas";
import { T } from "../textos/textos";
import { normalizarTexto, urlSegura } from "./basicos";
import { escaparHtml } from "./sanitizar";
import { avisoDeFuncaoDesligada, funcaoLigada, type Funcao } from "./funcoes";

export type TipoCaptura = "tarefa" | "gasto" | "link" | "nota" | "lembrete";

export const TIPOS_CAPTURA: TipoCaptura[] = ["tarefa", "gasto", "link", "nota", "lembrete"];

const FUNCAO_DA_CAPTURA: Record<TipoCaptura, Funcao> = { tarefa: "journal", nota: "journal", gasto: "financas", link: "estudos", lembrete: "calendario" };

export function tiposDeCapturaLigados(desligadas: readonly Funcao[]): TipoCaptura[] {
  return TIPOS_CAPTURA.filter((t) => funcaoLigada(FUNCAO_DA_CAPTURA[t], desligadas));
}

export function capturar(tipo: TipoCaptura, texto: string): ResultadoComando {
  const limpo = texto.trim();
  if (!limpo) return { agente: "organizador", resposta: T.validacao.obrigatorio, ok: false };
  if (!funcaoLigada(FUNCAO_DA_CAPTURA[tipo])) return { agente: "organizador", resposta: avisoDeFuncaoDesligada(FUNCAO_DA_CAPTURA[tipo]), ok: false };
  if (tipo === "nota") {
    const hoje = hojeISO();
    const rotina = useRotina.getState();
    const atual = rotina.dias[hoje] ?? DIA_VAZIO;
    rotina.atualizarDia(hoje, { diario: `${atual.diario}<p>${escaparHtml(limpo.slice(0, 1000))}</p>` });
    return { agente: "organizador", resposta: T.ilha.notaSalva, ok: true };
  }
  return executarComando(`/${tipo} ${limpo}`);
}

export function capturarLivre(texto: string): ResultadoComando {
  const limpo = texto.trim();
  if (limpo.startsWith("/")) return executarComando(limpo);
  const [primeira, ...resto] = limpo.split(/\s+/);
  const chave = normalizarTexto(primeira ?? "").replace(/:$/, "");
  const mapa: Record<string, TipoCaptura> = { tarefa: "tarefa", gasto: "gasto", link: "link", nota: "nota", lembrete: "lembrete" };
  if (mapa[chave]) return capturar(mapa[chave], resto.join(" "));
  if (chave === "receita") return executarComando(`/receita ${resto.join(" ")}`);
  if (urlSegura(primeira ?? "")) return capturar("link", limpo);
  return capturar("tarefa", limpo);
}
