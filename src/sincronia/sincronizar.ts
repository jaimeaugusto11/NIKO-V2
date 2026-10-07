import { useEffect } from "react";
import { create } from "zustand";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import projeto from "../../supabase/projeto.json";
import { aoEditarLocal, aplicarRemoto, cabecalhoDoBanco, gravarChave, lerChave, listarChaves, momentoDaChave, salvarAgora } from "../ponte/armazenamento";
import { ouvirSocial } from "../ponte/social";
import { CHAVE_DA_SINCRONIA, chaveSincronizavel, type Ponta } from "./escolher";
import { instanteReal, reconciliar } from "./reconciliar";
import { MOVEL, NATIVO } from "../desktop/desktop";

interface Meta {
  base: Record<string, string>;
  em: Record<string, number>;
}

interface LinhaRemota {
  chave: string;
  valor: string;
  atualizado_em: string;
}

type Fase = "parada" | "a-correr" | "feita" | "entrar" | "erro" | "sem-rede";

/** O app do Windows fala com a ponte. O site, o iPhone e o Android falam direto com o Supabase. */
export function sincronizaPeloTelefone() {
  return MOVEL || !NATIVO;
}

export const useSincronia = create<{ fase: Fase; erro: string; em: string }>(() => ({ fase: "parada", erro: "", em: "" }));

let cliente: SupabaseClient | null = null;
let canalMovel: RealtimeChannel | null = null;
let aCorrer = false;
let outraVez = false;
let temporizador = 0;

const LIMITE_DO_PEDIDO_MS = 15000;
const LIMITE_DA_RONDA_MS = 30000;

/** O iPhone congela pedidos quando a app vai para segundo plano; sem limite, a sincronia fica parada até fechar a app. */
function pedirComLimite(entrada: RequestInfo | URL, opcoes: RequestInit = {}): Promise<Response> {
  const controlo = new AbortController();
  const limite = window.setTimeout(() => controlo.abort(), LIMITE_DO_PEDIDO_MS);
  opcoes.signal?.addEventListener("abort", () => controlo.abort());
  return fetch(entrada, { ...opcoes, signal: controlo.signal }).finally(() => window.clearTimeout(limite));
}

function comLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let limite = 0;
  const esgotado = new Promise<never>((_, rejeitar) => {
    limite = window.setTimeout(() => rejeitar(new Error("timeout")), ms);
  });
  return Promise.race([promessa, esgotado]).finally(() => window.clearTimeout(limite));
}

function supabase(): SupabaseClient {
  if (cliente) return cliente;
  cliente = createClient(projeto.url, projeto.chavePublica, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "niko-sessao" },
    global: { fetch: pedirComLimite },
  });
  return cliente;
}

function lerMeta(): Meta {
  try {
    const lido = JSON.parse(lerChave(CHAVE_DA_SINCRONIA) ?? "") as Partial<Meta>;
    return {
      base: lido.base && typeof lido.base === "object" ? lido.base : {},
      em: lido.em && typeof lido.em === "object" ? lido.em : {},
    };
  } catch {
    return { base: {}, em: {} };
  }
}

function guardarMeta(meta: Meta) {
  gravarChave(CHAVE_DA_SINCRONIA, JSON.stringify(meta));
}

async function peloTelefone() {
  const { data } = await supabase().auth.getSession();
  const usuario = data.session?.user;
  if (!usuario) return { precisaEntrar: true as const };
  const { error: semPerfil } = await supabase().rpc("garantir_perfil");
  if (semPerfil) throw new Error(semPerfil.message);
  const { data: linhas, error } = await supabase().from("dados_utilizador").select("chave, valor, atualizado_em").eq("user_id", usuario.id);
  if (error) throw new Error(error.message);
  const remotos = new Map<string, Ponta>();
  for (const linha of (linhas ?? []) as LinhaRemota[]) {
    if (chaveSincronizavel(linha.chave, linha.valor)) remotos.set(linha.chave, { valor: linha.valor, em: Date.parse(linha.atualizado_em) });
  }
  const meta = lerMeta();
  const locais = new Map<string, Ponta>();
  for (const chave of listarChaves()) {
    const valor = lerChave(chave);
    if (valor === null || !chaveSincronizavel(chave, valor)) continue;
    const mudou = meta.base[chave] !== valor;
    const editado = momentoDaChave(chave);
    const em = !mudou ? meta.em[chave] ?? editado ?? 0 : editado || Date.now();
    locais.set(chave, { valor, em });
  }
  const envios: { user_id: string; chave: string; valor: string; atualizado_em: string; dispositivo: string; apagado: boolean }[] = [];
  for (const chave of new Set([...locais.keys(), ...remotos.keys()])) {
    const escolha = reconciliar(locais.get(chave) ?? null, remotos.get(chave) ?? null, meta.base[chave]);
    if (!escolha) continue;
    const em = instanteReal(escolha.em) ? escolha.em : Date.now();
    meta.base[chave] = escolha.valor;
    meta.em[chave] = em;
    if (escolha.escreverLocal) aplicarRemoto(chave, escolha.valor);
    if (escolha.escreverRemoto) {
      envios.push({ user_id: usuario.id, chave, valor: escolha.valor, atualizado_em: new Date(em).toISOString(), dispositivo: "android", apagado: false });
    }
  }
  if (envios.length > 0) {
    const { error: falha } = await supabase().from("dados_utilizador").upsert(envios, { onConflict: "user_id,chave" });
    if (falha) throw new Error(falha.message);
  }
  guardarMeta(meta);
  return { precisaEntrar: false as const };
}

