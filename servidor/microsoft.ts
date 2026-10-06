import { novoPkce, pedirToken, receberCodigoOAuth } from "./oauth";
import type { EventoAgenda } from "./googleCalendar";

const ESCOPOS = ["offline_access", "User.Read", "Mail.Read", "Calendars.Read", "Chat.Read"];
const GRAPH = "https://graph.microsoft.com/v1.0";
const DIAS_DEPOIS = 30;

export interface CredencialMicrosoft {
  clienteId: string;
  inquilino: string;
  refresh: string;
}

export function lerCredencialMicrosoft(texto: string): CredencialMicrosoft {
  const c = JSON.parse(texto) as CredencialMicrosoft;
  if (!c.clienteId || !c.refresh) throw new Error("credencial_invalida");
  return { ...c, inquilino: c.inquilino || "common" };
}

function validarCliente(clienteId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clienteId)) throw new Error("cliente_id_invalido");
}

const urlToken = (inquilino: string) => `https://login.microsoftonline.com/${encodeURIComponent(inquilino)}/oauth2/v2.0/token`;

const acessos = new Map<string, { token: string; expira: number }>();
const renovacoesEmAndamento = new Map<string, Promise<string>>();

export async function autorizarMicrosoft(clienteId: string, inquilino = "common"): Promise<CredencialMicrosoft> {
  validarCliente(clienteId);
  const { verificador, desafio, estado } = novoPkce();
  const { codigo, redirecionamento } = await receberCodigoOAuth({
    servico: "Microsoft 365",
    estado,
    host: "localhost",
    montarUrl: (redirect_uri) =>
      `https://login.microsoftonline.com/${encodeURIComponent(inquilino)}/oauth2/v2.0/authorize?${new URLSearchParams({
        client_id: clienteId,
        redirect_uri,
        response_type: "code",
        response_mode: "query",
        scope: ESCOPOS.join(" "),
        code_challenge: desafio,
        code_challenge_method: "S256",
        prompt: "select_account",
        state: estado,
      })}`,
  });
  const json = await pedirToken(urlToken(inquilino), { client_id: clienteId, code: codigo, redirect_uri: redirecionamento, grant_type: "authorization_code", code_verifier: verificador, scope: ESCOPOS.join(" ") });
  if (json.error || !json.refresh_token) throw new Error(json.error_description?.split("\n")[0] ?? json.error ?? "sem_autorizacao");
  if (json.access_token) acessos.set(clienteId, { token: json.access_token, expira: Date.now() + (json.expires_in ?? 3000) * 1000 - 60000 });
  return { clienteId, inquilino, refresh: json.refresh_token };
}

/** A Microsoft troca o token de renovação a cada uso; `aoTrocar` recebe a credencial nova para ela ser guardada. */
async function renovar(c: CredencialMicrosoft, aoTrocar: (nova: CredencialMicrosoft) => Promise<void>): Promise<string> {
  const json = await pedirToken(urlToken(c.inquilino), { client_id: c.clienteId, refresh_token: c.refresh, grant_type: "refresh_token", scope: ESCOPOS.join(" ") });
  if (json.error || !json.access_token) throw new Error(json.error === "invalid_grant" ? "autorizacao_expirada" : json.error_description?.split("\n")[0] ?? json.error ?? "sem_token");
  acessos.set(c.clienteId, { token: json.access_token, expira: Date.now() + (json.expires_in ?? 3000) * 1000 - 60000 });
  if (json.refresh_token && json.refresh_token !== c.refresh) await aoTrocar({ ...c, refresh: json.refresh_token }).catch(() => undefined);
  return json.access_token;
}

function tokenMicrosoft(c: CredencialMicrosoft, aoTrocar: (nova: CredencialMicrosoft) => Promise<void>): Promise<string> {
  const guardado = acessos.get(c.clienteId);
  if (guardado && guardado.expira > Date.now()) return Promise.resolve(guardado.token);
  const emAndamento = renovacoesEmAndamento.get(c.clienteId);
  if (emAndamento) return emAndamento;
  const renovacao = renovar(c, aoTrocar).finally(() => renovacoesEmAndamento.delete(c.clienteId));
  renovacoesEmAndamento.set(c.clienteId, renovacao);
  return renovacao;
}

interface Pessoa {
  emailAddress?: { name?: string; address?: string };
}

interface MensagemGraph {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime: string;
  isRead?: boolean;
  importance?: string;
  from?: Pessoa;
  webLink?: string;
}

