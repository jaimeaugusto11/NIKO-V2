import { createServer } from "node:http";
import { rotas } from "./ponte";
import { fecharBanco } from "./banco";
import { encerrarMidia } from "./midia";
import { encerrarJanelas } from "./janelasWindows";
import { encerrarControle } from "./controleRapido";
import { encerrarSistema } from "./sistema";
import { iniciarConexoesDeFundo } from "./conexoes";
import { pararTelegram } from "./telegram";
import { encerrarSocial } from "./social";

const porta = Number(process.env.NIKO_PORTA) || 47831;
const ORIGENS = new Set(["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"]);

const servidor = createServer((req, res) => {
  const origem = req.headers.origin;
  if (origem && ORIGENS.has(origem)) {
    res.setHeader("access-control-allow-origin", origem);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-headers", "x-niko, x-niko-token, x-niko-banco, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("access-control-max-age", "600");
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  void rotas(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});

process.on("uncaughtException", (e) => {
  process.stderr.write(`${new Date().toISOString()} erro: ${e.stack ?? e.message}\n`);
});
servidor.on("error", (e) => {
  process.stderr.write(`${new Date().toISOString()} falha ao abrir a porta ${porta}: ${e.message}\n`);
  process.exit(1);
});
servidor.listen(porta, "127.0.0.1", () => {
  process.stderr.write(`${new Date().toISOString()} ponte ouvindo em 127.0.0.1:${porta}\n`);
  iniciarConexoesDeFundo();
});

let encerrando = false;
const encerrar = () => {
  if (encerrando) return;
  encerrando = true;
  encerrarMidia();
  encerrarJanelas();
  encerrarControle();
  encerrarSistema();
  pararTelegram();
  encerrarSocial();
  fecharBanco();
  servidor.close();
  process.exit(0);
};
process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);
// No Windows o Niko não consegue mandar SIGTERM: ele fecha o stdin da ponte para pedir um encerramento limpo.
if (process.env.NIKO_ENCERRAR_PELO_STDIN === "1") {
  process.stdin.on("end", encerrar);
  process.stdin.on("error", encerrar);
  process.stdin.resume();
}
const pai = Number(process.env.NIKO_PAI);
if (pai > 0) {
  setInterval(() => {
    try {
      process.kill(pai, 0);
    } catch {
      encerrar();
    }
  }, 3000).unref();
}