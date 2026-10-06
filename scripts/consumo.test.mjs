import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const casa = mkdtempSync(join(tmpdir(), "niko-consumo-teste-"));
process.env.USERPROFILE = casa;
process.env.HOME = casa;
for (const [pasta, token] of [[".claude", "expirado"], [".claude-trabalho", "valido"]]) {
  mkdirSync(join(casa, pasta));
  writeFileSync(join(casa, pasta, ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: token, subscriptionType: "max" } }));
}
globalThis.fetch = async (url, opcoes) => {
  if (!String(url).includes("api.anthropic.com")) throw new Error("rede bloqueada");
  if (opcoes.headers.authorization === "Bearer expirado") return new Response("{}", { status: 401 });
  return new Response(JSON.stringify({ five_hour: { utilization: 42, resets_at: "2026-10-06T15:00:00Z" } }));
};

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => {
  rmSync(casa, { recursive: true, force: true });
  return servidor.close();
});
const { lerConsumo } = await servidor.ssrLoadModule("/servidor/consumo.ts");

test("um perfil com login expirado não esconde outro perfil válido", async () => {
  const consumo = await lerConsumo(true);
  const claude = consumo.ferramentas.find((f) => f.id === "claude");
  assert.equal(claude.situacao, "ok");
  assert.equal(claude.plano, "max");
  assert.equal(claude.janelas[0].usado, 42);
});
