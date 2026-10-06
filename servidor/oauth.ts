import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

const TEMPO_PARA_AUTORIZAR = 180000;

export function base64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function abrirNoNavegador(url: string) {
  if (process.platform !== "win32") throw new Error("somente_windows");
  const filho = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true });
  filho.on("error", () => undefined);
  filho.unref();
}

export function novoPkce() {
  const verificador = base64url(randomBytes(48));
  return { verificador, desafio: base64url(createHash("sha256").update(verificador).digest()), estado: base64url(randomBytes(16)) };
}

function paginaDeRetorno(ok: boolean, servico: string) {
  return `<!doctype html><meta charset="utf-8"><title>Niko</title><body style="font-family:system-ui;padding:40px;background:#0e0e10;color:#f1f2f4"><h2>${ok ? `${servico} conectado.` : "Não deu certo."}</h2><p>${ok ? "Pode fechar esta aba e voltar ao Niko." : "Volte ao Niko e tente de novo."}</p></body>`;
}

/**
 * Abre a página de login no navegador e espera o retorno num servidor de loopback, numa porta livre.
 * `host` é o nome usado no endereço de retorno: o Google aceita 127.0.0.1 e a Microsoft pede localhost.
 */
export function receberCodigoOAuth(opcoes: { servico: string; estado: string; host: "127.0.0.1" | "localhost"; montarUrl: (redirecionamento: string) => string }): Promise<{ codigo: string; redirecionamento: string }> {
  return new Promise((resolver, rejeitar) => {
    let redirecionamento = "";
    const servidor = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const codigo = url.searchParams.get("code");
      const erro = url.searchParams.get("error");
      if (url.pathname !== "/" || url.searchParams.get("state") !== opcoes.estado || (!codigo && !erro)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(paginaDeRetorno(Boolean(codigo), opcoes.servico));
      clearTimeout(relogio);
      servidor.close();
      if (codigo) resolver({ codigo, redirecionamento });
      else rejeitar(new Error(url.searchParams.get("error_description") ?? erro ?? "autorizacao_negada"));
    });
    const relogio = setTimeout(() => {
      servidor.close();
      rejeitar(new Error("tempo_esgotado"));
    }, TEMPO_PARA_AUTORIZAR);
    servidor.listen(0, "127.0.0.1", () => {
      redirecionamento = `http://${opcoes.host}:${(servidor.address() as AddressInfo).port}`;
      try {
        abrirNoNavegador(opcoes.montarUrl(redirecionamento));
      } catch (e) {
        clearTimeout(relogio);
        servidor.close();
        rejeitar(e as Error);
      }
    });
  });
}

export async function pedirToken(url: string, corpo: Record<string, string>): Promise<{ access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok && !json.error) json.error = `http_${r.status}`;
  return json;
}
