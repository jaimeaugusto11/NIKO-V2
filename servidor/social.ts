import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from "./configuracaoSocial";
import { apagarSegredo, gravarSegredo, lerSegredo } from "./segredos";

const SEGREDO_DA_SESSAO = "social-sessao";
const MENSAGENS_POR_PAGINA = 50;
const LIMITE_DO_TEXTO = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const TEMPO_DA_REDE_MS = 15_000;
const TEMPO_DA_RESTAURACAO_MS = 45_000;

export interface MensagemSocial {
  id: string;
  conversaId: string;
  autorId: string;
  texto: string;
  criadaEm: string;
}

type EventoSocial = { tipo: "mensagem"; mensagem: MensagemSocial } | { tipo: "conversas" } | { tipo: "sessao" } | { tipo: "conectado" } | { tipo: "dados" };

let cliente: SupabaseClient | null = null;
let canal: RealtimeChannel | null = null;
let restauracao: Promise<void> | null = null;
let ultimoRefreshGuardado = "";
const ouvintes = new Set<ServerResponse>();

export function socialConfigurado(): boolean {
  return /^https:\/\/[\w.-]+$/.test(SUPABASE_URL) && SUPABASE_CHAVE_PUBLICA.length > 20;
}

function emitir(evento: EventoSocial) {
  const linha = `${JSON.stringify(evento)}\n`;
  for (const res of ouvintes) res.write(linha);
}

function paraMensagem(linha: Record<string, unknown>): MensagemSocial {
  return { id: String(linha.id), conversaId: String(linha.conversa_id), autorId: String(linha.autor_id), texto: String(linha.texto), criadaEm: String(linha.criada_em) };
}

/** A sessão inteira do Supabase passa do limite do cofre do Windows; só o token de renovação é guardado, e a sessão é refeita a partir dele. */
async function guardarSessao(sessao: Session | null) {
  if (!sessao) {
    ultimoRefreshGuardado = "";
    await apagarSegredo(SEGREDO_DA_SESSAO).catch(() => undefined);
    return;
  }
  if (sessao.refresh_token === ultimoRefreshGuardado) return;
  ultimoRefreshGuardado = sessao.refresh_token;
  await gravarSegredo(SEGREDO_DA_SESSAO, sessao.refresh_token).catch(() => undefined);
}

function ligarTempoReal(supabase: SupabaseClient) {
  if (canal) return;
  canal = supabase
    .channel("niko-chat")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, (p) => emitir({ tipo: "mensagem", mensagem: paraMensagem(p.new as Record<string, unknown>) }))
    .on("postgres_changes", { event: "*", schema: "public", table: "participantes" }, () => emitir({ tipo: "conversas" }))
    .on("postgres_changes", { event: "*", schema: "public", table: "dados_utilizador" }, (p) => {
      const dispositivo = String((p.new as { dispositivo?: string } | null)?.dispositivo ?? "");
      if (dispositivo !== "pc") emitir({ tipo: "dados" });
    })
    .subscribe();
}

function desligarTempoReal() {
  if (canal && cliente) void cliente.removeChannel(canal);
  canal = null;
}

function obterCliente(): SupabaseClient {
  if (!socialConfigurado()) throw new Error("social_nao_configurado");
  if (cliente) return cliente;
  const novo = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: fetchComPrazo },
  });
  novo.auth.onAuthStateChange((evento, sessao) => {
    void guardarSessao(evento === "SIGNED_OUT" ? null : sessao);
    if (sessao) ligarTempoReal(novo);
    else desligarTempoReal();
    if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") emitir({ tipo: "sessao" });
  });
  cliente = novo;
  return novo;
}

/** Sem prazo, um pedido pendurado deixava a sessão (e a sincronia) presa para sempre. */
function fetchComPrazo(entrada: RequestInfo | URL, opcoes: RequestInit = {}) {
  const prazo = AbortSignal.timeout(TEMPO_DA_REDE_MS);
  return fetch(entrada, { ...opcoes, signal: opcoes.signal ? AbortSignal.any([opcoes.signal, prazo]) : prazo });
}

