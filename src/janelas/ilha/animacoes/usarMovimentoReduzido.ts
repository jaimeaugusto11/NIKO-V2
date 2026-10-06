import { useReducedMotion } from "motion/react";
import { useConfig } from "../../../estado/configuracoes";

export function usarMovimentoReduzido() {
  const sistema = useReducedMotion();
  const configuracao = useConfig((s) => s.reduzirAnimacoes);
  return Boolean(sistema || configuracao);
}
