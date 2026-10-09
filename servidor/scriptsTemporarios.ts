import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const conferidos = new Set<string>();

// Fora do %TEMP%, que o Storage Sense limpa com a ponte a correr. Lido na hora para respeitar o APPDATA dos testes.
function pastaScripts(): string {
  const pasta = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "com.niko.desktop", "scripts");
  try {
    mkdirSync(pasta, { recursive: true });
    return pasta;
  } catch {
    return tmpdir();
  }
}

export function garantirScript(prefixo: string, conteudo: string): string {
  const assinatura = createHash("sha256").update(conteudo).digest("hex").slice(0, 16);
  const caminho = join(pastaScripts(), `${prefixo}-${assinatura}.ps1`);
  if (conferidos.has(caminho) && existsSync(caminho)) return caminho;
  let atual: string | null = null;
  try {
    atual = existsSync(caminho) ? readFileSync(caminho, "utf8") : null;
  } catch {
    atual = null;
  }
  if (atual !== conteudo) {
    const temporario = `${caminho}.${process.pid}.gravando`;
    writeFileSync(temporario, conteudo, "utf8");
    renameSync(temporario, caminho);
  }
  conferidos.add(caminho);
  return caminho;
}
