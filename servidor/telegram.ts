import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";
import { pastaDados } from "./ia";
import { lerSegredo } from "./segredos";

const ESPERA_LONGA_SEG = 25;
const PAUSA_APOS_ERRO_MS = 15000;
const MAXIMO_NA_FILA = 50;
const MAXIMO_NO_HISTORICO = 30;

const ARQUIVO = () => join(pastaDados(), "telegram.json");

interface EstadoTelegram {
  chat?: number;
  nomeDoChat?: string;
  codigo?: string;
  deslocamento?: number;
}

export interface MensagemTelegram {
  id: number;
  texto: string;
  data: string;
}

interface Registro {
  texto: string;
  resposta: string;
  data: string;
}

const fila: MensagemTelegram[] = [];
const historico: Registro[] = [];
let ciclo: AbortController | null = null;

function lerEstado(): EstadoTelegram {
  try {
    return existsSync(ARQUIVO()) ? (JSON.parse(readFileSync(ARQUIVO(), "utf8")) as EstadoTelegram) : {};
  } catch {
    return {};
  }
}

function salvarEstado(e: EstadoTelegram) {
  mkdirSync(pastaDados(), { recursive: true });
  const tmp = `${ARQUIVO()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(e), "utf8");
  // O antivírus ou o indexador às vezes seguram o ficheiro por instantes.
  for (let tentativa = 1; ; tentativa++) {
    try {
      renameSync(tmp, ARQUIVO());
      return;
    } catch (erro) {
      const codigo = (erro as NodeJS.ErrnoException).code;
      if (tentativa >= 5 || (codigo !== "EPERM" && codigo !== "EBUSY")) throw erro;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * tentativa);
    }
  }
}

export function tokenValido(token: string): boolean {
  return /^\d{5,15}:[\w-]{30,60}$/.test(token);
}

async function chamar<T>(token: string, metodo: string, parametros: Record<string, unknown> = {}, sinal?: AbortSignal): Promise<T> {
  if (!tokenValido(token)) throw new Error("token_invalido");
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parametros),
    signal: sinal ?? AbortSignal.timeout(15000),
  });
  const json = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description ?? `http_${r.status}`);
  return json.result as T;
}

function novoCodigo(): string {
  return String(randomInt(100000, 1000000));
}

/** Prepara o emparelhamento depois de guardar um token novo: um código de 6 dígitos que o utilizador manda ao bot. */
export async function prepararBot(token: string) {
  // Um webhook configurado noutro lugar impede o getUpdates.
  await chamar(token, "deleteWebhook", { drop_pending_updates: true });
  salvarEstado({ codigo: novoCodigo() });
  fila.length = 0;
  historico.length = 0;
}

export function esquecerTelegram() {
  pararTelegram();
  salvarEstado({});
  fila.length = 0;
  historico.length = 0;
}

export interface Atualizacao {
  update_id: number;
  message?: { message_id: number; date: number; text?: string; chat: { id: number; type: string; first_name?: string; username?: string } };
}

async function responderAoChat(token: string, chat: number, texto: string) {
  await chamar(token, "sendMessage", { chat_id: chat, text: texto.slice(0, 4000) }).catch(() => undefined);
}

export async function tratarAtualizacao(token: string, a: Atualizacao) {
  const nova = await interpretar(token, a);
  // A mensagem só entra na fila depois de o deslocamento ficar gravado, para não ser lida duas vezes.
  salvarEstado({ ...lerEstado(), deslocamento: a.update_id + 1 });
  if (!nova) return;
  if (fila.length >= MAXIMO_NA_FILA) fila.shift();
  fila.push(nova);
}

async function interpretar(token: string, a: Atualizacao): Promise<MensagemTelegram | null> {
  const m = a.message;
  if (!m || m.chat.type !== "private") return null;
  const estado = lerEstado();
  const texto = (m.text ?? "").trim();
  if (!estado.chat) {
    // Só o chat que mandar o código mostrado no Niko fica ligado; qualquer outra mensagem é ignorada.
    const enviado = texto.replace(/^\/start\s*/i, "").trim();
    if (estado.codigo && enviado === estado.codigo) {
      salvarEstado({ ...estado, chat: m.chat.id, nomeDoChat: m.chat.first_name ?? m.chat.username ?? "", codigo: undefined });
      await responderAoChat(token, m.chat.id, "Pronto, este chat está ligado ao Niko. Mande uma tarefa, um gasto ou um lembrete. Exemplos: \"ligar pro banco amanhã 15h\", \"gastei 50 no mercado\", \"me lembra de pagar a luz sexta\".");
    }
    return null;
  }
  if (m.chat.id !== estado.chat) return null;
  if (!texto) {
    await responderAoChat(token, m.chat.id, "Por enquanto o Niko só entende mensagens de texto.");
    return null;
  }
  return { id: m.message_id, texto: texto.slice(0, 2000), data: new Date(m.date * 1000).toISOString() };
}

async function pausar(sinal: AbortSignal) {
  await esperar(PAUSA_APOS_ERRO_MS, undefined, { signal: sinal }).catch(() => undefined);
}

async function rodar(sinal: AbortSignal) {
  while (!sinal.aborted) {
    let token: string | null;
    try {
      token = await lerSegredo("conexao-telegram");
    } catch {
      // No arranque o PowerShell do cofre pode demorar demais; tenta de novo em vez de desistir.
      await pausar(sinal);
      continue;
    }
    if (!token || sinal.aborted) return;
    try {
      const estado = lerEstado();
      const atualizacoes = await chamar<Atualizacao[]>(token, "getUpdates", { timeout: ESPERA_LONGA_SEG, offset: estado.deslocamento, allowed_updates: ["message"] }, AbortSignal.any([sinal, AbortSignal.timeout((ESPERA_LONGA_SEG + 10) * 1000)]));
      for (const a of atualizacoes) await tratarAtualizacao(token, a);
    } catch {
      if (sinal.aborted) return;
      await pausar(sinal);
    }
  }
}

export function iniciarTelegram() {
  if (ciclo) return;
  ciclo = new AbortController();
  const atual = ciclo;
  void rodar(atual.signal).finally(() => {
    if (ciclo === atual) ciclo = null;
  });
}

export function pararTelegram() {
  ciclo?.abort();
  ciclo = null;
}

export function pegarPendentes(): MensagemTelegram[] {
  return fila.splice(0, fila.length);
}

export async function responderTelegram(dados: { texto?: unknown; pergunta?: unknown }) {
  const estado = lerEstado();
  const token = await lerSegredo("conexao-telegram");
  if (!token || !estado.chat) throw new Error("telegram_desligado");
  const texto = String(dados.texto ?? "").trim();
  if (!texto) throw new Error("resposta_vazia");
  historico.unshift({ texto: String(dados.pergunta ?? "").slice(0, 300), resposta: texto.slice(0, 500), data: new Date().toISOString() });
  historico.length = Math.min(historico.length, MAXIMO_NO_HISTORICO);
  await responderAoChat(token, estado.chat, texto);
  return { ok: true };
}

export async function lerTelegram(token: string) {
  const bot = await chamar<{ username?: string; first_name?: string }>(token, "getMe");
  let estado = lerEstado();
  if (!estado.chat && !estado.codigo) {
    estado = { ...estado, codigo: novoCodigo() };
    salvarEstado(estado);
  }
  return {
    bot: bot.username ?? "",
    nome: bot.first_name ?? "",
    ligado: Boolean(estado.chat),
    nomeDoChat: estado.nomeDoChat ?? "",
    codigo: estado.chat ? "" : estado.codigo ?? "",
    historico: [...historico],
  };
}