interface EventoGraph {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  start?: { dateTime: string };
  end?: { dateTime: string };
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string } | null;
  webLink?: string;
}

interface ChatGraph {
  id: string;
  topic?: string | null;
  chatType?: string;
  webUrl?: string;
  lastMessagePreview?: { createdDateTime?: string; body?: { content?: string }; from?: { user?: { displayName?: string } } | null } | null;
}

// O Graph devolve datas em UTC sem o "Z" quando pedimos o fuso UTC.
const emUtc = (iso?: string) => (iso ? (/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`) : "");
const dataDoDia = (iso: string) => iso.slice(0, 10);
const semHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export async function lerMicrosoft(texto: string, aoTrocar: (nova: CredencialMicrosoft) => Promise<void>) {
  const c = lerCredencialMicrosoft(texto);
  const api = async <T>(caminho: string): Promise<T> => {
    const token = await tokenMicrosoft(c, aoTrocar);
    const r = await fetch(`${GRAPH}${caminho}`, { headers: { authorization: `Bearer ${token}`, prefer: 'outlook.timezone="UTC"' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`http_${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);
    return (await r.json()) as T;
  };
  const de = new Date().toISOString();
  const ate = new Date(Date.now() + DIAS_DEPOIS * 86400000).toISOString();
  const [eu, caixa, emails, agenda, chats] = await Promise.all([
    api<{ displayName?: string; mail?: string | null; userPrincipalName?: string }>("/me?$select=displayName,mail,userPrincipalName"),
    api<{ unreadItemCount?: number; totalItemCount?: number }>("/me/mailFolders/inbox?$select=unreadItemCount,totalItemCount"),
    api<{ value: MensagemGraph[] }>("/me/mailFolders/inbox/messages?$top=20&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,receivedDateTime,isRead,importance,from,webLink"),
    api<{ value: EventoGraph[] }>(`/me/calendarView?${new URLSearchParams({ startDateTime: de, endDateTime: ate, $top: "100", $orderby: "start/dateTime", $select: "id,subject,isAllDay,isCancelled,start,end,location,onlineMeeting,webLink" })}`),
    api<{ value: ChatGraph[] }>("/me/chats?$top=15&$expand=lastMessagePreview&$orderby=lastMessagePreview/createdDateTime desc")
      .catch(() => api<{ value: ChatGraph[] }>("/me/chats?$top=30&$expand=lastMessagePreview"))
      .catch(() => null),
  ]);
  const eventos: EventoAgenda[] = agenda.value
    .filter((e) => !e.isCancelled && e.start?.dateTime)
    .map((e) => {
      const inicio = emUtc(e.start?.dateTime);
      const fim = emUtc(e.end?.dateTime) || inicio;
      return {
        id: e.id,
        titulo: e.subject || "(sem título)",
        // Eventos de dia inteiro vêm como meia-noite UTC; ficam só com a data para não mudarem de dia no fuso local.
        inicio: e.isAllDay ? dataDoDia(inicio) : inicio,
        fim: e.isAllDay ? dataDoDia(fim) : fim,
        diaInteiro: Boolean(e.isAllDay),
        local: e.location?.displayName ?? "",
        link: e.onlineMeeting?.joinUrl ?? e.webLink ?? "",
        calendario: "Outlook",
        cor: "",
      };
    });
  return {
    conta: { nome: eu.displayName ?? "", email: eu.mail ?? eu.userPrincipalName ?? "" },
    naoLidos: caixa.unreadItemCount ?? 0,
    emails: emails.value.map((m) => ({
      id: m.id,
      de: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
      assunto: m.subject || "(sem assunto)",
      trecho: m.bodyPreview ?? "",
      data: m.receivedDateTime,
      naoLido: !m.isRead,
      importante: m.importance === "high",
      link: m.webLink ?? "",
    })),
    eventos,
    teams: chats !== null,
    chats: (chats?.value ?? [])
      .filter((x) => x.lastMessagePreview?.createdDateTime)
      .map((x) => ({
        id: x.id,
        titulo: x.topic || x.lastMessagePreview?.from?.user?.displayName || (x.chatType === "oneOnOne" ? "Conversa" : "Grupo"),
        de: x.lastMessagePreview?.from?.user?.displayName ?? "",
        ultima: semHtml(x.lastMessagePreview?.body?.content ?? "").slice(0, 200),
        data: x.lastMessagePreview?.createdDateTime ?? "",
        link: x.webUrl ?? "",
      }))
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 15),
  };
}
