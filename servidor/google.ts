import { novoPkce, pedirToken, receberCodigoOAuth } from "./oauth";

const URL_TOKEN = "https://oauth2.googleapis.com/token";

export interface CredencialGoogle {
  clienteId: string;
  segredo: string;
  refresh?: string;
}

export function lerCredencialGoogle(texto: string): CredencialGoogle {
  const c = JSON.parse(texto) as CredencialGoogle;
  if (!c.clienteId || !c.segredo) throw new Error("credencial_invalida");
  return c;
}

export function clienteGoogleValido(clienteId: string): boolean {
  return /^[\w.-]+\.apps\.googleusercontent\.com$/.test(clienteId);
}

const acessos = new Map<string, { token: string; expira: number }>();
const renovacoesEmAndamento = new Map<string, Promise<string>>();

// Gmail e Google Calendar podem usar o mesmo cliente OAuth com autorizações diferentes; o token de acesso é guardado pela autorização.
const chaveDoAcesso = (c: CredencialGoogle) => `${c.clienteId}|${c.refresh ?? ""}`;

function guardarAcesso(c: CredencialGoogle, token: string, expiraEm?: number) {
  acessos.set(chaveDoAcesso(c), { token, expira: Date.now() + (expiraEm ?? 3000) * 1000 - 60000 });
}

export async function autorizarGoogle(clienteId: string, segredo: string, escopos: string[], servico: string): Promise<CredencialGoogle> {
  if (!clienteGoogleValido(clienteId)) throw new Error("cliente_id_invalido");
  if (!segredo) throw new Error("segredo_invalido");
  const { verificador, desafio, estado } = novoPkce();
  const { codigo, redirecionamento } = await receberCodigoOAuth({
    servico,
    estado,
    host: "127.0.0.1",
    montarUrl: (redirect_uri) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clienteId,
        redirect_uri,
        response_type: "code",
        scope: escopos.join(" "),
        code_challenge: desafio,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
        state: estado,
      })}`,
  });
  const json = await pedirToken(URL_TOKEN, { code: codigo, client_id: clienteId, client_secret: segredo, redirect_uri: redirecionamento, grant_type: "authorization_code", code_verifier: verificador });
  if (json.error || !json.refresh_token) throw new Error(json.error_description ?? json.error ?? "sem_autorizacao");
  const credencial = { clienteId, segredo, refresh: json.refresh_token };
  if (json.access_token) guardarAcesso(credencial, json.access_token, json.expires_in);
  return credencial;
}

async function renovar(c: CredencialGoogle): Promise<string> {
  if (!c.refresh) throw new Error("sem_autorizacao");
  const json = await pedirToken(URL_TOKEN, { client_id: c.clienteId, client_secret: c.segredo, refresh_token: c.refresh, grant_type: "refresh_token" });
  if (json.error || !json.access_token) throw new Error(json.error === "invalid_grant" ? "autorizacao_expirada" : json.error ?? "sem_token");
  guardarAcesso(c, json.access_token, json.expires_in);
  return json.access_token;
}

export function tokenGoogle(c: CredencialGoogle): Promise<string> {
  const chave = chaveDoAcesso(c);
  const guardado = acessos.get(chave);
  if (guardado && guardado.expira > Date.now()) return Promise.resolve(guardado.token);
  const emAndamento = renovacoesEmAndamento.get(chave);
  if (emAndamento) return emAndamento;
  const renovacao = renovar(c).finally(() => renovacoesEmAndamento.delete(chave));
  renovacoesEmAndamento.set(chave, renovacao);
  return renovacao;
}

export async function apiGoogle<T>(c: CredencialGoogle, url: string, corpo?: unknown): Promise<T> {
  const token = await tokenGoogle(c);
  const r = await fetch(url, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { "content-type": "application/json" }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`http_${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return (await r.json()) as T;
}
