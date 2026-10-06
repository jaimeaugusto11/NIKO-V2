import { apiGoogle, autorizarGoogle, lerCredencialGoogle, type CredencialGoogle } from "./google";

const ESCOPOS = ["https://www.googleapis.com/auth/calendar.readonly"];
const BASE = "https://www.googleapis.com/calendar/v3";
const DIAS_ANTES = 1;
const DIAS_DEPOIS = 30;
const MAXIMO_DE_CALENDARIOS = 8;

/** Evento de uma agenda externa (Google ou Microsoft), no formato que o Niko mostra. */
export interface EventoAgenda {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  local: string;
  link: string;
  calendario: string;
  cor: string;
}

interface DataGoogle {
  date?: string;
  dateTime?: string;
}

interface EventoGoogle {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: DataGoogle;
  end?: DataGoogle;
}

export function autorizarGoogleCalendar(clienteId: string, segredo: string): Promise<CredencialGoogle> {
  return autorizarGoogle(clienteId, segredo, ESCOPOS, "Google Calendar");
}

const quando = (d?: DataGoogle) => d?.dateTime ?? d?.date ?? "";

export async function lerGoogleCalendar(texto: string) {
  const c = lerCredencialGoogle(texto);
  const lista = await apiGoogle<{ items?: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; selected?: boolean }[] }>(c, `${BASE}/users/me/calendarList?minAccessRole=reader`);
  const calendarios = (lista.items ?? []).filter((x) => x.primary || x.selected).slice(0, MAXIMO_DE_CALENDARIOS);
  const de = new Date(Date.now() - DIAS_ANTES * 86400000).toISOString();
  const ate = new Date(Date.now() + DIAS_DEPOIS * 86400000).toISOString();
  const porCalendario = await Promise.all(
    calendarios.map((cal) =>
      apiGoogle<{ items?: EventoGoogle[] }>(c, `${BASE}/calendars/${encodeURIComponent(cal.id)}/events?${new URLSearchParams({ timeMin: de, timeMax: ate, singleEvents: "true", orderBy: "startTime", maxResults: "100" })}`)
        .then((r) =>
          (r.items ?? [])
            .filter((e) => e.status !== "cancelled" && quando(e.start))
            .map<EventoAgenda>((e) => ({
              id: `${cal.id}:${e.id}`,
              titulo: e.summary || "(sem título)",
              inicio: quando(e.start),
              fim: quando(e.end) || quando(e.start),
              diaInteiro: Boolean(e.start?.date && !e.start?.dateTime),
              local: e.location ?? "",
              link: e.hangoutLink ?? e.htmlLink ?? "",
              calendario: cal.summaryOverride || cal.summary || cal.id,
              cor: cal.backgroundColor ?? "",
            })),
        )
        .catch(() => []),
    ),
  );
  const principal = calendarios.find((x) => x.primary);
  return {
    conta: principal?.id ?? "",
    calendarios: calendarios.map((x) => ({ nome: x.summaryOverride || x.summary || x.id, cor: x.backgroundColor ?? "" })),
    eventos: porCalendario.flat().sort((a, b) => a.inicio.localeCompare(b.inicio)),
  };
}
