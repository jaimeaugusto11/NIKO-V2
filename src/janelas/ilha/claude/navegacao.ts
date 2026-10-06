import { useInterface } from "../../../estado/interface";
import { useIlha } from "../../../estado/ilha";

export function abrirConfiguracoesClaude() {
  useInterface.getState().irPara("configuracoes", { secao: "claude" });
  useIlha.getState().recolher();
}
