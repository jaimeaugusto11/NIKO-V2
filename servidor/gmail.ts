import { apiGoogle, autorizarGoogle, lerCredencialGoogle, type CredencialGoogle } from "./google";
import { base64url } from "./oauth";

const ESCOPOS = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"];
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type CredencialGmail = CredencialGoogle;

export const lerCredencialGmail = lerCredencialGoogle;

export function autorizarGmail(clienteId: string, segredo: string): Promise<CredencialGmail> {
  return autorizarGoogle(clienteId, segredo, ESCOPOS, "Gmail");
}

function api<T>(c: CredencialGmail, caminho: string, corpo?: unknown): Promise<T> {
  return apiGoogle<T>(c, `${BASE}${caminho}`, corpo);
}

interface Cabecalho {
  name: string;
  value: string;
}

export interface EmailResumo {
  id: string;
  de: string;
  assunto: string;
  trecho: string;
  data: string;
  naoLido: boolean;
  importante: boolean;
}

async function listar(c: CredencialGmail, q: string, maximo: number): Promise<EmailResumo[]> {
  const lista = await api<{ messages?: { id: string }[] }>(c, `/messages?maxResults=${maximo}&q=${encodeURIComponent(q)}`);
  const itens = await Promise.all(
    (lista.messages ?? []).map((m) =>
      api<{ id: string; snippet: string; labelIds?: string[]; internalDate: string; payload?: { headers?: Cabecalho[] } }>(c, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`).catch(() => null),
    ),
  );
  return itens
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .map((m) => {
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      return {
        id: m.id,
        de: h("from").replace(/<[^>]+>/, "").replace(/"/g, "").trim() || h("from"),
        assunto: h("subject") || "(sem assunto)",
        trecho: m.snippet,
        data: new Date(Number(m.internalDate)).toISOString(),
        naoLido: m.labelIds?.includes("UNREAD") ?? false,
        importante: m.labelIds?.includes("IMPORTANT") ?? false,
      };
    });
}

export async function lerGmail(texto: string) {
  const c = lerCredencialGmail(texto);
  const [perfil, caixa, importantes, recentes] = await Promise.all([
    api<{ emailAddress: string; messagesTotal: number }>(c, "/profile"),
    api<{ messagesUnread?: number; messagesTotal?: number }>(c, "/labels/INBOX"),
    listar(c, "in:inbox is:important is:unread", 10),
    listar(c, "in:inbox", 15),
  ]);
  return { email: perfil.emailAddress, naoLidos: caixa.messagesUnread ?? 0, total: perfil.messagesTotal, importantes, recentes };
}

export async function buscarGmail(texto: string, q: string) {
  return listar(lerCredencialGmail(texto), q.slice(0, 300), 15);
}

function codificarCabecalho(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function montarMensagem(para: string, assunto: string, corpo: string): string {
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(para)) throw new Error("destinatario_invalido");
  const linhas = [`To: ${para}`, `Subject: ${codificarCabecalho(assunto.replace(/[\r\n]+/g, " ").slice(0, 300))}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(corpo.slice(0, 20000), "utf8").toString("base64")];
  return base64url(Buffer.from(linhas.join("\r\n"), "utf8"));
}

export async function criarRascunhoGmail(texto: string, dados: { para?: unknown; assunto?: unknown; corpo?: unknown }) {
  const c = lerCredencialGmail(texto);
  const raw = montarMensagem(String(dados.para ?? ""), String(dados.assunto ?? ""), String(dados.corpo ?? ""));
  const r = await api<{ id: string }>(c, "/drafts", { message: { raw } });
  return { ok: true, id: r.id };
}

export async function enviarGmail(texto: string, dados: { para?: unknown; assunto?: unknown; corpo?: unknown }) {
  const c = lerCredencialGmail(texto);
  const raw = montarMensagem(String(dados.para ?? ""), String(dados.assunto ?? ""), String(dados.corpo ?? ""));
  const r = await api<{ id: string }>(c, "/messages/send", { raw });
  return { ok: true, id: r.id };
}
