import { MOVEL, NATIVO } from "../desktop/desktop";

export type Ambiente = "desktop" | "movel" | "navegador";

export const AMBIENTE: Ambiente = MOVEL ? "movel" : NATIVO ? "desktop" : "navegador";

/** Os módulos perguntam pela capacidade, não pelo ambiente, para a mesma lógica servir no PC e no telemóvel. */
export const CAPACIDADES = {
  ponte: AMBIENTE !== "movel",
} as const;
