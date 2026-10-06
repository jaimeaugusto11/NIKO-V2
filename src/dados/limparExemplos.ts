import { useRotina } from "../estado/rotina";
import { useEstudos } from "../estado/estudos";
import { usePomodoro } from "../estado/pomodoro";
import { useFinancas } from "../estado/financas";
import { useOrganizacao } from "../estado/organizacao";
import { useComunicacao } from "../estado/comunicacao";
import { useAgentes } from "../estado/agentes";
import { useConquistas } from "../estado/conquistas";
import { lerChave, gravarChave } from "../ponte/armazenamento";

const CHAVE = "niko:limpeza-exemplos";

const TAREFAS = new Set([
  "Revisar lista de limites", "Pagar conta de luz", "Estudar derivadas", "Treino na academia", "Ler capítulo 4 do livro de Rust",
  "Relatório de Física", "Projeto CLI em Rust", "Vocabulário unidade 5", "Listening podcast", "Marcar dentista",
]);
const HABITOS: Record<string, [string, number, string]> = {
  "Beber água": ["quantidade", 8, "copos"],
  Ler: ["sim_nao", 1, ""],
  "Exercício": ["sim_nao", 1, ""],
  Meditar: ["quantidade", 10, "min"],
};
const AREAS: Record<string, string> = { Faculdade: "#3b6fe0", "Programação": "#2f9e6b", Idiomas: "#d9922b" };
const MATERIAS = new Set(["Cálculo I", "Física I", "Rust", "Inglês B2"]);
const CONTAS: Record<string, number> = { Nubank: 320000, "Poupança": 850000, Carteira: 12000, "Cartão Nubank": 0 };
const ORCAMENTOS: Record<string, number> = { "Alimentação": 80000, Mercado: 90000, Transporte: 30000, Lazer: 25000 };
const METAS = new Set(["Ler 12 livros no ano", "Estudar 60 horas de Cálculo", "Exercício 3 vezes por semana", "Juntar para a viagem"]);
const VISOES = new Set(["Morar sozinho", "Fluência em inglês"]);
const EVENTOS = new Set(["Reunião do grupo de estudo", "Tomar remédio", "Aniversário da Ana"]);
const EVENTOS_CONEXAO = new Set(["Vercel: deploy pronto", "Stripe: pagamento recebido", "GitHub: Actions falhou"]);
const ATIVIDADES = new Set(["Agendei 3 revisões de Cálculo", "Vercel: deploy pronto", "Resumo da manhã pronto"]);
const DIARIO = "<p>Dia produtivo. Terminei a lista de limites e consegui treinar.</p>";

function diaDeExemplo(d: { humor?: string; sono?: number; agua?: number; diario: string; nota: string; manha: string; tarde: string; noite: string }): boolean {
  if (d.agua != null || !d.humor || d.sono == null) return false;
  if (d.sono < 5.5 || d.sono > 8.5 || (d.sono * 2) % 1 !== 0) return false;
  return (
    (d.diario === "" || d.diario === DIARIO) &&
    (d.nota === "" || d.nota === "Levar carregador amanhã.") &&
    (d.manha === "" || d.manha === "Faculdade") &&
    (d.tarde === "" || d.tarde === "Estudos e projeto") &&
    (d.noite === "" || d.noite === "Academia")
  );
}

