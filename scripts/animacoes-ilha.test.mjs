import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { criarEstadoEtapas, receberEtapas, avancarEtapa, calcularDestinoPersonagem, calcularTrajetoArquivo } = await servidor.ssrLoadModule("/src/janelas/ilha/animacoes/regras.ts");
const etapa = (id) => ({ id: String(id), texto: `Etapa ${id}` });

test("primeira abertura mostra o histórico atual sem reproduzir animações antigas", () => {
  const estado = criarEstadoEtapas("sessao-a", [etapa(1), etapa(2), etapa(3)]);
  assert.equal(estado.anterior.id, "2");
  assert.equal(estado.atual.id, "3");
  assert.deepEqual(estado.fila, []);
});

test("atualizações em rajada entram em fila sem sobrepor etapas", () => {
  let estado = criarEstadoEtapas("sessao-a", [etapa(1)]);
  estado = receberEtapas(estado, "sessao-a", [etapa(1), etapa(2), etapa(3)]);
  assert.equal(estado.atual.id, "1");
  assert.deepEqual(estado.fila.map((e) => e.id), ["2", "3"]);
  estado = avancarEtapa(estado);
  assert.equal(estado.anterior.id, "1");
  assert.equal(estado.atual.id, "2");
  estado = avancarEtapa(estado);
  assert.equal(estado.anterior.id, "2");
  assert.equal(estado.atual.id, "3");
  assert.deepEqual(estado.fila, []);
});

test("repetir a mesma atualização não enfileira a etapa duas vezes", () => {
  const etapas = [etapa(1), etapa(2)];
  const estado = receberEtapas(criarEstadoEtapas("a", [etapa(1)]), "a", etapas);
  assert.deepEqual(receberEtapas(estado, "a", etapas), estado);
});

test("mesmo texto com identificadores diferentes continua sendo uma nova etapa", () => {
  const estado = receberEtapas(criarEstadoEtapas("a", [{ id: "1", texto: "Lendo arquivo" }]), "a", [{ id: "1", texto: "Lendo arquivo" }, { id: "2", texto: "Lendo arquivo" }]);
  assert.equal(estado.fila.length, 1);
});

test("trocar de sessão limpa a fila e não mistura projetos", () => {
  const antigo = receberEtapas(criarEstadoEtapas("a", [etapa(1)]), "a", [etapa(1), etapa(2)]);
  const novo = receberEtapas(antigo, "b", [etapa(9)]);
  assert.equal(novo.contexto, "b");
  assert.equal(novo.anterior, null);
  assert.equal(novo.atual.id, "9");
  assert.deepEqual(novo.fila, []);
});

test("fila é limitada e termina na informação mais recente", () => {
  let estado = receberEtapas(criarEstadoEtapas("a", [etapa(0)]), "a", Array.from({ length: 40 }, (_, i) => etapa(i)));
  assert.equal(estado.fila.length, 4);
  while (estado.fila.length) estado = avancarEtapa(estado);
  assert.equal(estado.atual.id, "39");
});

test("histórico reiniciado ou cortado não mantém uma animação obsoleta", () => {
  const antigo = receberEtapas(criarEstadoEtapas("a", [etapa(1)]), "a", [etapa(1), etapa(2)]);
  const novo = receberEtapas(antigo, "a", [etapa(8)]);
  assert.equal(novo.atual.id, "8");
  assert.deepEqual(novo.fila, []);
  assert.equal(receberEtapas(novo, "a", []).atual, null);
});

test("a animação não transforma etapa anterior em confirmação de sucesso", () => {
  const estado = avancarEtapa(receberEtapas(criarEstadoEtapas("a", [etapa(1)]), "a", [etapa(1), etapa(2)]));
  assert.deepEqual(estado.anterior, etapa(1));
  assert.equal("concluida" in estado.anterior, false);
});

test("destino do personagem respeita escala e não muda seu centro ao aumentar", () => {
  const origem = { left: 100, top: 0, width: 990, height: 375 };
  const destino = calcularDestinoPersonagem(origem, { left: 175, top: 105, width: 105, height: 105 }, 1.5);
  assert.deepEqual(destino, { x: 50, y: 70, escala: 1 });
  const pequeno = calcularDestinoPersonagem(origem, { left: 118, top: 6, width: 33, height: 33 }, 1.5);
  assert.equal(pequeno.escala, 22 / 70);
  assert.equal(pequeno.x + 35, 23);
  assert.equal(pequeno.y + 35, 15);
});

test("destino inválido não produz NaN nem posiciona personagem fora da tela", () => {
  const r = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(calcularDestinoPersonagem(r, { ...r, width: 0 }, 1), null);
  assert.equal(calcularDestinoPersonagem(r, r, 0), null);
  assert.equal(calcularDestinoPersonagem(r, { ...r, left: NaN }, 1), null);
});

test("arquivo viaja do ponto de soltura ao personagem em coordenadas locais", () => {
  const zona = { left: 100, top: 50, width: 600, height: 300 };
  const personagem = { left: 310, top: 125, width: 81, height: 81 };
  const trajeto = calcularTrajetoArquivo(zona, personagem, { x: 610, y: 230 }, 1.5);
  assert.deepEqual(trajeto.origem, { x: 340, y: 120 });
  assert.equal(trajeto.destino.x, 167);
  assert.ok(trajeto.destino.y > 50 && trajeto.destino.y < 100);
});

test("soltar fora da zona ou com coordenadas inválidas não inicia o efeito", () => {
  const r = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(calcularTrajetoArquivo(r, r, { x: 101, y: 50 }, 1), null);
  assert.equal(calcularTrajetoArquivo(r, r, { x: NaN, y: 50 }, 1), null);
});
