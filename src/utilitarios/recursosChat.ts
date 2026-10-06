import { usePomodoro, restanteAtual, formatarRelogio } from "../estado/pomodoro";
import { useRotina } from "../estado/rotina";
import { useEstudos } from "../estado/estudos";
import { normalizarTexto } from "./basicos";
import { hojeISO, paraISO, diaDoMomento, dataValida, formatar } from "./datas";
import { T } from "../textos/textos";
import { funcaoLigada } from "./funcoes";

export type AcaoAnexo = keyof typeof T.chat.anexos.acoes;
export type PedidoLocal = "pausar" | "continuar" | "encerrar" | "timer" | "capacidades" | "relatorio";

export function detectarPedidoLocal(pedido: string, contextoPomodoro = false): PedidoLocal | null {
  const n = normalizarTexto(pedido).replace(/[?!.,]+$/g, "").replace(/^(?:por favor[, ]+|obrigad[oa][, ]+|opa[, ]+)/, "").replace(/^agora\s+/, "").trim();
  if (/^(?:\/capacidades|(?:o que|quais coisas) (?:voce|voces|o niko) (?:consegue[m]?|pode[m]?) fazer|(?:mostre|mostra|liste|lista) (?:as |suas )?capacidades)$/.test(n)) return "capacidades";
  if (/^(?:\/relatorio|(?:faca |faz |gere |gera |mostre |mostra )?(?:um |o |meu )?relatorio semanal)$/.test(n)) return "relatorio";
  if (/^(?:\/pomodoro (?:status|tempo)|quanto tempo (?:falta|resta)(?: (?:no|do|para o) (?:pomodoro|foco|timer))?|(?:qual|como esta) (?:o )?(?:tempo|estado) (?:do|de) (?:pomodoro|foco|timer))$/.test(n)) return "timer";
  for (const [acao, verbos] of [["pausar", "pausa|pause|pausar"], ["continuar", "continua|continue|continuar|retoma|retome|retomar"], ["encerrar", "para|pare|parar|encerra|encerre|encerrar|cancela|cancele|cancelar"]] as const) {
    if (new RegExp(`^(?:/pomodoro ${acao}|(?:${verbos}) (?:o |esse |este |meu )?(?:pomodoro|foco|timer)(?: (?:ai|por favor))?)$`).test(n)) return acao;
    if (contextoPomodoro && new RegExp(`^(?:${verbos}) (?:isso|ele)$`).test(n)) return acao;
  }
  return null;
}

export function lerPomodoro() {
  const p = usePomodoro.getState();
  const restante = restanteAtual(p, Date.now());
  const ativo = Boolean(p.inicioEtapa);
  const situacao: keyof typeof T.chat.recursos.estadoTimer = !ativo ? "inativo" : restante <= 0 ? "finalizado" : p.rodando ? "rodando" : "pausado";
  return { situacao, etapa: p.etapa, restante_segundos: ativo ? Math.ceil(restante / 1000) : 0, relogio: formatarRelogio(ativo ? restante : 0), materia: useEstudos.getState().materias.find((m) => m.id === p.materiaId)?.nome ?? null, consultado_em: new Date().toISOString() };
}

export function textoPomodoro() {
  const p = lerPomodoro();
  return T.chat.recursos.timerEstado(T.chat.recursos.estadoTimer[p.situacao], T.pomodoro.etapas[p.etapa], p.relogio);
}

export function controlarPomodoro(acao: string): { tipo: "erro"; mensagem: string } | { tipo: "dados"; conteudo: ReturnType<typeof lerPomodoro>; resumo: string } {
  const p = usePomodoro.getState();
  const estado = lerPomodoro();
  const S = T.chat.recursos;
  if (!["pausar", "continuar", "encerrar"].includes(acao)) return { tipo: "erro", mensagem: S.acaoInvalida };
  if (estado.situacao === "inativo") return { tipo: "erro", mensagem: S.semTimer };
  if (acao !== "encerrar" && estado.situacao === "finalizado") return { tipo: "erro", mensagem: S.timerExpirado };
  if (acao === "pausar") {
    if (!p.rodando) return { tipo: "erro", mensagem: S.jaPausado };
    p.pausar();
  } else if (acao === "continuar") {
    if (p.rodando) return { tipo: "erro", mensagem: S.jaRodando };
    p.continuar();
  } else p.encerrar();
  const atual = lerPomodoro();
  return { tipo: "dados", conteudo: atual, resumo: acao === "encerrar" ? S.timerEncerrado : acao === "pausar" ? S.timerPausado(atual.relogio) : S.timerContinuado(atual.relogio) };
}

