import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { lerArgumentos, lerVersoes, validarVersoes, validarTag, planejarVersao, sincronizarVersao, verificarPublicacao, validarArtefatos } from "./versao-release.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

async function lancar() {
  const opcoes = lerArgumentos(process.argv.slice(2));
  if (opcoes.ajuda) {
    console.log('Nova release: pnpm lancar 0.1.2 "Notas da versão"\nSó conferir: pnpm lancar:verificar\nPrévia da sincronização: pnpm lancar 0.1.2 --verificar\nRepetir um build publicado: pnpm lancar 0.1.1 --recompilar "Notas da versão"');
    return;
  }
  const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined;
  if (opcoes.verificar) {
    if (opcoes.versao) {
      validarTag(opcoes.versao, tag);
      const plano = planejarVersao(raiz, opcoes.versao);
      console.log(`Prévia da versão ${opcoes.versao}:\n${plano.map((a) => `  ${a.nome}: ${a.antes === a.depois ? "sem mudança" : "será atualizado"}`).join("\n")}\nNenhum arquivo foi alterado. Nenhum build foi iniciado.`);
    } else {
      const arquivos = lerVersoes(raiz);
      const versao = validarVersoes(arquivos);
      validarTag(versao, tag);
      console.log(`Versões sincronizadas em ${versao}:\n${arquivos.map((a) => `  ${a.nome}: ${a.versao}`).join("\n")}`);
    }
    return;
  }
  const versao = opcoes.versao;
  validarTag(versao, tag);
  const plano = planejarVersao(raiz, versao);
  const chave = join(homedir(), ".tauri", "niko-atualizacao.key");
  const chaveConfigurada = process.env.TAURI_SIGNING_PRIVATE_KEY;
  if (!chaveConfigurada && !existsSync(chave)) throw new Error(`Chave de atualização não encontrada em ${chave}. Use a mesma chave das versões anteriores.`);
  if (!opcoes.recompilar) await verificarPublicacao(versao);
  sincronizarVersao(plano);
  validarVersoes(lerVersoes(raiz), versao);
  console.log(`Versão ${versao} sincronizada. Iniciando o build assinado.`);
  const inicio = Date.now();
  execSync("pnpm tauri build", {
    cwd: raiz,
    stdio: "inherit",
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: chaveConfigurada || readFileSync(chave, "utf8"), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" },
  });
  validarVersoes(lerVersoes(raiz), versao);
  const { pasta, instalador, assinatura } = validarArtefatos(raiz, versao, inicio);
  const manifesto = {
    version: versao,
    notes: opcoes.notas || `Niko ${versao}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": { signature: assinatura, url: `https://github.com/jaimeaugusto11/NIKO-V2/releases/download/v${versao}/${instalador}` },
    },
  };
  writeFileSync(join(pasta, "latest.json"), JSON.stringify(manifesto, null, 2));
  if (opcoes.recompilar) console.log("Recompilação concluída. Isso não cria nem substitui uma release no GitHub.");
  console.log(`\nPronto. Para a release v${versao} em github.com/jaimeaugusto11/NIKO-V2, os arquivos são:\n  ${join(pasta, instalador)}\n  ${join(pasta, "latest.json")}\nNada foi publicado automaticamente.`);
}

try {
  await lancar();
} catch (erro) {
  console.error(`Lançamento interrompido: ${erro.message}`);
  process.exitCode = 1;
}
