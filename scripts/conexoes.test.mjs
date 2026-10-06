import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pastaTemporaria = mkdtempSync(join(tmpdir(), "niko-conexoes-teste-"));
process.env.APPDATA = pastaTemporaria;

const memoria = new Map();
globalThis.BroadcastChannel = undefined;
globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: (k) => memoria.delete(k) };
globalThis.window = Object.assign(new EventTarget(), { location: { search: "" }, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout });

let respostas = [];
const pedidos = [];
globalThis.fetch = async (url, opcoes = {}) => {
  pedidos.push({ url: String(url), opcoes });
  const achada = respostas.find(([padrao]) => padrao.test(String(url)));
  if (!achada) throw new Error(`Rede bloqueada nos testes: ${url}`);
  const [, corpo, status = 200] = achada;
  return new Response(JSON.stringify(typeof corpo === "function" ? corpo(String(url), opcoes) : corpo), { status });
};

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => {
  rmSync(pastaTemporaria, { recursive: true, force: true });
  return servidor.close();
});
const { lerTodoist, criarTodoist, concluirTodoist } = await servidor.ssrLoadModule("/servidor/todoist.ts");
const { lerMicrosoft } = await servidor.ssrLoadModule("/servidor/microsoft.ts");
const { lerGoogleCalendar } = await servidor.ssrLoadModule("/servidor/googleCalendar.ts");
const { diasDoEvento, eventosDeHoje } = await servidor.ssrLoadModule("/src/ponte/conexoesReais.ts");
const telegram = await servidor.ssrLoadModule("/servidor/telegram.ts");
const { respostaParaTelegram } = await servidor.ssrLoadModule("/src/servicos/telegram.ts");
const { useRotina } = await servidor.ssrLoadModule("/src/estado/rotina.ts");
const { useConfig } = await servidor.ssrLoadModule("/src/estado/configuracoes.ts");
const { T } = await servidor.ssrLoadModule("/src/textos/textos.ts");

const dia = (deslocamento) => new Date(Date.now() + deslocamento * 86400000).toLocaleDateString("sv-SE");

beforeEach(() => {
  respostas = [];
  pedidos.length = 0;
});

test("Todoist separa hoje, atrasadas e próximas, segue a paginação e converte a prioridade", async () => {
  respostas = [
    [/\/tasks\?limit=200&cursor=pag2/, { results: [{ id: "3", content: "Sem data", priority: 1 }], next_cursor: null }],
    [/\/tasks\?limit=200$/, { results: [
      { id: "1", content: "Atrasada", project_id: "p", priority: 4, due: { date: dia(-2) } },
      { id: "2", content: "Daqui a 3 dias", project_id: "p", priority: 1, due: { date: dia(3), is_recurring: true } },
      { id: "4", content: "Feita", checked: true, due: { date: dia(0) } },
    ], next_cursor: "pag2" }],
    [/\/projects/, { results: [{ id: "p", name: "Casa" }] }],
  ];
  const d = await lerTodoist("token");
  assert.deepEqual(d.hoje.map((t) => t.conteudo), ["Atrasada"]);
  assert.equal(d.hoje[0].atrasada, true);
  assert.equal(d.hoje[0].prioridade, 1);
  assert.equal(d.hoje[0].projeto, "Casa");
  assert.deepEqual(d.proximas.map((t) => [t.conteudo, t.recorrente]), [["Daqui a 3 dias", true]]);
  assert.equal(d.semData, 1);
  assert.equal(d.total, 3);
});

test("Todoist valida o id antes de concluir e manda o prazo em português ao criar", async () => {
  await assert.rejects(() => concluirTodoist("token", { id: "../projects" }), /tarefa_invalida/);
  respostas = [[/\/tasks$/, { id: "9" }]];
  await criarTodoist("token", { conteudo: "Ligar pro banco", quando: "amanhã 15h" });
  assert.deepEqual(JSON.parse(pedidos[0].opcoes.body), { content: "Ligar pro banco", due_string: "amanhã 15h", due_lang: "pt" });
});

