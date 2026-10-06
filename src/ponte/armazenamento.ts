import { createJSONStorage, type StateStorage } from "zustand/middleware";
import { mesclarTexto } from "./mesclar";

export const PREFIXO = "niko:";
const bancoDeTeste = (() => {
  try {
    const nome = new URLSearchParams(window.location.search).get("banco") ?? "";
    return /^[a-z0-9-]{1,20}$/.test(nome) ? nome : "";
  } catch {
    return "";
  }
})();
const CABECALHOS: Record<string, string> = { "x-niko": "1", "content-type": "application/json", ...(bancoDeTeste ? { "x-niko-banco": bancoDeTeste } : {}) };

export function cabecalhoDoBanco(): Record<string, string> {
  return bancoDeTeste ? { "x-niko-banco": bancoDeTeste } : {};
}

export type ModoArmazenamento = "banco" | "local";

let modo: ModoArmazenamento = "local";
const cache = new Map<string, string>();
const pendentes = new Map<string, string | null>();
const emEnvio = new Map<string, number>();
const escritaLocal = new Map<string, number>();
// Última versão de cada chave que esta janela sabe ser comum com as outras; é a base das fusões.
const sincronizado = new Map<string, string | null>();
let relogioLocal = 0;
let temporizador = 0;
const canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("niko-dados") : null;
const ouvintesDeFora = new Set<(chave: string) => void>();
const ORIGEM = Math.random().toString(36).slice(2);
const EVENTO_DADOS = "niko-dados";
const avisosPendentes = new Map<string, string | null>();
let temporizadorAviso = 0;

interface MudancaDeDados {
  origem: string;
  chave: string;
  valor: string | null;
}

function tauriDisponivel(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function avisarOutrasJanelas(chave: string, valor: string | null) {
  canal?.postMessage({ origem: ORIGEM, chave, valor } satisfies MudancaDeDados);
  if (!tauriDisponivel()) return;
  avisosPendentes.set(chave, valor);
  if (temporizadorAviso) return;
  temporizadorAviso = window.setTimeout(async () => {
    temporizadorAviso = 0;
    const itens = [...avisosPendentes];
    avisosPendentes.clear();
    try {
      const { emit } = await import("@tauri-apps/api/event");
      for (const [c, v] of itens) await emit(EVENTO_DADOS, { origem: ORIGEM, chave: c, valor: v } satisfies MudancaDeDados);
    } catch {
      return;
    }
  }, 120);
}

function receberDeFora(m: MudancaDeDados) {
  if (!m || m.origem === ORIGEM) return;
  const alteradaAqui = pendentes.has(m.chave) || emEnvio.has(m.chave);
  if (alteradaAqui) {
    if (m.origem !== "ponte") fundirComOutraJanela(m);
    return;
  }
  sincronizado.set(m.chave, m.valor);
  const atual = cache.get(m.chave) ?? null;
  if (atual === m.valor) return;
  if (m.valor === null) cache.delete(m.chave);
  else cache.set(m.chave, m.valor);
  ouvintesDeFora.forEach((f) => f(m.chave));
}

function fundirComOutraJanela(m: MudancaDeDados) {
  const local = cache.get(m.chave) ?? null;
  const fundido = mesclarTexto(sincronizado.get(m.chave), local, m.valor);
  sincronizado.set(m.chave, m.valor);
  if (fundido === local) return;
  if (fundido === null) cache.delete(m.chave);
  else cache.set(m.chave, fundido);
  pendentes.set(m.chave, fundido);
  marcarEscritaLocal(m.chave);
  agendar();
  avisarOutrasJanelas(m.chave, fundido);
  ouvintesDeFora.forEach((f) => f(m.chave));
}

function marcarEscritaLocal(chave: string) {
  escritaLocal.set(chave, ++relogioLocal);
}

async function recarregarDaPonte() {
  if (modo !== "banco") return;
  const marco = relogioLocal;
  try {
    const r = await fetch("/ponte/dados", { headers: CABECALHOS });
    if (!r.ok) return;
    const { dados } = (await r.json()) as { dados: Record<string, string> };
    for (const [k, v] of Object.entries(dados)) {
      // A leitura pode ter saído antes de uma escrita local chegar ao banco; nesse caso o valor local é mais novo.
      if (emEnvio.has(k) || (escritaLocal.get(k) ?? 0) > marco) continue;
      receberDeFora({ origem: "ponte", chave: k, valor: v });
    }
  } catch {
    return;
  }
}

function localSeguro<T>(fn: () => T, reserva: T): T {
  try {
    return fn();
  } catch {
    return reserva;
  }
}

async function enviarPendentes(manterViva = false) {
  window.clearTimeout(temporizador);
  temporizador = 0;
  if (pendentes.size === 0) return;
  const itens = Object.fromEntries(pendentes);
  pendentes.clear();
  const chaves = Object.keys(itens);
  for (const k of chaves) emEnvio.set(k, (emEnvio.get(k) ?? 0) + 1);
  try {
    const r = await fetch("/ponte/dados", { method: "POST", headers: CABECALHOS, body: JSON.stringify({ itens }), keepalive: manterViva && JSON.stringify(itens).length < 60000 });
    if (!r.ok) throw new Error(`http_${r.status}`);
    for (const [k, v] of Object.entries(itens)) if (!pendentes.has(k)) sincronizado.set(k, v);
  } catch {
    for (const [k, v] of Object.entries(itens)) if (!pendentes.has(k)) pendentes.set(k, v);
    window.dispatchEvent(new CustomEvent("niko:armazenamento-falhou"));
    agendar(4000);
  } finally {
    for (const k of chaves) {
      const n = (emEnvio.get(k) ?? 1) - 1;
      if (n > 0) emEnvio.set(k, n);
      else emEnvio.delete(k);
    }
  }
}

function agendar(ms = 350) {
  if (temporizador) return;
  temporizador = window.setTimeout(() => void enviarPendentes(), ms);
}

const armazenamentoSeguro: StateStorage = {
  getItem: (nome) => (modo === "banco" ? cache.get(nome) ?? null : localSeguro(() => localStorage.getItem(nome), cache.get(nome) ?? null)),
  setItem: (nome, valor) => {
    if (travado) return;
    if (modo === "banco") {
      if (cache.get(nome) === valor) return;
      cache.set(nome, valor);
      pendentes.set(nome, valor);
      marcarEscritaLocal(nome);
      agendar();
      avisarOutrasJanelas(nome, valor);
      return;
    }
    try {
      localStorage.setItem(nome, valor);
    } catch {
      cache.set(nome, valor);
      window.dispatchEvent(new CustomEvent("niko:armazenamento-cheio"));
    }
  },
  removeItem: (nome) => {
    if (travado) return;
    if (modo === "banco") {
      cache.delete(nome);
      pendentes.set(nome, null);
      marcarEscritaLocal(nome);
      agendar();
      avisarOutrasJanelas(nome, null);
      return;
    }
    localSeguro(() => localStorage.removeItem(nome), undefined);
    cache.delete(nome);
  },
};

export const armazenamento = createJSONStorage(() => armazenamentoSeguro);

export function chave(nome: string): string {
  return `${PREFIXO}${nome}`;
}

export function modoArmazenamento(): ModoArmazenamento {
  return modo;
}

function chavesLocais(): string[] {
  return localSeguro(() => Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO)), []);
}