async function restaurarSessao(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const guardado = await lerSegredo(SEGREDO_DA_SESSAO).catch(() => null);
  if (!guardado) return;
  ultimoRefreshGuardado = guardado;
  const { error } = await supabase.auth.refreshSession({ refresh_token: guardado });
  if (error) await guardarSessao(null);
}

async function comSessao(): Promise<SupabaseClient> {
  const supabase = obterCliente();
  if (!restauracao) {
    let relogio: NodeJS.Timeout | undefined;
    const atual: Promise<void> = Promise.race([
      restaurarSessao(supabase),
      new Promise<never>((_, rejeitar) => {
        relogio = setTimeout(() => rejeitar(new Error("sessao_demorou")), TEMPO_DA_RESTAURACAO_MS);
      }),
    ]).finally(() => {
      clearTimeout(relogio);
      if (restauracao === atual) restauracao = null;
    });
    restauracao = atual;
  }
  await restauracao;
  return supabase;
}

async function usuarioAtual(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  const usuario = data.session?.user;
  if (!usuario) return null;
  const { data: perfil } = await supabase.from("perfis").select("nome").eq("id", usuario.id).maybeSingle();
  return { id: usuario.id, email: usuario.email ?? "", nome: (perfil?.nome as string | undefined) ?? String(usuario.user_metadata?.nome ?? "") };
}

export async function clienteAutenticado(): Promise<{ supabase: SupabaseClient; usuarioId: string } | null> {
  const supabase = await comSessao();
  const { data } = await supabase.auth.getSession();
  const usuario = data.session?.user;
  if (!usuario) return null;
  return { supabase, usuarioId: usuario.id };
}

async function exigirSessao(): Promise<SupabaseClient> {
  const supabase = await comSessao();
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("sem_sessao");
  return supabase;
}

function falhou(erro: { message?: string } | null): never {
  throw new Error(erro?.message || "falha_no_supabase");
}

function texto(valor: unknown, maximo: number, erro: string): string {
  const t = String(valor ?? "").trim();
  if (!t || t.length > maximo) throw new Error(erro);
  return t;
}

function uuid(valor: unknown): string {
  const t = String(valor ?? "");
  if (!UUID.test(t)) throw new Error("conversa_invalida");
  return t;
}

function email(valor: unknown): string {
  const t = String(valor ?? "").trim().toLowerCase();
  if (!EMAIL.test(t) || t.length > 254) throw new Error("email_invalido");
  return t;
}

export async function estadoSocial() {
  if (!socialConfigurado()) return { configurado: false, usuario: null };
  return { configurado: true, usuario: await usuarioAtual(await comSessao()) };
}

export async function registarSocial(dados: { nome?: unknown; email?: unknown; senha?: unknown }) {
  const supabase = obterCliente();
  const senha = String(dados.senha ?? "");
  if (senha.length < 8 || senha.length > 72) throw new Error("senha_invalida");
  const { data, error } = await supabase.auth.signUp({ email: email(dados.email), password: senha, options: { data: { nome: texto(dados.nome, 80, "nome_invalido") } } });
  if (error) falhou(error);
  return { ok: true, confirmarEmail: !data.session };
}

export async function entrarSocial(dados: { email?: unknown; senha?: unknown }) {
  const supabase = obterCliente();
  const { error } = await supabase.auth.signInWithPassword({ email: email(dados.email), password: String(dados.senha ?? "") });
  if (error) falhou(error);
  return { ok: true, usuario: await usuarioAtual(supabase) };
}

export async function sairSocial() {
  const supabase = await comSessao();
  await supabase.auth.signOut();
  await guardarSessao(null);
  return { ok: true };
}

export async function conversasSocial() {
  const supabase = await exigirSessao();
  const { data, error } = await supabase.rpc("minhas_conversas");
  if (error) falhou(error);
  return { conversas: data ?? [] };
}