export function gerarRelatorioSemanal(fim = hojeISO()) {
  if (!dataValida(fim)) throw new Error(T.chat.recursos.periodoInvalido);
  const inicioData = new Date(`${fim}T12:00:00`);
  inicioData.setDate(inicioData.getDate() - 6);
  const inicio = paraISO(inicioData);
  const dentro = (dia: string) => dia >= inicio && dia <= fim;
  const diaSeguro = (momento?: string) => momento && Number.isFinite(new Date(momento).getTime()) ? diaDoMomento(momento) : "";
  const r = useRotina.getState();
  const concluidas = r.tarefas.filter((t) => t.status === "concluida" && dentro(diaSeguro(t.concluidaEm)));
  const sessoes = usePomodoro.getState().sessoes.filter((s) => s.etapa === "foco" && dentro(diaSeguro(s.inicio)) && Number.isFinite(s.minutos) && s.minutos >= 0);
  const completas = sessoes.filter((s) => s.situacao === "concluida");
  const interrompidas = sessoes.filter((s) => s.situacao === "interrompida");
  const dias = Object.entries(r.dias).filter(([dia]) => dentro(dia));
  const sono = dias.flatMap(([, d]) => typeof d.sono === "number" && Number.isFinite(d.sono) && d.sono >= 0 && d.sono <= 24 ? [d.sono] : []);
  const agua = dias.flatMap(([, d]) => typeof d.agua === "number" && Number.isFinite(d.agua) && d.agua >= 0 ? [d.agua] : []);
  const registros = Object.entries(r.registros).filter(([dia]) => dentro(dia));
  let habitosRegistros = 0;
  let habitosCumpridos = 0;
  for (const [, valores] of registros) for (const [id, valor] of Object.entries(valores)) {
    const habito = r.habitos.find((h) => h.id === id);
    if (!habito || !Number.isFinite(valor) || valor < 0) continue;
    habitosRegistros++;
    if (valor >= (habito.tipo === "sim_nao" ? 1 : habito.meta)) habitosCumpridos++;
  }
  const arredondar = (n: number) => Math.round(n * 100) / 100;
  const media = (lista: number[]) => lista.length ? arredondar(lista.reduce((a, b) => a + b, 0) / lista.length) : null;
  const diasComRegistro = new Set([...dias.map(([dia]) => dia), ...registros.filter(([, v]) => Object.keys(v).length).map(([dia]) => dia), ...concluidas.map((t) => diaSeguro(t.concluidaEm)), ...sessoes.map((s) => diaSeguro(s.inicio))]);
  return { inicio, fim, tarefas_concluidas: concluidas.length, habitos_registros: habitosRegistros, habitos_cumpridos: habitosCumpridos, foco_sessoes_concluidas: completas.length, foco_concluido_minutos: arredondar(completas.reduce((a, s) => a + s.minutos, 0)), foco_interrompido_minutos: arredondar(interrompidas.reduce((a, s) => a + s.minutos, 0)), sono_media_horas: media(sono), sono_dias: sono.length, agua_media_ml: media(agua), agua_dias: agua.length, dias_com_registro: diasComRegistro.size };
}

export function textoRelatorioSemanal(r = gerarRelatorioSemanal()) {
  const S = T.chat.recursos;
  const comDiario = funcaoLigada("journal");
  return [
    S.relatorioTitulo(formatar(r.inicio, "dd/MM/yyyy"), formatar(r.fim, "dd/MM/yyyy")),
    ...(r.dias_com_registro === 0 ? [S.relatorioVazio] : []),
    ...(comDiario ? [S.relatorioTarefas(r.tarefas_concluidas), S.relatorioHabitos(r.habitos_registros, r.habitos_cumpridos)] : []),
    S.relatorioFoco(r.foco_sessoes_concluidas, r.foco_concluido_minutos, r.foco_interrompido_minutos),
    ...(comDiario ? [r.sono_media_horas === null ? S.relatorioSemSono : S.relatorioSono(r.sono_media_horas, r.sono_dias), r.agua_media_ml === null ? S.relatorioSemAgua : S.relatorioAgua(r.agua_media_ml, r.agua_dias)] : []),
    S.relatorioFonte,
  ].join("\n\n");
}

export function montarPedidoAnexo(acao: string, anexos: { nome: string; texto?: string }[]) {
  if (!Object.hasOwn(T.chat.anexos.pedidos, acao)) throw new Error(T.chat.anexos.acaoInvalida);
  const textos = anexos.filter((a) => a.texto?.trim());
  if (!textos.length) throw new Error(T.chat.anexos.semTextoAnalisavel);
  let disponivel = 45000;
  const partes = textos.map((a) => {
    const original = a.texto ?? "";
    const trecho = original.slice(0, Math.max(0, disponivel));
    disponivel -= trecho.length;
    return `${a.nome}\n${trecho}${trecho.length < original.length ? `\n${T.chat.anexos.recorte}` : ""}`;
  });
  return [T.chat.anexos.pedidos[acao as AcaoAnexo], T.chat.anexos.delimitador, ...partes].join("\n\n");
}

export function afirmaExecucao(texto: string) {
  return /(?:^|[.!?\n]\s*)(?:\*\*)?(?:eu |ja )?(?:criei|salvei|enviei|exclui|apaguei|adicionei|marquei|conclui|iniciei|pausei|retomei|encerrei|atualizei|pesquisei|executei|abri)\b|\b(?:pomodoro|timer|foco|tarefa|email|e-mail|evento|lembrete)\s+(?:foi\s+)?(?:iniciado|iniciada|pausado|retomado|encerrado|criada|salva|enviado|enviada|concluida)\b/.test(normalizarTexto(texto));
}

export function removerPrefixoDeAgente(texto: string, nomes: string[]) {
  const escapados = nomes.filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escapados.length) return texto;
  return texto.replace(new RegExp(`^\\s*(?:\\*\\*)?(?:${escapados.join("|")})(?:\\*\\*)?\\s*:(?:\\*\\*)?\\s*`, "i"), "");
}
