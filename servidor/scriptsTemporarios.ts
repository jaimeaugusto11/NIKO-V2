import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const conferidos = new Set<string>();

export function garantirScript(prefixo: string, conteudo: string): string {
  const assinatura = createHash("sha256").update(conteudo).digest("hex").slice(0, 16);
  const caminho = join(tmpdir(), `${prefixo}-${assinatura}.ps1`);
  if (conferidos.has(caminho)) return caminho;
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
