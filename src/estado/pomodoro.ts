import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import type { EtapaPomodoro, SessaoPomodoro } from "../tipos";
import { gerarId } from "../utilitarios/basicos";
import { useConfig } from "./configuracoes";

interface EstadoPomodoro {
  etapa: EtapaPomodoro;
  rodando: boolean;
  terminaEm: number | null;
  restanteMs: number | null;
  duracaoMs: number;
  inicioEtapa: string | null;
  ciclo: number;
  materiaId?: string;
  tarefaId?: string;
  sessoes: SessaoPomodoro[];
  iniciar: (minutos?: number) => void;
  pausar: () => void;
  continuar: () => void;
  alternar: () => void;
  reiniciar: () => void;
  encerrar: () => void;
  pular: () => void;
  concluirEtapa: (situacao?: "concluida" | "interrompida") => EtapaPomodoro;
  escolherEtapa: (etapa: EtapaPomodoro) => void;
  definirVinculo: (materiaId?: string, tarefaId?: string) => void;
  substituir: (sessoes: SessaoPomodoro[]) => void;
}

function minutosDaEtapa(etapa: EtapaPomodoro): number {
  const p = useConfig.getState().pomodoro;
  return etapa === "foco" ? p.foco : etapa === "pausa_curta" ? p.curta : p.longa;
}

export const usePomodoro = create<EstadoPomodoro>()(
  persist(
    (set, get) => ({
      etapa: "foco",
      rodando: false,
      terminaEm: null,
      restanteMs: null,
      duracaoMs: 25 * 60000,
      inicioEtapa: null,
      ciclo: 1,
      sessoes: [],
      iniciar: (minutos) => {
        const duracaoMs = Math.round((minutos ?? minutosDaEtapa(get().etapa)) * 60000);
        set({ rodando: true, duracaoMs, terminaEm: Date.now() + duracaoMs, restanteMs: null, inicioEtapa: new Date().toISOString() });
      },
      pausar: () => {
        const { terminaEm, rodando } = get();
        if (!rodando || !terminaEm) return;
        set({ rodando: false, restanteMs: Math.max(0, terminaEm - Date.now()), terminaEm: null });
      },
      continuar: () => {
        const { restanteMs } = get();
        if (restanteMs == null) {
          get().iniciar();
          return;
        }
        set({ rodando: true, terminaEm: Date.now() + restanteMs, restanteMs: null });
      },
      alternar: () => {
        const s = get();
        if (s.rodando) s.pausar();
        else if (s.restanteMs != null) s.continuar();
        else s.iniciar();
      },
      reiniciar: () => set({ rodando: false, terminaEm: null, restanteMs: null, inicioEtapa: null, duracaoMs: minutosDaEtapa(get().etapa) * 60000 }),
      encerrar: () => {
        const s = get();
        if (!s.inicioEtapa) return;
        const minutos = Math.round(Math.max(0, s.duracaoMs - restanteAtual(s, Date.now())) / 600) / 100;
        const sessao: SessaoPomodoro = { id: gerarId(), etapa: s.etapa, inicio: s.inicioEtapa, minutos, materiaId: s.materiaId, tarefaId: s.tarefaId, situacao: "interrompida" };
        set({ sessoes: [...s.sessoes, sessao].slice(-5000), rodando: false, terminaEm: null, restanteMs: null, inicioEtapa: null, duracaoMs: minutosDaEtapa(s.etapa) * 60000 });
      },
      pular: () => {
        const s = get();
        const proxima = proximaEtapa(s.etapa, s.ciclo);
        set({
          etapa: proxima.etapa,
          ciclo: proxima.ciclo,
          rodando: false,
          terminaEm: null,
          restanteMs: null,
          inicioEtapa: null,
          duracaoMs: minutosDaEtapa(proxima.etapa) * 60000,
        });
      },
      concluirEtapa: (situacao = "concluida") => {
        const s = get();
        const sessao: SessaoPomodoro = {
          id: gerarId(),
          etapa: s.etapa,
          inicio: s.inicioEtapa ?? new Date(Date.now() - s.duracaoMs).toISOString(),
          minutos: Math.round(s.duracaoMs / 60000),
          materiaId: s.etapa === "foco" ? s.materiaId : undefined,
          tarefaId: s.etapa === "foco" ? s.tarefaId : undefined,
          situacao,
        };
        const proxima = proximaEtapa(s.etapa, s.ciclo);
        set({
          sessoes: [...s.sessoes, sessao].slice(-5000),
          etapa: proxima.etapa,
          ciclo: proxima.ciclo,
          rodando: false,
          terminaEm: null,
          restanteMs: null,
          inicioEtapa: null,
          duracaoMs: minutosDaEtapa(proxima.etapa) * 60000,
        });
        if (useConfig.getState().pomodoro.autoProxima) get().iniciar();
        return s.etapa;
      },
      escolherEtapa: (etapa) => {
        if (get().rodando) return;
        set({ etapa, terminaEm: null, restanteMs: null, duracaoMs: minutosDaEtapa(etapa) * 60000 });
      },
      definirVinculo: (materiaId, tarefaId) => set({ materiaId, tarefaId }),
      substituir: (sessoes) => set({ sessoes }),
    }),
    {
      name: chave("pomodoro"),
      storage: armazenamento,
      partialize: (s) => ({
        etapa: s.etapa,
        rodando: s.rodando,
        terminaEm: s.terminaEm,
        restanteMs: s.restanteMs,
        duracaoMs: s.duracaoMs,
        inicioEtapa: s.inicioEtapa,
        ciclo: s.ciclo,
        materiaId: s.materiaId,
        tarefaId: s.tarefaId,
        sessoes: s.sessoes,
      }),
    },
  ),
);

function proximaEtapa(etapa: EtapaPomodoro, ciclo: number): { etapa: EtapaPomodoro; ciclo: number } {
  const ciclos = useConfig.getState().pomodoro.ciclos;
  if (etapa === "foco") return { etapa: ciclo >= ciclos ? "pausa_longa" : "pausa_curta", ciclo };
  if (etapa === "pausa_longa") return { etapa: "foco", ciclo: 1 };
  return { etapa: "foco", ciclo: ciclo + 1 };
}

export function restanteAtual(s: Pick<EstadoPomodoro, "rodando" | "terminaEm" | "restanteMs" | "duracaoMs">, agora: number): number {
  if (s.rodando && s.terminaEm) return Math.max(0, s.terminaEm - agora);
  if (s.restanteMs != null) return s.restanteMs;
  return s.duracaoMs;
}

export function formatarRelogio(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}
