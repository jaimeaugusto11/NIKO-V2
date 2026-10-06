import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import type { AgenteId, ConquistaAlcancada } from "../tipos";

export interface DefinicaoConquista {
  codigo: string;
  agente: AgenteId;
  niveis: number[];
}

export const CONQUISTAS: DefinicaoConquista[] = [
  { codigo: "primeira_semana", agente: "organizador", niveis: [7] },
  { codigo: "sequencia_habito", agente: "organizador", niveis: [7, 30, 100, 365] },
  { codigo: "foco", agente: "organizador", niveis: [10, 100, 1000] },
  { codigo: "revisor", agente: "tutor", niveis: [100, 1000, 10000] },
  { codigo: "maratona", agente: "tutor", niveis: [240] },
  { codigo: "prova_vencida", agente: "tutor", niveis: [1] },
  { codigo: "orcamento_em_dia", agente: "operador", niveis: [1] },
  { codigo: "meta_economia", agente: "operador", niveis: [1] },
  { codigo: "sem_pendencias", agente: "operador", niveis: [1] },
  { codigo: "meta_vida", agente: "organizador", niveis: [1] },
];

interface EstadoConquistas {
  alcancadas: ConquistaAlcancada[];
  registrar: (codigo: string, nivel: number) => boolean;
  substituir: (alcancadas: ConquistaAlcancada[]) => void;
}

export const useConquistas = create<EstadoConquistas>()(
  persist(
    (set, get) => ({
      alcancadas: [],
      registrar: (codigo, nivel) => {
        if (get().alcancadas.some((a) => a.codigo === codigo && a.nivel >= nivel)) return false;
        set((s) => ({ alcancadas: [...s.alcancadas.filter((a) => a.codigo !== codigo), { codigo, nivel, data: new Date().toISOString() }] }));
        return true;
      },
      substituir: (alcancadas) => set({ alcancadas }),
    }),
    { name: chave("conquistas"), storage: armazenamento },
  ),
);
