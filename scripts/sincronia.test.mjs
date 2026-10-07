import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { escolher } = await servidor.ssrLoadModule("/src/sincronia/escolher.ts");
const { reconciliar } = await servidor.ssrLoadModule("/src/sincronia/reconciliar.ts");
const agora = Date.UTC(2026, 0, 2);
const arranque = Date.UTC(1970, 0, 1);

function itens(texto) {
  return JSON.parse(texto).map((x) => x.id).sort();
}

test("o mais recente ganha", () => {
  const escolha = escolher({ valor: "a", em: 10 }, { valor: "b", em: 20 });
  assert.equal(escolha.valor, "b");
  assert.equal(escolha.escreverLocal, true);
  assert.equal(escolha.escreverRemoto, false);
});

test("no mesmo instante fica o local", () => {
  const escolha = escolher({ valor: "a", em: 10 }, { valor: "b", em: 10 });
  assert.equal(escolha.valor, "a");
  assert.equal(escolha.escreverRemoto, true);
});

test("valores iguais não são reescritos", () => {
  const escolha = escolher({ valor: "a", em: 10 }, { valor: "a", em: 30 });
  assert.equal(escolha.escreverLocal, false);
  assert.equal(escolha.escreverRemoto, false);
  assert.equal(escolha.em, 30);
});

test("só um lado existe e esse segue", () => {
  assert.equal(escolher({ valor: "a", em: 1 }, null).escreverRemoto, true);
  assert.equal(escolher(null, { valor: "b", em: 2 }).escreverLocal, true);
});

test("a primeira ligação do computador não apaga o que o telemóvel já tinha", () => {
  const pc = JSON.stringify([{ id: "pc", titulo: "Relatório" }]);
  const tel = JSON.stringify([{ id: "tel", titulo: "Comprar pão" }]);
  const escolha = reconciliar({ valor: pc, em: agora }, { valor: tel, em: arranque }, undefined);
  assert.deepEqual(itens(escolha.valor), ["pc", "tel"]);
  assert.equal(escolha.escreverLocal, true);
  assert.equal(escolha.escreverRemoto, true);
});

test("edições ao mesmo tempo juntam tarefas e um apagado sai dos dois lados", () => {
  const base = JSON.stringify({ state: { tarefas: [{ id: "a", titulo: "A" }, { id: "b", titulo: "B" }], contas: [{ id: "conta", nome: "À ordem" }] } });
  const pc = JSON.stringify({ state: { tarefas: [{ id: "a", titulo: "A no pc" }], contas: [{ id: "conta", nome: "À ordem" }, { id: "poupanca", nome: "Poupança" }] } });
  const tel = JSON.stringify({ state: { tarefas: [{ id: "a", titulo: "A no tel" }, { id: "b", titulo: "B" }, { id: "c", titulo: "Pão" }], contas: [{ id: "conta", nome: "À ordem" }] } });
  const escolha = reconciliar({ valor: pc, em: agora }, { valor: tel, em: agora + 1000 }, base);
  const lista = JSON.parse(escolha.valor);
  assert.deepEqual(lista.state.tarefas.map((x) => x.id), ["a", "c"]);
  assert.equal(lista.state.tarefas[0].titulo, "A no pc");
  assert.deepEqual(lista.state.contas.map((x) => x.id), ["conta", "poupanca"]);
});

test("valores iguais continuam sem reescrita depois da fusão", () => {
  const escolha = reconciliar({ valor: "a", em: agora }, { valor: "a", em: arranque }, undefined);
  assert.equal(escolha.escreverLocal, false);
  assert.equal(escolha.escreverRemoto, false);
});
