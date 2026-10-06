export async function lerUltimaVersao() {
  const resposta = await fetch("https://api.github.com/repos/jaimeaugusto11/NIKO-V2/releases/latest", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Niko" },
    signal: AbortSignal.timeout(15000),
  });
  if (resposta.status === 404) return { versao: null, notas: "" };
  if (!resposta.ok) throw new Error(`github_${resposta.status}`);
  const dados = await resposta.json() as { tag_name?: unknown; body?: unknown };
  if (typeof dados.tag_name !== "string" || !/^v?\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(dados.tag_name)) throw new Error("versao_invalida");
  return { versao: dados.tag_name.replace(/^v/, ""), notas: typeof dados.body === "string" ? dados.body : "" };
}
