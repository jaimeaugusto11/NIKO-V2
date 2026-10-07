import { useMemo } from "react";
import { useAgentes } from "../estado/agentes";
import { horarioRelativo } from "../utilitarios/datas";
import { T } from "../textos/textos";
import type { AgenteId, EstadoAgente } from "../tipos";

export const ESTADOS_ATIVOS: EstadoAgente[] = ["pensando", "escrevendo", "ouvindo"];

/** O que o agente "diz" no cartão: a tarefa em curso, o aviso pendente ou uma fala do estado em que está. */
export function useFala(agente: AgenteId, estado: EstadoAgente): string {
  const tarefa = useAgentes((s) => s.tarefaAtual[agente]);
  const erro = useAgentes((s) => s.sinais[agente].erro);
  const alerta = useAgentes((s) => [...s.alertas].reverse().find((a) => a.agenteId === agente)?.texto);
  const ultima = useAgentes((s) => s.atividades.find((a) => a.agenteId === agente));
  const sorteio = useMemo(() => Math.random(), [estado]);

  if ((estado === "pensando" || estado === "escrevendo") && tarefa) return tarefa;
  if (estado === "alerta" && alerta) return alerta;
  if (estado === "erro" && erro) return erro;
  const falas = T.escritorio.pensamentosEstado[estado];
  if (falas?.length) return falas[Math.floor(sorteio * falas.length)];
  if (ultima) return `${ultima.texto} · ${horarioRelativo(ultima.data)}`;
  return "";
}
