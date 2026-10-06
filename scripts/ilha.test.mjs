import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

globalThis.BroadcastChannel = undefined;
globalThis.localStorage = { getItem: () => null, setItem: () => undefined };
globalThis.window = { setTimeout, clearTimeout };
const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { alternarAbaDaBarra, criarAlternadorDoIniciar } = await servidor.ssrLoadModule("/src/janelas/ilha/barra/acoesDaBarra.ts");
const { useIlha } = await servidor.ssrLoadModule("/src/estado/ilha.ts");
const { controle, sistema } = await servidor.ssrLoadModule("/src/ponte/ponteLocal.ts");

test("clicar novamente na mesma aba recolhe a ilha", () => {
  useIlha.setState({ estado: "compacta", aba: "hoje" });
  alternarAbaDaBarra("hoje");
  assert.equal(useIlha.getState().estado, "expandida");
  alternarAbaDaBarra("hoje");
  assert.equal(useIlha.getState().estado, "compacta");
});

test("trocar de aba não recolhe uma ilha expandida", () => {
  useIlha.setState({ estado: "expandida", aba: "calendario" });
  alternarAbaDaBarra("hoje");
  assert.equal(useIlha.getState().estado, "expandida");
  assert.equal(useIlha.getState().aba, "hoje");
});

test("Iniciar usa o estado capturado antes de o clique roubar o foco", async () => {
  const pedidos = [];
  const alternador = criarAlternadorDoIniciar(async () => ({ aberto: true }), async (abertoAntes) => pedidos.push(abertoAntes));
  alternador.preparar();
  await alternador.alternar();
  assert.deepEqual(pedidos, [true]);
});

test("cliques rápidos não acumulam comandos para o Iniciar", async () => {
  let finalizar;
  let pedidos = 0;
  const alternador = criarAlternadorDoIniciar(async () => ({ aberto: false }), async () => {
    pedidos++;
    await new Promise((resolver) => { finalizar = resolver; });
  });
  const primeiro = alternador.alternar();
  await new Promise((resolver) => setImmediate(resolver));
  await alternador.alternar();
  assert.equal(pedidos, 1);
  finalizar();
  await primeiro;
});

test("falha na leitura do Iniciar não inventa um estado aberto", async () => {
  const pedidos = [];
  const alternador = criarAlternadorDoIniciar(async () => { throw new Error("indisponivel"); }, async (estado) => pedidos.push(estado));
  alternador.preparar();
  await alternador.alternar();
  assert.deepEqual(pedidos, [undefined]);
});

test("segundo clique usa a confirmação real do Windows mesmo sem mover o mouse", async () => {
  const pedidos = [];
  const alternador = criarAlternadorDoIniciar(async () => ({ aberto: false }), async (abertoAntes) => {
    pedidos.push(abertoAntes);
    return { aberto: !abertoAntes };
  });
  alternador.preparar();
  await alternador.alternar();
  await alternador.alternar();
  assert.deepEqual(pedidos, [false, true]);
});

test("ponte preserva estado real do Bluetooth e o estado anterior do Iniciar", async () => {
  const pedidos = [];
  globalThis.fetch = async (url, opcoes) => {
    pedidos.push({ url, corpo: opcoes?.body ? JSON.parse(opcoes.body) : null });
    return Response.json(url.endsWith("bluetooth") ? { aparelhos: { id: "teste", nome: "Fone", ativo: false, conectado: null } } : { aberto: true });
  };
  assert.equal((await sistema.bluetooth())[0].conectado, null);
  assert.equal((await controle.iniciar()).aberto, true);
  await controle.alternarIniciar(true);
  assert.deepEqual(pedidos.at(-1).corpo, { nome: "iniciar", abertoAntes: true });
});

test("leitura nativa do Bluetooth não usa status do driver como conexão", { skip: process.platform !== "win32" }, async () => {
  const { listarBluetooth } = await servidor.ssrLoadModule("/servidor/sistema.ts");
  const resultado = await listarBluetooth();
  assert.ok(Array.isArray(resultado.aparelhos));
  for (const aparelho of resultado.aparelhos) {
    assert.equal(typeof aparelho.id, "string");
    assert.ok(aparelho.conectado === null || typeof aparelho.conectado === "boolean");
    assert.equal(aparelho.ativo, aparelho.conectado === true);
  }
});

test("detecção nativa do Iniciar compila e retorna um booleano sem abrir janelas", { skip: process.platform !== "win32" }, async () => {
  const { lerIniciar, encerrarControle } = await servidor.ssrLoadModule("/servidor/controleRapido.ts");
  try {
    assert.equal(typeof (await lerIniciar()).aberto, "boolean");
  } finally {
    encerrarControle();
  }
});