async function peloComputador() {
  await salvarAgora();
  const r = await fetch("/ponte/sincronizar", { method: "POST", headers: { "x-niko": "1", "content-type": "application/json", ...cabecalhoDoBanco() } });
  const json = (await r.json().catch(() => ({}))) as { precisaEntrar?: boolean; recebidas?: Record<string, string>; erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  if (json.erro) throw new Error(json.erro);
  if (json.precisaEntrar) return { precisaEntrar: true as const };
  for (const [chave, valor] of Object.entries(json.recebidas ?? {})) aplicarRemoto(chave, valor);
  return { precisaEntrar: false as const };
}

function semInternet(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const mensagem = e instanceof Error ? e.message : "";
  return /failed to fetch|network|offline|load failed|timeout|econn|enotfound/i.test(mensagem);
}

function agendarSincronia(ms = 700) {
  window.clearTimeout(temporizador);
  temporizador = window.setTimeout(() => void sincronizarAgora(), ms);
}

async function ouvirRemotoNoTelefone() {
  if (!sincronizaPeloTelefone()) return;
  if (canalMovel && (canalMovel.state === "joined" || canalMovel.state === "joining")) return;
  if (canalMovel) void supabase().removeChannel(canalMovel);
  canalMovel = null;
  const { data } = await supabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) return;
  canalMovel = supabase()
    .channel("niko-dados")
    .on("postgres_changes", { event: "*", schema: "public", table: "dados_utilizador", filter: `user_id=eq.${id}` }, (p) => {
      const dispositivo = String((p.new as { dispositivo?: string }).dispositivo ?? "");
      if (dispositivo !== "android") agendarSincronia(400);
    })
    .subscribe();
}

export async function sincronizarAgora() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    useSincronia.setState({ fase: "sem-rede", erro: "" });
    return;
  }
  if (aCorrer) {
    outraVez = true;
    return;
  }
  aCorrer = true;
  outraVez = false;
  useSincronia.setState({ fase: "a-correr", erro: "" });
  try {
    const resultado = await comLimite(sincronizaPeloTelefone() ? peloTelefone() : peloComputador(), LIMITE_DA_RONDA_MS);
    if (sincronizaPeloTelefone() && !resultado.precisaEntrar) void ouvirRemotoNoTelefone();
    useSincronia.setState(resultado.precisaEntrar ? { fase: "entrar", erro: "", em: "" } : { fase: "feita", erro: "", em: new Date().toISOString() });
  } catch (e) {
    useSincronia.setState(semInternet(e) ? { fase: "sem-rede", erro: "" } : { fase: "erro", erro: (e as Error).message });
  } finally {
    aCorrer = false;
    if (outraVez) agendarSincronia(800);
  }
}

export async function entrarNaConta(email: string, senha: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.message);
  await sincronizarAgora();
}

export async function sairDaConta() {
  if (canalMovel) void supabase().removeChannel(canalMovel);
  canalMovel = null;
  await supabase().auth.signOut();
  useSincronia.setState({ fase: "entrar", erro: "", em: "" });
}

export function usarSincroniaNuvem() {
  useEffect(() => {
    const correr = () => void sincronizarAgora();
    const espera = window.setTimeout(correr, 4000);
    const intervalo = window.setInterval(correr, 30000);
    const passagem = window.setInterval(correr, 5 * 60 * 1000);
    const pararEdicao = aoEditarLocal(() => agendarSincronia(700));
    const pararSocial = sincronizaPeloTelefone() ? () => undefined : ouvirSocial((e) => { if (e.tipo === "dados") agendarSincronia(400); });
    const aoVoltar = () => {
      if (document.visibilityState === "visible") correr();
    };
    window.addEventListener("focus", correr);
    window.addEventListener("online", correr);
    window.addEventListener("pageshow", correr);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearTimeout(espera);
      window.clearInterval(intervalo);
      window.clearInterval(passagem);
      window.clearTimeout(temporizador);
      pararEdicao();
      pararSocial();
      window.removeEventListener("focus", correr);
      window.removeEventListener("online", correr);
      window.removeEventListener("pageshow", correr);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);
}
