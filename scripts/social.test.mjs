import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

process.env.NIKO_SUPABASE_URL = "https://exemplo-teste.supabase.co";
process.env.NIKO_SUPABASE_CHAVE = "chave-publica-de-teste-com-mais-de-vinte-caracteres";
const memoria = new Map();
globalThis.BroadcastChannel = undefined;
globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: (k) => memoria.delete(k) };
globalThis.window = Object.assign(new EventTarget(), { location: { search: "" }, setTimeout, clearTimeout });
const pedidos = [];
globalThis.fetch = async (url) => {
  pedidos.push(String(url));
  return new Response(JSON.stringify({ ok: true }));
};

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { useSocial } = await servidor.ssrLoadModule("/src/estado/social.ts");
const { tituloDaConversa } = await servidor.ssrLoadModule("/src/ponte/social.ts");
const { T } = await servidor.ssrLoadModule("/src/textos/textos.ts");
const ponteSocial = await servidor.ssrLoadModule("/servidor/social.ts");

const conversa = (id, extra = {}) => ({ id, tipo: "direta", nome: null, atualizadaEm: "2026-10-06T10:00:00Z", participantes: [{ id: "eu", nome: "Jaime", email: "eu@x.com" }, { id: "ana", nome: "Ana", email: "ana@x.com" }], ultima: null, naoLidas: 0, ...extra });
const mensagem = (id, conversaId, autorId, criadaEm = "2026-10-06T11:00:00Z") => ({ id, conversaId, autorId, texto: `texto ${id}`, criadaEm });

beforeEach(() => {
  pedidos.length = 0;
  useSocial.setState({ situacao: "dentro", usuario: { id: "eu", nome: "Jaime", email: "eu@x.com" }, conversas: [conversa("c1"), conversa("c2")], mensagens: { c1: [] }, temMais: {}, aberta: null });
});

test("mensagem de outra pessoa conta como não lida e sobe a conversa na lista", () => {
  useSocial.getState().receber({ tipo: "mensagem", mensagem: mensagem("m1", "c2", "ana") });
  const { conversas } = useSocial.getState();
  assert.equal(conversas[0].id, "c2");
  assert.equal(conversas[0].naoLidas, 1);
  assert.equal(conversas[0].ultima.texto, "texto m1");
});

test("a mesma mensagem recebida duas vezes (envio e tempo real) aparece uma só vez", () => {
  const m = mensagem("m2", "c1", "eu");
  useSocial.getState().receber({ tipo: "mensagem", mensagem: m });
  useSocial.getState().receber({ tipo: "mensagem", mensagem: m });
  assert.equal(useSocial.getState().mensagens.c1.length, 1);
  assert.equal(useSocial.getState().conversas.find((c) => c.id === "c1").naoLidas, 0);
});

test("na conversa aberta a mensagem nova não conta como não lida e é marcada como lida", () => {
  useSocial.setState({ aberta: "c1" });
  useSocial.getState().receber({ tipo: "mensagem", mensagem: mensagem("m3", "c1", "ana") });
  assert.equal(useSocial.getState().conversas.find((c) => c.id === "c1").naoLidas, 0);
  assert.ok(pedidos.some((p) => p.includes("/ponte/social/lida")));
});

test("mensagens chegam ordenadas pela data mesmo fora de ordem", () => {
  useSocial.getState().receber({ tipo: "mensagem", mensagem: mensagem("tarde", "c1", "ana", "2026-10-06T12:00:00Z") });
  useSocial.getState().receber({ tipo: "mensagem", mensagem: mensagem("cedo", "c1", "ana", "2026-10-06T09:00:00Z") });
  assert.deepEqual(useSocial.getState().mensagens.c1.map((m) => m.id), ["cedo", "tarde"]);
});

test("título da conversa direta é o nome da outra pessoa; o do grupo é o nome do grupo", () => {
  assert.equal(tituloDaConversa(conversa("c"), "eu"), "Ana");
  assert.equal(tituloDaConversa(conversa("g", { tipo: "grupo", nome: "Família" }), "eu"), "Família");
});

test("erros do Supabase viram mensagens claras", () => {
  assert.equal(T.social.erro("Invalid login credentials"), "E-mail ou senha errados.");
  assert.match(T.social.erro("email_desconhecido:ana@x.com"), /ana@x\.com/);
  assert.match(T.social.erro("User already registered"), /já tem conta/);
});

test("a ponte valida senha e e-mail antes de falar com o Supabase", async () => {
  assert.equal(ponteSocial.socialConfigurado(), true);
  await assert.rejects(() => ponteSocial.registarSocial({ nome: "Ana", email: "ana@x.com", senha: "curta" }), /senha_invalida/);
  await assert.rejects(() => ponteSocial.registarSocial({ nome: "Ana", email: "nao-e-email", senha: "senha-bem-longa" }), /email_invalido/);
  await assert.rejects(() => ponteSocial.registarSocial({ nome: " ", email: "ana@x.com", senha: "senha-bem-longa" }), /nome_invalido/);
  assert.equal(pedidos.filter((p) => p.includes("supabase.co")).length, 0);
});
