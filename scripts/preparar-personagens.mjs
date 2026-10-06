import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ORIGEM = "personagens-originais";
const DESTINO = join("public", "personagens");
const ESTADOS = ["ocioso", "ouvindo", "pensando", "escrevendo", "sucesso", "alerta", "erro", "dormindo"];

function preparar(svg) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/viewBox="0 0 512 512"(\s+width="512"\s+height="512")?/, 'viewBox="66 78 380 380" width="380" height="380"');
}

let total = 0;
for (const agente of readdirSync(ORIGEM, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const pasta = join(ORIGEM, agente);
  const arquivos = readdirSync(pasta).filter((a) => a.toLowerCase().endsWith(".svg"));
  if (arquivos.length === 0) {
    console.log(`${agente}: nenhum SVG ainda, mantendo o que existe em ${DESTINO}`);
    continue;
  }
  const faltando = ESTADOS.filter((e) => !arquivos.includes(`${e}.svg`));
  if (faltando.length) console.log(`${agente}: faltam ${faltando.join(", ")}`);
  const saida = join(DESTINO, agente);
  if (!existsSync(saida)) mkdirSync(saida, { recursive: true });
  for (const arquivo of arquivos) {
    const estado = arquivo.replace(/\.svg$/i, "");
    if (!ESTADOS.includes(estado)) {
      console.log(`${agente}: ignorado ${arquivo} (nome fora dos 8 estados)`);
      continue;
    }
    writeFileSync(join(saida, `${estado}.svg`), preparar(readFileSync(join(pasta, arquivo), "utf8")), "utf8");
    total++;
  }
  console.log(`${agente}: ${arquivos.length} arquivo(s) preparados`);
}
console.log(`Pronto. ${total} SVG(s) copiados para ${DESTINO}.`);
