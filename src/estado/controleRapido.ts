import { useEffect } from "react";
import { create } from "zustand";
import { controle, sistema, type AlvoDeAudio, type EstadoAudio, type EstadoSistema, type ItemDaBandeja } from "../ponte/ponteLocal";

interface EstadoControleRapido {
  audio: EstadoAudio | null;
  audioIndisponivel: boolean;
  rede: EstadoSistema | null;
  temaEscuro: boolean | null;
  bandeja: ItemDaBandeja[];
  bandejaLida: boolean;
  sincronizarAudio: () => Promise<void>;
  sincronizarRede: () => Promise<void>;
  definirVolume: (alvo: AlvoDeAudio, volume: number) => void;
  alternarMudo: (alvo: AlvoDeAudio) => void;
  ajustarApp: (pids: number[], ajuste: { volume?: number; mudo?: boolean }) => void;
  lerTema: () => Promise<void>;
  alternarTema: () => Promise<void>;
  lerBandeja: () => Promise<void>;
}

const PAUSA_APOS_MUDANCA_MS = 1500;
let ultimaMudanca = 0;
let lendoRede = false;
const ultimoPedido = new Map<string, () => Promise<unknown>>();
const emAndamento = new Set<string>();

function enviarEmSequencia(chave: string, pedido: () => Promise<unknown>) {
  ultimaMudanca = Date.now();
  ultimoPedido.set(chave, pedido);
  if (emAndamento.has(chave)) return;
  const proximo = async () => {
    const atual = ultimoPedido.get(chave);
    if (!atual) {
      emAndamento.delete(chave);
      return;
    }
    ultimoPedido.delete(chave);
    emAndamento.add(chave);
    await atual().catch(() => undefined);
    await proximo();
  };
  void proximo();
}

export const useControleRapido = create<EstadoControleRapido>()((set, get) => ({
  audio: null,
  audioIndisponivel: false,
  rede: null,
  temaEscuro: null,
  bandeja: [],
  bandejaLida: false,
  sincronizarAudio: async () => {
    try {
      const audio = await controle.audio();
      if (Date.now() - ultimaMudanca < PAUSA_APOS_MUDANCA_MS) return;
      set({ audio, audioIndisponivel: false });
    } catch {
      set({ audioIndisponivel: true });
    }
  },
  sincronizarRede: async () => {
    if (lendoRede) return;
    lendoRede = true;
    try {
      set({ rede: await sistema.estado() });
    } catch {
      return;
    } finally {
      lendoRede = false;
    }
  },
  definirVolume: (alvo, volume) => {
    const audio = get().audio;
    const nivel = audio?.[alvo];
    if (!audio || !nivel) return;
    set({ audio: { ...audio, [alvo]: { volume, mudo: volume === 0 ? nivel.mudo : false } } });
    enviarEmSequencia(`volume-${alvo}`, async () => {
      await controle.volume(alvo, volume);
      if (nivel.mudo && volume > 0) await controle.mudo(alvo, false);
    });
  },
  alternarMudo: (alvo) => {
    const audio = get().audio;
    const nivel = audio?.[alvo];
    if (!audio || !nivel) return;
    const mudo = !nivel.mudo;
    set({ audio: { ...audio, [alvo]: { ...nivel, mudo } } });
    enviarEmSequencia(`mudo-${alvo}`, () => controle.mudo(alvo, mudo));
  },
  ajustarApp: (pids, ajuste) => {
    const audio = get().audio;
    if (!audio || pids.length === 0) return;
    set({ audio: { ...audio, sessoes: audio.sessoes.map((s) => (pids.includes(s.pid) ? { ...s, ...ajuste } : s)) } });
    enviarEmSequencia(`app-${pids.join(",")}-${ajuste.volume !== undefined ? "volume" : "mudo"}`, () => controle.sessao(pids, ajuste));
  },
  lerTema: async () => {
    try {
      set({ temaEscuro: (await controle.tema()).escuro });
    } catch {
      set({ temaEscuro: null });
    }
  },
  alternarTema: async () => {
    const atual = get().temaEscuro;
    if (atual === null) return;
    set({ temaEscuro: !atual });
    try {
      set({ temaEscuro: (await controle.definirTema(!atual)).escuro });
    } catch {
      set({ temaEscuro: atual });
    }
  },
  lerBandeja: async () => {
    try {
      set({ bandeja: await controle.bandeja(), bandejaLida: true });
    } catch {
      set({ bandejaLida: true });
    }
  },
}));

function usarRepeticao(acao: () => Promise<void>, ativo: boolean, intervaloMs: number) {
  useEffect(() => {
    if (!ativo) return;
    void acao();
    const t = window.setInterval(() => !document.hidden && void acao(), intervaloMs);
    return () => window.clearInterval(t);
  }, [acao, ativo, intervaloMs]);
}

export function usarAudio(ativo: boolean, intervaloMs: number) {
  usarRepeticao(useControleRapido((s) => s.sincronizarAudio), ativo, intervaloMs);
}

export function usarRede(ativo: boolean, intervaloMs: number) {
  usarRepeticao(useControleRapido((s) => s.sincronizarRede), ativo, intervaloMs);
}

export function usarBandeja(ativo: boolean, intervaloMs: number) {
  usarRepeticao(useControleRapido((s) => s.lerBandeja), ativo, intervaloMs);
}

export function agruparSessoes(sessoes: EstadoAudio["sessoes"]) {
  const grupos = new Map<string, EstadoAudio["sessoes"]>();
  for (const s of sessoes) {
    const chave = s.sistema ? "sistema" : (s.caminho ?? `pid-${s.pid}`);
    grupos.set(chave, [...(grupos.get(chave) ?? []), s]);
  }
  return [...grupos.entries()].map(([chave, lista]) => ({
    chave,
    pids: [...new Set(lista.map((s) => s.pid))],
    nome: lista[0].nome,
    icone: lista[0].icone,
    sistema: lista[0].sistema,
    ativa: lista.some((s) => s.ativa),
    volume: Math.max(...lista.map((s) => s.volume)),
    mudo: lista.every((s) => s.mudo),
  }));
}