export function limparExemplos(): boolean {
  if (lerChave(CHAVE)) return false;
  gravarChave(CHAVE, new Date().toISOString());

  const estudos = useEstudos.getState();
  const areasDemo = new Set(estudos.areas.filter((a) => AREAS[a.nome] === a.cor).map((a) => a.id));
  const materiasDemo = new Set(estudos.materias.filter((m) => areasDemo.has(m.areaId) && MATERIAS.has(m.nome)).map((m) => m.id));
  const fin = useFinancas.getState();
  const contasDemo = new Set(fin.contas.filter((c) => CONTAS[c.nome] === c.saldoInicial && (c.nome !== "Cartão Nubank" || c.limite === 500000)).map((c) => c.id));
  const temExemplo = materiasDemo.size > 0 || contasDemo.size >= 3 || useRotina.getState().tarefas.some((t) => TAREFAS.has(t.titulo));
  if (!temExemplo) return false;

  const rotina = useRotina.getState();
  const habitosDemo = new Set(rotina.habitos.filter((h) => { const x = HABITOS[h.nome]; return x && x[0] === h.tipo && x[1] === h.meta && x[2] === h.unidade; }).map((h) => h.id));
  const registros = Object.fromEntries(
    Object.entries(rotina.registros)
      .map(([dia, valores]) => [dia, Object.fromEntries(Object.entries(valores).filter(([id]) => !habitosDemo.has(id)))] as const)
      .filter(([, valores]) => Object.keys(valores).length > 0),
  );
  rotina.substituir({
    tarefas: rotina.tarefas.filter((t) => !TAREFAS.has(t.titulo) && !(/^Tarefa \d+$/.test(t.titulo) && t.status === "concluida") && !(t.materiaId && materiasDemo.has(t.materiaId))),
    habitos: rotina.habitos.filter((h) => !habitosDemo.has(h.id)),
    registros,
    dias: Object.fromEntries(Object.entries(rotina.dias).filter(([, d]) => !diaDeExemplo(d))),
  });

  const paginasDemo = new Set(estudos.paginas.filter((p) => materiasDemo.has(p.materiaId)).map((p) => p.id));
  const cartoes = estudos.cartoes.filter((c) => !materiasDemo.has(c.materiaId));
  estudos.substituir({
    areas: estudos.areas.filter((a) => !areasDemo.has(a.id) || estudos.materias.some((m) => m.areaId === a.id && !materiasDemo.has(m.id))),
    materias: estudos.materias.filter((m) => !materiasDemo.has(m.id)),
    paginas: estudos.paginas.filter((p) => !paginasDemo.has(p.id)),
    datas: estudos.datas.filter((d) => !materiasDemo.has(d.materiaId)),
    cartoes,
    revisoesConteudo: estudos.revisoesConteudo.filter((r) => !paginasDemo.has(r.paginaId)),
    links: estudos.links.filter((l) => !(l.materiaId && materiasDemo.has(l.materiaId))),
    registroRevisoes: cartoes.length === 0 ? [] : estudos.registroRevisoes,
  });

  usePomodoro.getState().substituir(usePomodoro.getState().sessoes.filter((s) => !(s.materiaId && materiasDemo.has(s.materiaId))));

  const pessoasDemo = new Set(fin.pessoas.filter((p) => p.nome === "Ana" || p.nome === "Bruno").map((p) => p.id));
  const divisoesDemo = new Set(fin.divisoes.filter((d) => d.descricao === "Pizza sexta" && d.total === 12000).map((d) => d.id));
  fin.substituir({
    contas: fin.contas.filter((c) => !contasDemo.has(c.id)),
    transacoes: fin.transacoes.filter((t) => !contasDemo.has(t.contaId) && !(t.contaDestinoId && contasDemo.has(t.contaDestinoId))),
    categorias: fin.categorias.map((c) => (ORCAMENTOS[c.nome] === c.orcamento ? { ...c, orcamento: 0 } : c)),
    recorrentes: fin.recorrentes.filter((r) => !contasDemo.has(r.contaId)),
    metasEconomia: fin.metasEconomia.filter((m) => !(m.nome === "Viagem de férias" && m.alvo === 600000)),
    pessoas: fin.pessoas.filter((p) => !pessoasDemo.has(p.id) || fin.divisoes.some((d) => !divisoesDemo.has(d.id) && d.partes.some((x) => x.pessoaId === p.id))),
    divisoes: fin.divisoes.filter((d) => !divisoesDemo.has(d.id)),
    listas: fin.listas.filter((l) => !(l.nome === "Mercado" && l.itens.length <= 3 && l.itens.every((i) => ["Leite", "Pão de forma", "Café"].includes(i.nome)))),
    precos: Object.fromEntries(Object.entries(fin.precos).filter(([k]) => k !== "leite")),
    regras: fin.regras.filter((r) => !(r.contem === "IFOOD" || r.contem === "Uber")),
  });

  const org = useOrganizacao.getState();
  org.substituir({
    metas: org.metas.filter((m) => !METAS.has(m.nome)),
    visao: org.visao.filter((v) => !VISOES.has(v.titulo)),
    eventos: org.eventos.filter((e) => !EVENTOS.has(e.titulo)),
  });

  const com = useComunicacao.getState();
  com.substituir({
    eventosConexao: com.eventosConexao.filter((e) => !EVENTOS_CONEXAO.has(e.texto)),
    memoria: com.memoria.filter((m) => m.texto !== "Recebo salário no dia 5"),
    usoIa: com.usoIa.filter((u) => !["claude-sonnet-5-5", "claude-haiku-4-5", "modelo-local"].includes(u.modelo)),
  });

  useAgentes.setState((s) => ({ atividades: s.atividades.filter((a) => !ATIVIDADES.has(a.texto)) }));
  useConquistas.getState().substituir([]);
  return true;
}

