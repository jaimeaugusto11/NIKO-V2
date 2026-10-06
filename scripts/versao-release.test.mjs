import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerArgumentos, lerVersoes, validarVersoes, validarTag, planejarVersao, sincronizarVersao, verificarPublicacao, validarArtefatos, proximaVersao, ultimaVersaoPublicada } from "./versao-release.mjs";

function projeto(t, versoes = ["0.1.1", "0.1.1", "0.1.1", "0.1.1"]) {
  const raiz = mkdtempSync(join(tmpdir(), "niko-release-teste-"));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  mkdirSync(join(raiz, "src-tauri"));
  writeFileSync(join(raiz, "package.json"), `{\r\n  "name": "niko",\r\n  "version": "${versoes[0]}",\r\n  "scripts": { "dev": "vite" }\r\n}\r\n`);
  writeFileSync(join(raiz, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: versoes[1], plugins: { updater: { pubkey: "chave-publica-preservada" } } }));
  writeFileSync(join(raiz, "src-tauri", "Cargo.toml"), `[package]\nname = "niko"\nversion = "${versoes[2]}"\n\n[dependencies]\nserde = { version = "1" }\n`);
  writeFileSync(join(raiz, "src-tauri", "Cargo.lock"), `version = 4\n\n[[package]]\nname = "outra-biblioteca"\nversion = "9.0.0"\n\n[[package]]\nname = "niko"\nversion = "${versoes[3]}"\ndependencies = ["serde"]\n`);
  writeFileSync(join(raiz, "README.md"), "![Versão](https://img.shields.io/badge/versão-0.1.1-0b0d10?style=flat-square)\n");
  return raiz;
}

test("exige versão explícita e mantém as notas separadas", () => {
  assert.throws(() => lerArgumentos(["Melhorias em Estudos"]), /Informe a versão/);
  assert.throws(() => lerArgumentos([]), /Informe a versão/);
  assert.deepEqual(lerArgumentos(["0.1.2", "Melhorias", "em Estudos"]), { versao: "0.1.2", notas: "Melhorias em Estudos", verificar: false, recompilar: false, automatica: false, ajuda: false });
  assert.equal(lerArgumentos(["--automatica", "Correção do chat"]).automatica, true);
  assert.equal(lerArgumentos(["--automatica", "Correção do chat"]).versao, undefined);
  assert.throws(() => lerArgumentos(["--automatica", "0.1.2"]), /calculada/);
  assert.throws(() => lerArgumentos(["--automatica", "--recompilar"]), /não combina/);
  assert.equal(lerArgumentos(["--versao", "0.1.2", "Novidades"]).versao, "0.1.2");
  assert.equal(lerArgumentos(["--versao=0.1.2", "Novidades"]).notas, "Novidades");
  assert.equal(lerArgumentos(["--verificar"]).verificar, true);
  assert.equal(lerArgumentos(["--ajuda"]).ajuda, true);
});

test("recusa versões inválidas, argumentos desconhecidos e versões duplicadas", () => {
  for (const versao of ["0.1", "01.1.2", "v0.1.2", "0.1.2-beta", "../0.1.2"]) {
    assert.throws(() => lerArgumentos([versao]), /versão|Versão/);
  }
  assert.throws(() => lerArgumentos(["--versao"]), /versão|Versão/);
  assert.throws(() => lerArgumentos(["0.1.2", "--desconhecido"]), /Argumento desconhecido/);
  assert.throws(() => lerArgumentos(["0.1.2", "--versao", "0.1.3"]), /uma vez/);
});

test("identifica divergências nos quatro arquivos e valida a tag", (t) => {
  const raiz = projeto(t, ["0.1.1", "0.1.2", "0.1.1", "0.1.0"]);
  assert.throws(() => validarVersoes(lerVersoes(raiz)), /Versões divergentes/);
  assert.throws(() => validarTag("0.1.2", "v0.1.1"), /Tag/);
  validarTag("0.1.2", "v0.1.2");
  validarTag("0.1.2", undefined);
});

test("planeja sem escrever e sincroniza preservando conteúdo, dependências e chave", (t) => {
  const raiz = projeto(t, ["0.1.1", "0.1.2", "0.1.1", "0.1.1"]);
  const antes = readFileSync(join(raiz, "package.json"), "utf8");
  const plano = planejarVersao(raiz, "0.1.2");
  assert.equal(readFileSync(join(raiz, "package.json"), "utf8"), antes);
  sincronizarVersao(plano);
  assert.equal(validarVersoes(lerVersoes(raiz), "0.1.2"), "0.1.2");
  assert.equal(readFileSync(join(raiz, "package.json"), "utf8"), antes.replace('"0.1.1"', '"0.1.2"'));
  assert.match(readFileSync(join(raiz, "src-tauri", "Cargo.toml"), "utf8"), /serde = \{ version = "1" \}/);
  assert.match(readFileSync(join(raiz, "src-tauri", "Cargo.lock"), "utf8"), /name = "outra-biblioteca"\nversion = "9.0.0"/);
  assert.match(readFileSync(join(raiz, "src-tauri", "tauri.conf.json"), "utf8"), /chave-publica-preservada/);
  assert.match(readFileSync(join(raiz, "README.md"), "utf8"), /versão-0.1.2-/);
});

