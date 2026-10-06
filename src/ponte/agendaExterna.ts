import { useEffect, useState } from "react";
import { useComunicacao } from "../estado/comunicacao";
import { conexoesPonte, SERVICOS_DE_AGENDA, type EventoAgenda } from "./conexoesReais";

const INTERVALO_MS = 5 * 60000;

/** Eventos do Google Calendar e do Microsoft 365 ligados, para o calendário do Niko e a agenda da ilha. */
export function usarAgendaExterna(): EventoAgenda[] {
  const ligadas = useComunicacao((s) => SERVICOS_DE_AGENDA.filter((id) => s.conexoes.some((c) => c.id === id && c.ligada && c.chaveSalva)).join(","));
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  useEffect(() => {
    if (!ligadas) {
      setEventos([]);
      return;
    }
    let vivo = true;
    const ler = async () => {
      const listas = await Promise.all(ligadas.split(",").map((id) => conexoesPonte.ler(id as (typeof SERVICOS_DE_AGENDA)[number]).then((d) => d.eventos).catch(() => [] as EventoAgenda[])));
      if (vivo) setEventos(listas.flat());
    };
    void ler();
    const t = window.setInterval(() => void ler(), INTERVALO_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [ligadas]);
  return eventos;
}
