import { useEffect, useRef, useState } from "react";
import { useAgentes, AGENTES, estadoDoAgente } from "../../estado/agentes";
import type { AgenteId, EstadoAgente } from "../../tipos";

export type Ponto = [number, number];

export const MESAS: Record<AgenteId, Ponto> = {
  organizador: [-3, -1.2],
  tutor: [0, -1.6],
  operador: [3, -1.2],
  java: [1.1, 1.2],
};

export const LUGARES = {
  cafe: [4.2, 2.4] as Ponto,
  janela: [-4.3, 1.6] as Ponto,
  sofa: [-2.4, 3] as Ponto,
  quadro: [0.6, 1.4] as Ponto,
};

export type Acao = "mesa" | "cafe" | "janela" | "sofa" | "conversar" | "girar" | "pular" | "esticar";

export interface Comportamento {
  alvo: Ponto;
  acao: Acao;
  estado: EstadoAgente;
}

const PESOS: [Acao, number][] = [
  ["cafe", 3],
  ["janela", 2],
  ["conversar", 2],
  ["sofa", 2],
  ["esticar", 1],
  ["mesa", 3],
];

function sortear(): Acao {
  const total = PESOS.reduce((a, [, p]) => a + p, 0);
  let r = Math.random() * total;
  for (const [acao, p] of PESOS) {
    r -= p;
    if (r <= 0) return acao;
  }
  return "mesa";
}

function desvio([x, z]: Ponto, i: number): Ponto {
  return [x + (i - 1) * 0.7, z + (i % 2) * 0.4];
}

export function useComportamento(): Record<AgenteId, Comportamento> {
  const s = useAgentes();
  const [livres, setLivres] = useState<Record<AgenteId, Acao>>({ organizador: "mesa", tutor: "cafe", operador: "janela", java: "mesa" });
  const estados = Object.fromEntries(AGENTES.map((a) => [a, estadoDoAgente(s, a)])) as Record<AgenteId, EstadoAgente>;
  const ref = useRef(estados);
  ref.current = estados;

  useEffect(() => {
    const temporizadores: number[] = [];
    const agendar = (a: AgenteId) => {
      temporizadores.push(
        window.setTimeout(() => {
          if (!document.hidden && ref.current[a] === "ocioso") setLivres((l) => ({ ...l, [a]: sortear() }));
          agendar(a);
        }, 8000 + Math.random() * 12000),
      );
    };
    AGENTES.forEach(agendar);
    return () => temporizadores.forEach((t) => window.clearTimeout(t));
  }, []);

  const resultado = {} as Record<AgenteId, Comportamento>;
  AGENTES.forEach((a, i) => {
    const estado = estados[a];
    let acao: Acao = livres[a];
    if (["pensando", "escrevendo", "erro", "alerta"].includes(estado)) acao = "mesa";
    if (estado === "dormindo") acao = "sofa";
    if (estado === "sucesso") acao = "pular";
    const outro = AGENTES[(i + 1) % AGENTES.length];
    const alvo: Ponto =
      acao === "mesa" || acao === "girar" || acao === "pular" || acao === "esticar"
        ? [MESAS[a][0], MESAS[a][1] + 0.9]
        : acao === "conversar"
          ? [MESAS[outro][0] + 0.8, MESAS[outro][1] + 1.2]
          : desvio(LUGARES[acao], i);
    resultado[a] = { alvo, acao, estado };
  });
  return resultado;
}