test("Microsoft lê e-mail, agenda e Teams, guarda o token novo e trata o dia inteiro sem mudar de dia", async () => {
  let trocado = null;
  respostas = [
    [/oauth2\/v2\.0\/token/, { access_token: "acesso", refresh_token: "renovacao-nova", expires_in: 3600 }],
    [/\/me\?/, { displayName: "Ana", mail: "ana@empresa.com" }],
    [/mailFolders\/inbox\?/, { unreadItemCount: 4 }],
    [/mailFolders\/inbox\/messages/, { value: [{ id: "m1", subject: "Contrato", receivedDateTime: "2026-10-06T08:00:00Z", isRead: false, importance: "high", from: { emailAddress: { name: "Rui" } } }] }],
    [/calendarView/, { value: [
      { id: "e1", subject: "Reunião", start: { dateTime: "2026-10-06T14:00:00.0000000" }, end: { dateTime: "2026-10-06T15:00:00.0000000" }, onlineMeeting: { joinUrl: "https://teams.microsoft.com/x" } },
      { id: "e2", subject: "Feriado", isAllDay: true, start: { dateTime: "2026-10-07T00:00:00.0000000" }, end: { dateTime: "2026-10-08T00:00:00.0000000" } },
      { id: "e3", subject: "Cancelada", isCancelled: true, start: { dateTime: "2026-10-06T10:00:00.0000000" } },
    ] }],
    [/\/me\/chats/, { value: [{ id: "c1", topic: null, chatType: "oneOnOne", lastMessagePreview: { createdDateTime: "2026-10-06T09:00:00Z", body: { content: "<p>Bom&nbsp;dia</p>" }, from: { user: { displayName: "Rui" } } } }] }],
  ];
  const d = await lerMicrosoft(JSON.stringify({ clienteId: "00000000-0000-0000-0000-000000000000", refresh: "renovacao-velha" }), async (nova) => {
    trocado = nova.refresh;
  });
  assert.equal(trocado, "renovacao-nova");
  assert.equal(d.naoLidos, 4);
  assert.equal(d.emails[0].importante, true);
  assert.deepEqual(d.eventos.map((e) => e.titulo), ["Reunião", "Feriado"]);
  assert.equal(d.eventos[0].inicio, "2026-10-06T14:00:00.0000000Z");
  assert.equal(d.eventos[0].link, "https://teams.microsoft.com/x");
  assert.deepEqual([d.eventos[1].inicio, d.eventos[1].fim, d.eventos[1].diaInteiro], ["2026-10-07", "2026-10-08", true]);
  assert.equal(d.teams, true);
  assert.deepEqual([d.chats[0].titulo, d.chats[0].ultima], ["Rui", "Bom dia"]);
});

test("Google Calendar junta as agendas escolhidas e ignora eventos cancelados", async () => {
  respostas = [
    [/oauth2\.googleapis\.com\/token/, { access_token: "acesso", expires_in: 3600 }],
    [/calendarList/, { items: [{ id: "eu@gmail.com", summary: "Pessoal", primary: true, backgroundColor: "#f00" }, { id: "trabalho", summary: "Trabalho", selected: true }, { id: "oculta", summary: "Oculta" }] }],
    [/calendars\/eu%40gmail\.com\/events/, { items: [{ id: "a", summary: "Dentista", start: { dateTime: "2026-10-08T10:00:00+01:00" }, end: { dateTime: "2026-10-08T11:00:00+01:00" } }, { id: "b", status: "cancelled", start: { date: "2026-10-09" } }] }],
    [/calendars\/trabalho\/events/, { items: [{ id: "c", summary: "Viagem", start: { date: "2026-10-07" }, end: { date: "2026-10-10" } }] }],
  ];
  const d = await lerGoogleCalendar(JSON.stringify({ clienteId: "x.apps.googleusercontent.com", segredo: "s", refresh: "r" }));
  assert.equal(d.conta, "eu@gmail.com");
  assert.deepEqual(d.calendarios.map((c) => c.nome), ["Pessoal", "Trabalho"]);
  assert.deepEqual(d.eventos.map((e) => [e.titulo, e.calendario, e.diaInteiro]), [["Viagem", "Trabalho", true], ["Dentista", "Pessoal", false]]);
  assert.ok(!pedidos.some((p) => p.url.includes("oculta")));
});

