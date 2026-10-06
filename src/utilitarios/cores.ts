function canalLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function hexValido(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

export function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hexValido(hex) ? hex.slice(1) : "3b6fe0";
  return [parseInt(limpo.slice(0, 2), 16), parseInt(limpo.slice(2, 4), 16), parseInt(limpo.slice(4, 6), 16)];
}

export function luminancia(hex: string): number {
  const [r, g, b] = hexParaRgb(hex);
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}

export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function textoSobre(hex: string): string {
  return contraste(hex, "#ffffff") >= contraste(hex, "#111111") ? "#ffffff" : "#111111";
}

export function comAlfa(hex: string, alfa: number): string {
  const [r, g, b] = hexParaRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

export function misturar(a: string, b: string, pesoDeA: number): string {
  const ca = hexParaRgb(a);
  const cb = hexParaRgb(b);
  return `#${ca.map((v, i) => Math.round(v * pesoDeA + cb[i] * (1 - pesoDeA)).toString(16).padStart(2, "0")).join("")}`;
}

export const FUNDO_DESTAQUE = "destaque";
const TINTA_CLARA = "255, 255, 255";
const TINTA_ESCURA = "17, 17, 17";

export interface AparenciaDeBorda {
  fundo: string;
  fundoSolido: string;
  fundoElevado: string;
  claro: boolean;
  rgbDaTinta: string;
}

export function aparenciaDeBorda(fundo: string, opacidade: number, destaque: string): AparenciaDeBorda {
  const base = fundo === FUNDO_DESTAQUE ? misturar(destaque, "#000000", 0.82) : hexValido(fundo) ? fundo : "#000000";
  const claro = textoSobre(base) !== "#ffffff";
  const alfa = Math.max(0.3, Math.min(1, opacidade));
  return {
    fundo: comAlfa(base, alfa),
    fundoSolido: base,
    fundoElevado: misturar(base, claro ? "#000000" : "#ffffff", claro ? 0.97 : 0.94),
    claro,
    rgbDaTinta: claro ? TINTA_ESCURA : TINTA_CLARA,
  };
}
