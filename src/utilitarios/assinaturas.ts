import { T } from "../textos/textos";
import { addDays, differenceInCalendarDays } from "date-fns";
import type { Recorrente, Transacao } from "../tipos";
import { normalizarTexto } from "./basicos";
import { deISO, paraISO } from "./datas";
import { lerValorEmCentavos } from "./dinheiro";

export interface CandidataAssinatura {
  chave: string;
  descricao: string;
  valor: number;
  frequencia: "mensal" | "anual";
  ocorrencias: Transacao[];
  proxima: string;
  contaId: string;
  categoriaId?: string;
  dia: number;
}

export function chaveDescricao(descricao: string): string {
  return normalizarTexto(descricao).replace(/\d+/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectarAssinaturas(transacoes: Transacao[], recorrentes: Recorrente[], ignoradas: string[]): CandidataAssinatura[] {
  const grupos = new Map<string, Transacao[]>();
  for (const t of transacoes) {
    if (t.tipo !== "despesa" || t.recorrenteId || t.grupoParcelasId || t.ajuste) continue;
    const k = chaveDescricao(t.descricao);
    if (k.length < 3) continue;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(t);
  }
  const cadastradas = new Set(recorrentes.map((r) => chaveDescricao(r.descricao)));
  const resultado: CandidataAssinatura[] = [];

  for (const [k, lista] of grupos) {
    if (cadastradas.has(k) || ignoradas.includes(k)) continue;
    const ordenada = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    for (const frequencia of ["mensal", "anual"] as const) {
      const [min, max, minimo] = frequencia === "mensal" ? [28, 33, 3] : [360, 370, 2];
      const serie: Transacao[] = [ordenada[0]];
      for (let i = 1; i < ordenada.length; i++) {
        const anterior = serie[serie.length - 1];
        const intervalo = differenceInCalendarDays(deISO(ordenada[i].data), deISO(anterior.data));
        const variacao = Math.abs(ordenada[i].valor - anterior.valor) / Math.max(1, anterior.valor);
        if (intervalo >= min && intervalo <= max && variacao <= 0.1) serie.push(ordenada[i]);
      }
      if (serie.length >= minimo) {
        const ultima = serie[serie.length - 1];
        resultado.push({
          chave: k,
          descricao: ultima.descricao,
          valor: ultima.valor,
          frequencia,
          ocorrencias: serie,
          proxima: paraISO(addDays(deISO(ultima.data), frequencia === "mensal" ? 30 : 365)),
          contaId: ultima.contaId,
          categoriaId: ultima.categoriaId,
          dia: deISO(ultima.data).getDate(),
        });
        break;
      }
    }
  }
  return resultado;
}

export function assinaturasComValorNovo(transacoes: Transacao[], recorrentes: Recorrente[]): Recorrente[] {
  return recorrentes.filter((r) => {
    const ultima = transacoes
      .filter((t) => t.tipo === "despesa" && !t.recorrenteId && chaveDescricao(t.descricao) === chaveDescricao(r.descricao))
      .sort((a, b) => b.data.localeCompare(a.data))[0];
    return ultima && Math.abs(ultima.valor - r.valor) / Math.max(1, r.valor) > 0.02;
  });
}

export interface LinhaImportada {
  data: string;
  descricao: string;
  valor: number;
}

function dataBr(texto: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(texto.trim());
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto.trim())) return texto.trim();
  return null;
}

export function lerCsv(texto: string): { linhas: LinhaImportada[]; invalidas: number } {
  const linhas: LinhaImportada[] = [];
  let invalidas = 0;
  const brutas = texto.split(/\r?\n/).filter((l) => l.trim());
  for (const [i, bruta] of brutas.entries()) {
    const separador = bruta.includes(";") ? ";" : ",";
    const partes = bruta.split(separador).map((p) => p.replace(/^"|"$/g, "").trim());
    if (partes.length < 3) {
      invalidas++;
      continue;
    }
    const data = dataBr(partes[0]);
    const valor = lerValorEmCentavos(partes[partes.length - 1].replace(/^-/, "")) ;
    const negativo = partes[partes.length - 1].trim().startsWith("-");
    if (!data || valor == null) {
      if (i > 0) invalidas++;
      continue;
    }
    linhas.push({ data, descricao: partes.slice(1, -1).join(" ").slice(0, 120) || T.financas.semDescricao, valor: negativo ? -valor : valor });
  }
  return { linhas, invalidas };
}

export function lerOfx(texto: string): { linhas: LinhaImportada[]; invalidas: number } {
  const linhas: LinhaImportada[] = [];
  let invalidas = 0;
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  for (const bloco of blocos) {
    const campo = (nome: string) => new RegExp(`<${nome}>([^<\\r\\n]+)`, "i").exec(bloco)?.[1]?.trim();
    const data = campo("DTPOSTED");
    const valor = Number(campo("TRNAMT")?.replace(",", "."));
    const descricao = campo("MEMO") ?? campo("NAME") ?? "";
    if (!data || !/^\d{8}/.test(data) || !Number.isFinite(valor)) {
      invalidas++;
      continue;
    }
    linhas.push({ data: `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}`, descricao: descricao.slice(0, 120), valor: Math.round(valor * 100) });
  }
  return { linhas, invalidas };
}
