import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { escolher } = await servidor.ssrLoadModule("/src/sincronia/escolher.ts");

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