test("evento de dia inteiro ocupa até a véspera da data final, como no Google e na Microsoft", () => {
  const viagem = { id: "v", titulo: "Viagem", inicio: "2026-10-07", fim: "2026-10-10", diaInteiro: true, local: "", link: "", calendario: "", cor: "" };
  assert.deepEqual(diasDoEvento(viagem), ["2026-10-07", "2026-10-08", "2026-10-09"]);
  assert.deepEqual(diasDoEvento({ ...viagem, fim: "2026-10-08" }), ["2026-10-07"]);
  const hoje = dia(0);
  const amanha = dia(1);
  assert.equal(eventosDeHoje([{ ...viagem, inicio: hoje, fim: amanha }]).length, 1);
  assert.equal(eventosDeHoje([{ ...viagem, inicio: amanha, fim: dia(2) }]).length, 0);
});

test("mensagens do Telegram viram tarefas sem precisar de confirmação extra", async () => {
  useRotina.setState({ tarefas: [], habitos: [], registros: {}, dias: {} });
  useConfig.setState({ funcoesDesligadas: [] });
  const resposta = await respostaParaTelegram("tenho que ligar pro banco amanhã 15h");
  assert.equal(useRotina.getState().tarefas.length, 1);
  assert.match(useRotina.getState().tarefas[0].titulo, /ligar pro banco/);
  assert.ok(resposta.length > 0);
  assert.equal(await respostaParaTelegram("/start"), T.telegram.ajuda);
  assert.equal(await respostaParaTelegram("oi"), T.telegram.ajuda);
  await respostaParaTelegram("comprar pão");
  assert.equal(useRotina.getState().tarefas.length, 2);
});

test("Telegram só liga o chat que mandar o código e ignora qualquer outro", async () => {
  const token = "123456789:" + "a".repeat(35);
  respostas = [[/api\.telegram\.org/, { ok: true, result: true }]];
  await telegram.prepararBot(token);
  respostas = [[/getMe/, { ok: true, result: { username: "meu_niko_bot", first_name: "Meu Niko" } }], [/api\.telegram\.org/, { ok: true, result: true }]];
  const { codigo } = await telegram.lerTelegram(token);
  assert.match(codigo, /^\d{6}$/);
  const mensagem = (chat, texto, id = 1) => ({ update_id: id, message: { message_id: id, date: 1790000000, text: texto, chat: { id: chat, type: "private", first_name: "Ana" } } });

  await telegram.tratarAtualizacao(token, mensagem(111, "000000"));
  await telegram.tratarAtualizacao(token, mensagem(222, "tarefa de um intruso"));
  assert.equal((await telegram.lerTelegram(token)).ligado, false);
  assert.equal(telegram.pegarPendentes().length, 0);

  await telegram.tratarAtualizacao(token, mensagem(111, `/start ${codigo}`));
  const estado = await telegram.lerTelegram(token);
  assert.equal(estado.ligado, true);
  assert.equal(estado.codigo, "");

  await telegram.tratarAtualizacao(token, mensagem(222, "outro chat", 2));
  await telegram.tratarAtualizacao(token, mensagem(111, "comprar pão", 3));
  await telegram.tratarAtualizacao(token, { update_id: 4, message: { message_id: 4, date: 1790000000, text: "grupo", chat: { id: 111, type: "group" } } });
  assert.deepEqual(telegram.pegarPendentes().map((m) => m.texto), ["comprar pão"]);
  assert.equal(telegram.pegarPendentes().length, 0);
});