export async function iniciarArmazenamento(): Promise<ModoArmazenamento> {
  try {
    const controle = new AbortController();
    const limite = window.setTimeout(() => controle.abort(), 4000);
    const r = await fetch("/ponte/dados", { headers: CABECALHOS, signal: controle.signal });
    window.clearTimeout(limite);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const { dados } = (await r.json()) as { dados: Record<string, string> };
    for (const [k, v] of Object.entries(dados)) {
      cache.set(k, v);
      sincronizado.set(k, v);
    }
    modo = "banco";
    const locais = chavesLocais().filter((k) => k !== `${PREFIXO}migrado`);
    const jaMigrou = localSeguro(() => localStorage.getItem(`${PREFIXO}migrado`), null);
    if (Object.keys(dados).length === 0 && locais.length > 0 && !jaMigrou) {
      for (const k of locais) {
        const v = localStorage.getItem(k);
        if (v != null) {
          cache.set(k, v);
          pendentes.set(k, v);
        }
      }
      await enviarPendentes();
      if (pendentes.size === 0) localSeguro(() => localStorage.setItem(`${PREFIXO}migrado`, new Date().toISOString()), undefined);
    }
    canal?.addEventListener("message", (e: MessageEvent<MudancaDeDados>) => receberDeFora(e.data));
    if (tauriDisponivel()) {
      const { listen } = await import("@tauri-apps/api/event");
      await listen<MudancaDeDados>(EVENTO_DADOS, (e) => receberDeFora(e.payload));
      await listen("niko://saindo", () => void enviarPendentes());
    }
    window.addEventListener("focus", () => void recarregarDaPonte());
    window.addEventListener("pagehide", () => void enviarPendentes(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void enviarPendentes(true);
      else void recarregarDaPonte();
    });
  } catch {
    modo = "local";
  }
  return modo;
}

export function aoMudarDeFora(fn: (chave: string) => void): () => void {
  ouvintesDeFora.add(fn);
  return () => ouvintesDeFora.delete(fn);
}

let travado = false;

export async function zerarTudo(apagarChaves: boolean): Promise<void> {
  travado = true;
  window.clearTimeout(temporizador);
  pendentes.clear();
  if (modo === "banco") {
    const r = await fetch("/ponte/dados/zerar", { method: "POST", headers: CABECALHOS, body: JSON.stringify({ confirmacao: "APAGAR", chaves: apagarChaves }) });
    if (!r.ok) {
      travado = false;
      throw new Error(`http_${r.status}`);
    }
    cache.clear();
  }
  for (const k of chavesLocais()) if (k !== `${PREFIXO}migrado`) localSeguro(() => localStorage.removeItem(k), undefined);
  localSeguro(() => localStorage.setItem(`${PREFIXO}migrado`, new Date().toISOString()), undefined);
}

export function salvarAgora(): Promise<void> {
  return enviarPendentes();
}

const CHAVE_AVISADOS = `${PREFIXO}avisados`;

export function marcarSeNovo(codigo: string): boolean {
  let lista: string[] = [];
  try {
    lista = JSON.parse((armazenamentoSeguro.getItem(CHAVE_AVISADOS) as string | null) ?? "[]") as string[];
    if (!Array.isArray(lista)) lista = [];
  } catch {
    lista = [];
  }
  if (lista.includes(codigo)) return false;
  armazenamentoSeguro.setItem(CHAVE_AVISADOS, JSON.stringify([...lista, codigo].slice(-300)));
  return true;
}

export function listarChaves(): string[] {
  if (modo === "banco") return [...cache.keys()].filter((k) => k.startsWith(PREFIXO));
  return chavesLocais();
}

export function lerChave(nome: string): string | null {
  return armazenamentoSeguro.getItem(nome) as string | null;
}

export function gravarChave(nome: string, valor: string) {
  armazenamentoSeguro.setItem(nome, valor);
}

export function apagarChave(nome: string) {
  armazenamentoSeguro.removeItem(nome);
}

export function tamanhoGuardado(): number {
  let total = 0;
  for (const k of listarChaves()) total += (lerChave(k) ?? "").length * 2;
  return total;
}
