import { useEffect } from "react";
import { create } from "zustand";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import projeto from "../../supabase/projeto.json";
import { aoEditarLocal, aplicarRemoto, cabecalhoDoBanco, gravarChave, lerChave, listarChaves, momentoDaChave, salvarAgora } from "../ponte/armazenamento";
import { ouvirSocial } from "../ponte/social";
import { CHAVE_DA_SINCRONIA, chaveSincronizavel, escolher, type Ponta } from "./escolher";
import { mesclarTexto } from "../ponte/mesclar";
import { MOVEL } from "../desktop/desktop";

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

export const useSincronia = create<{ fase: Fase; erro: string; em: string }>(() => ({ fase: "parada", erro: "", em: "" }));

let cliente: SupabaseClient | null = null;
let canalMovel: RealtimeChannel | null = null;
let aCorrer = false;
let outraVez = false;
let temporizador = 0;

function supabase(): SupabaseClient {
  if (cliente) return cliente;
  cliente = createClient(projeto.url, projeto.chavePublica, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "niko-sessao" },
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
    const remoto = remotos.get(chave);
    // No primeiro encontro, o que já está na conta entra. Se o telemóvel também editou entretanto, as duas versões juntam-se.
    if (meta.base[chave] === undefined && remoto && editado > 0 && remoto.valor !== valor) {
      const junto = mesclarTexto(undefined, valor, remoto.valor) ?? valor;
      aplicarRemoto(chave, junto);
      locais.set(chave, { valor: junto, em: Date.now() });
      continue;
    }
    const em = !mudou ? meta.em[chave] ?? 0 : meta.base[chave] === undefined ? 0 : editado || Date.now();
    locais.set(chave, { valor, em });
  }
  const envios: { user_id: string; chave: string; valor: string; atualizado_em: string; dispositivo: string; apagado: boolean }[] = [];
  for (const chave of new Set([...locais.keys(), ...remotos.keys()])) {
    const escolha = escolher(locais.get(chave) ?? null, remotos.get(chave) ?? null);
    if (!escolha) continue;
    meta.base[chave] = escolha.valor;
    meta.em[chave] = escolha.em;
    if (escolha.escreverLocal) aplicarRemoto(chave, escolha.valor);
    if (escolha.escreverRemoto) {
      envios.push({ user_id: usuario.id, chave, valor: escolha.valor, atualizado_em: new Date(escolha.em).toISOString(), dispositivo: "android", apagado: false });
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
  if (!MOVEL || canalMovel) return;
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
    const resultado = MOVEL ? await peloTelefone() : await peloComputador();
    if (MOVEL && !resultado.precisaEntrar) void ouvirRemotoNoTelefone();
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
    const pararEdicao = aoEditarLocal(() => agendarSincronia(700));
    const pararSocial = MOVEL ? () => undefined : ouvirSocial((e) => { if (e.tipo === "dados") agendarSincronia(400); });
    window.addEventListener("focus", correr);
    window.addEventListener("online", correr);
    return () => {
      window.clearTimeout(espera);
      window.clearInterval(intervalo);
      window.clearTimeout(temporizador);
      pararEdicao();
      pararSocial();
      window.removeEventListener("focus", correr);
      window.removeEventListener("online", correr);
    };
  }, []);
}