export async function mensagensSocial(conversa: unknown, antes?: string | null) {
  const supabase = await exigirSessao();
  let consulta = supabase.from("mensagens").select("id, conversa_id, autor_id, texto, criada_em").eq("conversa_id", uuid(conversa)).order("criada_em", { ascending: false }).limit(MENSAGENS_POR_PAGINA);
  if (antes && !Number.isNaN(Date.parse(antes))) consulta = consulta.lt("criada_em", antes);
  const { data, error } = await consulta;
  if (error) falhou(error);
  return { mensagens: (data ?? []).map((l) => paraMensagem(l)).reverse(), temMais: (data ?? []).length === MENSAGENS_POR_PAGINA };
}

export async function enviarSocial(dados: { conversa?: unknown; texto?: unknown }) {
  const supabase = await exigirSessao();
  const { data, error } = await supabase.from("mensagens").insert({ conversa_id: uuid(dados.conversa), texto: texto(dados.texto, LIMITE_DO_TEXTO, "mensagem_invalida") }).select("id, conversa_id, autor_id, texto, criada_em").single();
  if (error) falhou(error);
  return { mensagem: paraMensagem(data) };
}

async function idPeloEmail(supabase: SupabaseClient, procurado: string): Promise<string> {
  const { data, error } = await supabase.rpc("buscar_por_email", { procurado });
  if (error) falhou(error);
  const achado = (data as { id: string }[] | null)?.[0];
  if (!achado) throw new Error(`email_desconhecido:${procurado}`);
  return achado.id;
}

export async function abrirDiretaSocial(dados: { email?: unknown }) {
  const supabase = await exigirSessao();
  const outro = await idPeloEmail(supabase, email(dados.email));
  const { data, error } = await supabase.rpc("abrir_conversa_direta", { outro });
  if (error) falhou(error);
  return { conversa: String(data) };
}

export async function criarGrupoSocial(dados: { nome?: unknown; emails?: unknown }) {
  const supabase = await exigirSessao();
  const lista = Array.isArray(dados.emails) ? [...new Set(dados.emails.map(email))] : [];
  if (lista.length === 0) throw new Error("grupo_sem_membros");
  if (lista.length > 49) throw new Error("grupo_grande_demais");
  const membros = await Promise.all(lista.map((e) => idPeloEmail(supabase, e)));
  const { data, error } = await supabase.rpc("criar_grupo", { nome_do_grupo: texto(dados.nome, 80, "grupo_sem_nome"), membros });
  if (error) falhou(error);
  return { conversa: String(data) };
}

export async function adicionarAoGrupoSocial(dados: { conversa?: unknown; email?: unknown }) {
  const supabase = await exigirSessao();
  const membro = await idPeloEmail(supabase, email(dados.email));
  const { error } = await supabase.rpc("adicionar_ao_grupo", { conversa: uuid(dados.conversa), membro });
  if (error) falhou(error);
  return { ok: true };
}

export async function sairDaConversaSocial(dados: { conversa?: unknown }) {
  const supabase = await exigirSessao();
  const { error } = await supabase.rpc("sair_da_conversa", { conversa: uuid(dados.conversa) });
  if (error) falhou(error);
  return { ok: true };
}

export async function marcarLidaSocial(dados: { conversa?: unknown }) {
  const supabase = await exigirSessao();
  const { error } = await supabase.rpc("marcar_lida", { conversa: uuid(dados.conversa) });
  if (error) falhou(error);
  return { ok: true };
}

export function ouvirSocial(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.write(`${JSON.stringify({ tipo: "conectado" } satisfies EventoSocial)}\n`);
  ouvintes.add(res);
  if (socialConfigurado()) void comSessao().catch(() => undefined);
  const pulso = setInterval(() => res.write("\n"), 20_000);
  req.on("close", () => {
    clearInterval(pulso);
    ouvintes.delete(res);
  });
}

export function encerrarSocial() {
  desligarTempoReal();
  for (const res of ouvintes) res.end();
  ouvintes.clear();
}
