import type { AgenteId } from "../tipos";
import { caminhoPersonagem } from "./cores";

export interface Elipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  transform: string;
  fill: string;
}

export interface Rosto {
  corpo: { d: string; transform: string; fill: string };
  olhos: { branco: Elipse; pupila: Elipse }[];
}

const cache = new Map<AgenteId, Promise<Rosto | null>>();

function elipse(el: Element): Elipse {
  return {
    cx: Number(el.getAttribute("cx") ?? 0),
    cy: Number(el.getAttribute("cy") ?? 0),
    rx: Number(el.getAttribute("rx") ?? 0),
    ry: Number(el.getAttribute("ry") ?? 0),
    transform: el.getAttribute("transform") ?? "",
    fill: el.getAttribute("fill") ?? "#141416",
  };
}

async function extrair(agente: AgenteId): Promise<Rosto | null> {
  try {
    const r = await fetch(caminhoPersonagem(agente, "ocioso"));
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), "image/svg+xml");
    const caminho = doc.querySelector("defs path#s0");
    const quadro = doc.querySelector("svg > g");
    const uso = quadro?.querySelector(":scope > use");
    if (!caminho || !quadro || !uso) return null;
    const filhos = Array.from(quadro.children);
    const olhos: Rosto["olhos"] = [];
    for (let i = 0; i < filhos.length; i++) {
      const el = filhos[i];
      if (el.tagName !== "ellipse") continue;
      const proximo = filhos[i + 1];
      const pupila = proximo?.tagName === "g" ? proximo.querySelector("ellipse") : null;
      if (pupila) olhos.push({ branco: elipse(el), pupila: elipse(pupila) });
    }
    if (olhos.length === 0) return null;
    return {
      corpo: { d: caminho.getAttribute("d") ?? "", transform: uso.getAttribute("transform") ?? "", fill: uso.getAttribute("fill") ?? "#000" },
      olhos,
    };
  } catch {
    return null;
  }
}

export function carregarRosto(agente: AgenteId): Promise<Rosto | null> {
  let p = cache.get(agente);
  if (!p) {
    p = extrair(agente).then((r) => {
      if (!r) cache.delete(agente);
      return r;
    });
    cache.set(agente, p);
  }
  return p;
}

type Ouvinte = (x: number, y: number) => void;
const ouvintes = new Set<Ouvinte>();
let quadroPendente = 0;
let ultimo = { x: -9999, y: -9999 };

function aoMover(e: PointerEvent) {
  ultimo = { x: e.clientX, y: e.clientY };
  if (quadroPendente) return;
  quadroPendente = requestAnimationFrame(() => {
    quadroPendente = 0;
    ouvintes.forEach((o) => o(ultimo.x, ultimo.y));
  });
}

export function ouvirMouse(o: Ouvinte): () => void {
  if (ouvintes.size === 0) window.addEventListener("pointermove", aoMover, { passive: true });
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
    if (ouvintes.size === 0) window.removeEventListener("pointermove", aoMover);
  };
}
