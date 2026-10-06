import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { mesclar, mesclarTexto } = await servidor.ssrLoadModule("/src/ponte/mesclar.ts");

const tarefa = (id, titulo, status = "aberta") => ({ id, titulo, status });

test("itens criados em janelas diferentes ficam os dois", () => {
  const base = { state: { tarefas: [tarefa("a", "A")] } };
  const local = { state: { tarefas: [tarefa("a", "A"), tarefa("b", "B")] } };
  const remoto = { state: { tarefas: [tarefa("a", "A"), tarefa("c", "C")] } };
  assert.deepEqual(mesclar(base, local, remoto).state.tarefas.map((t) => t.id).sort(), ["a", "b", "c"]);
});

test("edição de um lado e criação do outro não se perdem", () => {
  const base = { tarefas: [tarefa("a", "A")] };
  const local = { tarefas: [tarefa("a", "A", "concluida")] };
  const remoto = { tarefas: [tarefa("a", "A"), tarefa("b", "B")] };
  assert.deepEqual(mesclar(base, local, remoto), { tarefas: [tarefa("a", "A", "concluida"), tarefa("b", "B")] });
});

test("campos diferentes do mesmo item mudados em janelas diferentes são combinados", () => {
  const base = { itens: [tarefa("a", "A")] };
  const local = { itens: [tarefa("a", "Novo título")] };
  const remoto = { itens: [tarefa("a", "A", "concluida")] };
  assert.deepEqual(mesclar(base, local, remoto), { itens: [tarefa("a", "Novo título", "concluida")] });
});

test("apagar de um lado respeita a exclusão se o outro não mexeu no item", () => {
  const base = { itens: [tarefa("a", "A"), tarefa("b", "B")] };
  const local = { itens: [tarefa("a", "A")] };
  const remoto = { itens: [tarefa("a", "A"), tarefa("b", "B"), tarefa("c", "C")] };
  assert.deepEqual(mesclar(base, local, remoto).itens.map((t) => t.id), ["a", "c"]);
});

test("objetos por chave, como registros por dia, combinam os dois lados", () => {
  const base = { registros: { "2026-10-05": { agua: 2 } } };
  const local = { registros: { "2026-10-05": { agua: 2 }, "2026-10-06": { agua: 1 } } };
  const remoto = { registros: { "2026-10-05": { agua: 3 } } };
  assert.deepEqual(mesclar(base, local, remoto), { registros: { "2026-10-05": { agua: 3 }, "2026-10-06": { agua: 1 } } });
});

test("conflito no mesmo valor simples mantém a versão local", () => {
  assert.equal(mesclar({ v: 1 }, { v: 2 }, { v: 3 }).v, 2);
});

test("texto inválido não quebra e mantém a versão local", () => {
  assert.equal(mesclarTexto("{", '{"a":1}', '{"a":2}'), '{"a":1}');
  assert.deepEqual(JSON.parse(mesclarTexto(null, '{"a":[{"id":"x"}]}', '{"a":[{"id":"y"}]}')).a.map((i) => i.id).sort(), ["x", "y"]);
});