test("bloqueia redução da versão e compara números, não texto", (t) => {
  const raiz = projeto(t, ["0.1.9", "0.1.9", "0.1.9", "0.1.9"]);
  assert.throws(() => planejarVersao(raiz, "0.1.8"), /menor/);
  assert.equal(planejarVersao(raiz, "0.1.10").filter((item) => item.nome !== "README.md").length, 4);
});

test("preserva tokens de substituição no conteúdo original", (t) => {
  const raiz = projeto(t);
  const caminho = join(raiz, "package.json");
  const antes = readFileSync(caminho, "utf8").replace('"name": "niko"', () => '"name": "niko", "description": "$& $1 $`"');
  writeFileSync(caminho, antes);
  sincronizarVersao(planejarVersao(raiz, "0.1.2"));
  assert.equal(readFileSync(caminho, "utf8"), antes.replace('"0.1.1"', '"0.1.2"'));
});

test("reverte escrita parcial sem apagar um temporário preexistente", (t) => {
  const raiz = projeto(t);
  const plano = planejarVersao(raiz, "0.1.2");
  const temporario = `${plano[1].caminho}.niko-release-${process.pid}.tmp`;
  writeFileSync(temporario, "conteúdo preexistente");
  assert.throws(() => sincronizarVersao(plano), /Alterações de versão revertidas/);
  for (const arquivo of plano) assert.equal(readFileSync(arquivo.caminho, "utf8"), arquivo.antes);
  assert.equal(readFileSync(temporario, "utf8"), "conteúdo preexistente");
});

test("não escreve nada quando um arquivo está inválido", (t) => {
  const raiz = projeto(t);
  const antes = readFileSync(join(raiz, "package.json"), "utf8");
  writeFileSync(join(raiz, "src-tauri", "Cargo.lock"), "version = 4\n");
  assert.throws(() => planejarVersao(raiz, "0.1.2"), /Cargo.lock/);
  assert.equal(readFileSync(join(raiz, "package.json"), "utf8"), antes);
});

test("recusa aplicar um plano se algum arquivo mudou após a leitura", (t) => {
  const raiz = projeto(t);
  const plano = planejarVersao(raiz, "0.1.2");
  const caminho = join(raiz, "src-tauri", "Cargo.toml");
  const editado = `${readFileSync(caminho, "utf8")}\n[features]\npadrao = []\n`;
  writeFileSync(caminho, editado);
  assert.throws(() => sincronizarVersao(plano), /mudou/);
  assert.equal(JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).version, "0.1.1");
  assert.equal(readFileSync(caminho, "utf8"), editado);
});

test("a versão automática sobe a correção e respeita um salto explícito", async () => {
  const anterior = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "token-teste";
  try {
    let autorizacao;
    const publicada = await ultimaVersaoPublicada(async (_url, init) => {
      autorizacao = init.headers.Authorization;
      return { status: 200, json: async () => ({ tag_name: "v0.3.0" }) };
    });
    assert.equal(publicada, "0.3.0");
    assert.equal(autorizacao, "Bearer token-teste");
    assert.equal(await ultimaVersaoPublicada(async () => ({ status: 404 })), null);
    assert.equal(proximaVersao("0.3.0", "0.3.0"), "0.3.1");
    assert.equal(proximaVersao("0.3.0", null), "0.3.1");
    assert.equal(proximaVersao("0.4.0", "0.3.9"), "0.4.0");
    assert.equal(proximaVersao("0.3.0", "0.3.4"), "0.3.5");
  } finally {
    if (anterior === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = anterior;
  }
});

test("bloqueia release já publicada, admite ausência e recusa falhas de rede", async () => {
  let url;
  await verificarPublicacao("0.1.2", async (alvo) => { url = alvo; return { status: 404 }; });
  assert.equal(url, "https://api.github.com/repos/jaimeaugusto11/NIKO-V2/releases/tags/v0.1.2");
  await assert.rejects(verificarPublicacao("0.1.2", async () => ({ status: 200 })), /já existe/);
  await assert.rejects(verificarPublicacao("0.1.2", async () => ({ status: 403 })), /GitHub/);
  await assert.rejects(verificarPublicacao("0.1.2", async () => { throw new Error("sem rede"); }), /GitHub/);
});

test("exige instalador e assinatura da versão certa e do build atual", (t) => {
  const raiz = projeto(t);
  const pasta = join(raiz, "src-tauri", "target", "release", "bundle", "nsis");
  mkdirSync(pasta, { recursive: true });
  assert.throws(() => validarArtefatos(raiz, "0.1.2", Date.now()), /não foi gerado/);
  const instalador = join(pasta, "Niko_0.1.2_x64-setup.exe");
  const assinatura = `${instalador}.sig`;
  writeFileSync(instalador, "instalador de teste");
  writeFileSync(assinatura, "assinatura de teste");
  assert.equal(validarArtefatos(raiz, "0.1.2", Date.now()).assinatura, "assinatura de teste");
  assert.throws(() => validarArtefatos(raiz, "0.1.1", Date.now()), /não foi gerado/);
  const antigo = new Date(Date.now() - 60000);
  utimesSync(assinatura, antigo, antigo);
  assert.throws(() => validarArtefatos(raiz, "0.1.2", Date.now()), /build atual/);
  writeFileSync(assinatura, "   ");
  assert.throws(() => validarArtefatos(raiz, "0.1.2", Date.now()), /vazia/);
});
