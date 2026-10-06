import { create } from "zustand";
import type { AgenteId } from "../tipos";
import type { MarcaId } from "../marcas/Marca";
import { useConfig, type AbaIlha } from "./configuracoes";

export type EstadoIlha = "escondida" | "compacta" | "expandida";

export interface Revelacao {
  texto: string;
  tipo: "sucesso" | "info" | "alerta";
  marca?: MarcaId;
  agente?: AgenteId;
  aba?: AbaIlha;
}

interface Pendente {
  r: Revelacao;
  ms: number;
}

interface EstadoDaIlha {
  estado: EstadoIlha;
  aba: AbaIlha;
  revelacao: Revelacao | null;
  ultimaInteracao: number;
  definirEstado: (estado: EstadoIlha) => void;
  abrir: (aba?: AbaIlha) => void;
  recolher: () => void;
  revelar: (r: Revelacao, ms?: number, importancia?: "alta" | "normal") => void;
  dispensarRevelacao: () => void;
  avisarFalha: (texto: string) => void;
  tocar: () => void;
}

let temporizador: number | undefined;
let ultimaNormal = 0;
const fila: Pendente[] = [];
const INTERVALO_NORMAL = 90000;

export const useIlha = create<EstadoDaIlha>()((set, get) => {
  const mostrar = (p: Pendente) => {
    window.clearTimeout(temporizador);
    set({ revelacao: p.r, ultimaInteracao: Date.now() });
    temporizador = window.setTimeout(() => {
      const proxima = fila.shift();
      if (proxima) mostrar(proxima);
      else set({ revelacao: null, ultimaInteracao: Date.now() });
    }, p.ms);
  };

  return {
    estado: "compacta",
    aba: "calendario",
    revelacao: null,
    ultimaInteracao: Date.now(),
    definirEstado: (estado) => set({ estado, ultimaInteracao: Date.now() }),
    abrir: (aba) => set({ estado: "expandida", aba: aba ?? get().aba, ultimaInteracao: Date.now() }),
    recolher: () => set({ estado: "compacta", ultimaInteracao: Date.now() }),
    revelar: (r, ms = 4500, importancia = "alta") => {
      const { ilha, naoPerturbe } = useConfig.getState();
      const preferencia = ilha.notificacoes;
      if (preferencia === "nenhuma") return;
      if (naoPerturbe && r.aba !== "foco") return;
      if (importancia === "normal") {
        if (preferencia !== "todas") return;
        if (Date.now() - ultimaNormal < INTERVALO_NORMAL) return;
        ultimaNormal = Date.now();
      }
      if (get().estado === "expandida") return;
      const pendente = { r, ms };
      if (get().revelacao) {
        if (fila.length < 3 && !fila.some((f) => f.r.texto === r.texto)) fila.push(pendente);
        return;
      }
      mostrar(pendente);
    },
    dispensarRevelacao: () => {
      window.clearTimeout(temporizador);
      const proxima = fila.shift();
      if (proxima) mostrar(proxima);
      else set({ revelacao: null });
    },
    avisarFalha: (texto) => mostrar({ r: { texto, tipo: "alerta" }, ms: 4500 }),
    tocar: () => set({ ultimaInteracao: Date.now() }),
  };
});