const CHAVE_SIMULACOES = "niko:limpeza-simulacoes";
const NOMES = ["Stripe", "GitHub", "Vercel", "Resend", "Notion", "Cal.com", "n8n"];
const EVENTOS_SIMULADOS = ["pagamento recebido", "PR aprovado", "deploy pronto", "e-mails entregues", "página atualizada", "novo agendamento", "execução concluída", "cobrança falhou", "Actions falhou", "deploy falhou", "e-mail devolvido", "sem acesso a uma página", "agendamento cancelado", "execução com erro"];
const TEXTOS_SIMULADOS = new Set(NOMES.flatMap((n) => EVENTOS_SIMULADOS.map((e) => `${n}: ${e}`)));

function sessaoDeExemplo(s: { inicio: string; minutos: number; materiaId?: string }, materias: Set<string>): boolean {
  if (s.minutos !== 25 || !s.materiaId || materias.has(s.materiaId)) return false;
  const d = new Date(s.inicio);
  return d.getMinutes() === 0 && d.getSeconds() === 0 && [9, 11, 13, 15, 17].includes(d.getHours());
}

export function limparSimulacoes(): boolean {
  if (lerChave(CHAVE_SIMULACOES)) return false;
  gravarChave(CHAVE_SIMULACOES, new Date().toISOString());
  let mudou = false;
  const com = useComunicacao.getState();
  const eventos = com.eventosConexao.filter((e) => !TEXTOS_SIMULADOS.has(e.texto));
  if (eventos.length !== com.eventosConexao.length) mudou = true;
  com.substituir({
    eventosConexao: eventos,
    conexoes: com.conexoes.map((c) => (c.chaveSalva ? c : { ...c, resumo: "", ultimaAtualizacao: undefined, status: "sem_chave", ligada: false })),
  });
  const agentes = useAgentes.getState();
  const atividades = agentes.atividades.filter((a) => !TEXTOS_SIMULADOS.has(a.texto));
  const alertas = agentes.alertas.filter((a) => !TEXTOS_SIMULADOS.has(a.texto));
  if (atividades.length !== agentes.atividades.length || alertas.length !== agentes.alertas.length) mudou = true;
  useAgentes.setState({ atividades, alertas });
  const materias = new Set(useEstudos.getState().materias.map((m) => m.id));
  const sessoes = usePomodoro.getState().sessoes;
  const reais = sessoes.filter((s) => !sessaoDeExemplo(s, materias));
  if (reais.length !== sessoes.length) {
    usePomodoro.getState().substituir(reais);
    mudou = true;
  }
  const estudos = useEstudos.getState();
  if (estudos.cartoes.length === 0 && estudos.registroRevisoes.length > 0) {
    estudos.substituir({ registroRevisoes: [] });
    mudou = true;
  }
  return mudou;
}