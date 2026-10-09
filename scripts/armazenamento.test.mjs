import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const memoria = new Map();
const canais = [];
globalThis.BroadcastChannel = class {
  constructor() {
    this.ouvintes = [];
    this.enviadas = [];
    canais.push(this);
  }
  addEventListener(_tipo, fn) {
    this.ouvintes.push(fn);
  }
  postMessage(dados) {
    this.enviadas.push(dados);
  }
  receber(dados) {
    for (const fn of this.ouvintes) fn({ data: dados });
  }
};
globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: (k) => memoria.delete(k), key: () => null, length: 0 };
globalThis.window = Object.assign(new EventTarget(), { location: { search: "" }, setTimeout, clearTimeout });
globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });

const banco = new Map([["niko:x", "velho"]]);
let liberarPost = () => {};
let lerAntesDe = null;
globalThis.fetch = async (url, opcoes = {}) => {
  if (opcoes.method === "POST") {
    await new Promise((r) => (liberarPost = r));
    for (const [k, v] of Object.entries(JSON.parse(opcoes.body).itens)) banco.set(k, v);
    return new Response("{}");
  }
  const dados = Object.fromEntries(lerAntesDe ?? banco);
  return new Response(JSON.stringify({ dados }));
};

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const armazenamento = await servidor.ssrLoadModule("/src/ponte/armazenamento.ts");
const esperar = () => new Promise((r) => setTimeout(r, 10));

test("recarregar não traz de volta um valor antigo enquanto a escrita ainda está a caminho", async () => {
  assert.equal(await armazenamento.iniciarArmazenamento(), "banco");
  armazenamento.gravarChave("niko:x", "novo");
  const envio = armazenamento.salvarAgora();
  window.dispatchEvent(new Event("focus"));
  await esperar();
  assert.equal(armazenamento.lerChave("niko:x"), "novo");
  liberarPost();
  await envio;
  assert.equal(banco.get("niko:x"), "novo");
});

test("uma leitura que começou antes de uma escrita local não a desfaz", async () => {
  lerAntesDe = new Map([["niko:x", "novo"], ["niko:y", "do-servidor"]]);
  let soltarLeitura;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, opcoes = {}) => {
    if (opcoes.method === "POST") return fetchOriginal(url, opcoes);
    await new Promise((r) => (soltarLeitura = r));
    return fetchOriginal(url, opcoes);
  };
  window.dispatchEvent(new Event("focus"));
  await esperar();
  armazenamento.gravarChave("niko:x", "mais-novo");
  const envio = armazenamento.salvarAgora();
  liberarPost();
  await envio;
  soltarLeitura();
  await esperar();
  assert.equal(armazenamento.lerChave("niko:x"), "mais-novo");
  assert.equal(armazenamento.lerChave("niko:y"), "do-servidor");
  globalThis.fetch = fetchOriginal;
});

test("mudanças simultâneas de duas janelas na mesma área são fundidas, sem perder nenhuma", async () => {
  const tarefas = (...ids) => JSON.stringify({ state: { tarefas: ids.map((id) => ({ id, titulo: id })) }, version: 0 });
  armazenamento.gravarChave("niko:rotina-teste", tarefas("a"));
  let envio = armazenamento.salvarAgora();
  liberarPost();
  await envio;

  armazenamento.gravarChave("niko:rotina-teste", tarefas("a", "b"));
  const [canal] = canais;
  canal.receber({ origem: "outra-janela", chave: "niko:rotina-teste", valor: tarefas("a", "c") });

  const ids = JSON.parse(armazenamento.lerChave("niko:rotina-teste")).state.tarefas.map((t) => t.id).sort();
  assert.deepEqual(ids, ["a", "b", "c"]);
  const avisada = canal.enviadas.at(-1);
  assert.equal(avisada.chave, "niko:rotina-teste");
  assert.deepEqual(JSON.parse(avisada.valor).state.tarefas.map((t) => t.id).sort(), ["a", "b", "c"]);

  envio = armazenamento.salvarAgora();
  liberarPost();
  await envio;
  assert.deepEqual(JSON.parse(banco.get("niko:rotina-teste")).state.tarefas.map((t) => t.id).sort(), ["a", "b", "c"]);
});

test("recarregar não repõe um valor antigo da ponte por cima de um recebido de outra janela", async () => {
  lerAntesDe = new Map([["niko:z", "antigo"]]);
  let soltarLeitura;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, opcoes = {}) => {
    if (opcoes.method === "POST") return fetchOriginal(url, opcoes);
    await new Promise((r) => (soltarLeitura = r));
    return fetchOriginal(url, opcoes);
  };
  window.dispatchEvent(new Event("focus"));
  await esperar();
  canais[0].receber({ origem: "outra-janela", chave: "niko:z", valor: "novo" });
  soltarLeitura();
  await esperar();
  assert.equal(armazenamento.lerChave("niko:z"), "novo");
  globalThis.fetch = fetchOriginal;
  lerAntesDe = null;
});

test("dados do telemóvel avisam as outras janelas e fundem com uma edição local por enviar", async () => {
  const [canal] = canais;
  armazenamento.aplicarRemoto("niko:telefone", "do-telemovel");
  assert.equal(armazenamento.lerChave("niko:telefone"), "do-telemovel");
  assert.deepEqual(canal.enviadas.at(-1), { origem: canal.enviadas.at(-1).origem, chave: "niko:telefone", valor: "do-telemovel" });

  const tarefas = (...ids) => JSON.stringify({ state: { tarefas: ids.map((id) => ({ id, titulo: id })) }, version: 0 });
  armazenamento.gravarChave("niko:rotina-tel", tarefas("a"));
  let envio = armazenamento.salvarAgora();
  liberarPost();
  await envio;
  armazenamento.gravarChave("niko:rotina-tel", tarefas("a", "local"));
  armazenamento.aplicarRemoto("niko:rotina-tel", tarefas("a", "remota"));
  const ids = JSON.parse(armazenamento.lerChave("niko:rotina-tel")).state.tarefas.map((t) => t.id).sort();
  assert.deepEqual(ids, ["a", "local", "remota"]);
  assert.deepEqual(JSON.parse(canal.enviadas.at(-1).valor).state.tarefas.map((t) => t.id).sort(), ["a", "local", "remota"]);
  envio = armazenamento.salvarAgora();
  liberarPost();
  await envio;
});
