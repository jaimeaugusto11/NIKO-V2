import { addDays, addMonths, addWeeks, endOfMonth, startOfMonth } from "date-fns";
import { T } from "../textos/textos";
import { deISO, paraISO } from "./datas";
import { formatarDinheiro } from "./dinheiro";
import type { Evento } from "../tipos";
import type { useOrganizacao } from "../estado/organizacao";
import type { useRotina } from "../estado/rotina";
import type { useEstudos } from "../estado/estudos";
import type { useFinancas } from "../estado/financas";
import { funcaoLigada, type Funcao } from "./funcoes";
import { diasDoEvento, horaDoEvento, type EventoAgenda } from "../ponte/conexoesReais";

export type FonteDoCalendario = keyof typeof T.calendario.fontes;

export interface ItemDoCalendario {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  fonte: FonteDoCalendario;
  evento?: Evento;
}

export interface DadosDoCalendario {
  eventos: ReturnType<typeof useOrganizacao.getState>["eventos"];
  metas: ReturnType<typeof useOrganizacao.getState>["metas"];
  tarefas: ReturnType<typeof useRotina.getState>["tarefas"];
  datas: ReturnType<typeof useEstudos.getState>["datas"];
  revisoes: ReturnType<typeof useEstudos.getState>["revisoesConteudo"];
  recorrentes: ReturnType<typeof useFinancas.getState>["recorrentes"];
  agenda?: EventoAgenda[];
}

export function ocorrencias(e: Evento, inicio: string, fim: string): string[] {
  if (e.repeticao === "nenhuma") return e.data >= inicio && e.data <= fim ? [e.data] : [];
  const resultado: string[] = [];
  let d = deISO(e.data);
  let protecao = 0;
  while (paraISO(d) <= fim && protecao < 800) {
    const iso = paraISO(d);
    if (iso >= inicio) resultado.push(iso);
    d = e.repeticao === "diaria" ? addDays(d, 1) : e.repeticao === "semanal" ? addWeeks(d, 1) : addMonths(d, 1);
    protecao++;
  }
  return resultado;
}

export function itensDoCalendario(todos: DadosDoCalendario, de: string, ate: string): ItemDoCalendario[] {
  const ligada = (f: Funcao) => funcaoLigada(f);
  const dados: DadosDoCalendario = {
    eventos: ligada("calendario") ? todos.eventos : [],
    tarefas: ligada("journal") ? todos.tarefas : [],
    datas: ligada("estudos") ? todos.datas : [],
    revisoes: ligada("estudos") ? todos.revisoes : [],
    metas: ligada("metas") ? todos.metas : [],
    recorrentes: ligada("financas") ? todos.recorrentes : [],
    agenda: ligada("calendario") ? todos.agenda ?? [] : [],
  };
  const lista: ItemDoCalendario[] = [];
  for (const e of dados.eventos) for (const d of ocorrencias(e, de, ate)) lista.push({ id: `${e.id}-${d}`, titulo: e.titulo, data: d, hora: e.hora, fonte: "eventos", evento: e });
  for (const t of dados.tarefas) if (t.data && t.data >= de && t.data <= ate && t.status !== "cancelada") lista.push({ id: t.id, titulo: t.titulo, data: t.data, hora: t.hora, fonte: "tarefas" });
  for (const d of dados.datas) if (d.data >= de && d.data <= ate) lista.push({ id: d.id, titulo: `${T.estudos.tiposData[d.tipo]}: ${d.titulo}`, data: d.data, fonte: "estudos" });
  for (const r of dados.revisoes) if (!r.feita && r.data >= de && r.data <= ate) lista.push({ id: r.id, titulo: T.calendario.revisao, data: r.data, fonte: "estudos" });
  for (const m of dados.metas) if (m.prazo && m.prazo >= de && m.prazo <= ate) lista.push({ id: m.id, titulo: m.nome, data: m.prazo, fonte: "metas" });
  for (const r of dados.recorrentes) {
    if (!r.ativa) continue;
    let d = startOfMonth(deISO(de));
    while (paraISO(d) <= ate) {
      const dia = paraISO(new Date(d.getFullYear(), d.getMonth(), Math.min(r.dia, endOfMonth(d).getDate())));
      if (dia >= de && dia <= ate && (r.frequencia === "mensal" || d.getMonth() + 1 === r.mesAnual)) lista.push({ id: `${r.id}-${dia}`, titulo: `${r.descricao} ${formatarDinheiro(r.valor)}`, data: dia, fonte: "financas" });
      d = addMonths(d, 1);
    }
  }
  for (const e of dados.agenda ?? []) {
    const dias = diasDoEvento(e);
    for (const d of dias) if (d >= de && d <= ate) lista.push({ id: `${e.id}-${d}`, titulo: e.titulo, data: d, hora: d === dias[0] ? horaDoEvento(e) : undefined, fonte: "agenda" });
  }
  return lista.sort((a, b) => `${a.data}${a.hora ?? "99"}`.localeCompare(`${b.data}${b.hora ?? "99"}`));
}
