import { useEffect } from "react";
import { addDays, addMonths, addWeeks } from "date-fns";
import { MOVEL, NATIVO } from "../desktop/desktop";
import { useIlha, type Revelacao } from "../estado/ilha";
import { useConfig } from "../estado/configuracoes";
import { useOrganizacao } from "../estado/organizacao";
import { usePomodoro } from "../estado/pomodoro";
import { aoTocarSom, type NomeSom } from "../ponte/sons";
import { funcaoLigada } from "../utilitarios/funcoes";
import { T } from "../textos/textos";
import type { Evento } from "../tipos";

type Canal = keyof typeof T.movel.canais;

// O Android fixa o som de um canal quando ele é criado; mudar o som exige um id novo.
const VERSAO_CANAIS = 1;
const CANAIS: Record<Canal, { som: string; alta: boolean }> = {
  lembretes: { som: "niko_wink", alta: true },
  agentes: { som: "niko_question", alta: false },
  foco: { som: "niko_finish", alta: true },
  mensagens: { som: "niko_send", alta: true },
  geral: { som: "niko_proud", alta: false },
};
const ID_POMODORO = 7001;
const LIMITE_AGENDADAS = 40;
const JANELA_AGENDA_MS = 7 * 86400000;
const CHAVE_AGENDADAS = "niko-movel-agendadas";

const VIBRACAO: Partial<Record<NomeSom, number | number[]>> = {
  pop: 12,
  send: 10,
  approve: 18,
  wink: [25, 40, 25],
  question: [15, 50, 15],
  finish: [20, 60, 30],
  proud: [20, 40, 20, 40, 40],
  annoyed: [40, 30, 40],
  error: [40, 40, 40],
  slap: 30,
};

const plugin = () => import("@tauri-apps/plugin-notification");
const idDoCanal = (c: Canal) => `niko-${c}-${VERSAO_CANAIS}`;

let pronto: Promise<boolean> | null = null;
const textosAgendados = new Set<string>();

function preparar(): Promise<boolean> {
  if (!NATIVO || !MOVEL) return Promise.resolve(false);
  pronto ??= (async () => {
    try {
      const n = await plugin();
      let permitido = await n.isPermissionGranted();
      if (!permitido) permitido = (await n.requestPermission()) === "granted";
      if (!permitido) return false;
      const existentes = new Set((await n.channels()).map((c) => c.id));
      for (const canal of Object.keys(CANAIS) as Canal[]) {
        if (existentes.has(idDoCanal(canal))) continue;
        await n.createChannel({
          id: idDoCanal(canal),
          name: T.movel.canais[canal].nome,
          description: T.movel.canais[canal].descricao,
          sound: CANAIS[canal].som,
          vibration: true,
          lights: true,
          importance: CANAIS[canal].alta ? n.Importance.High : n.Importance.Default,
          visibility: n.Visibility.Private,
        });
      }
      return true;
    } catch {
      return false;
    }
  })();
  return pronto;
}

async function notificar(canal: Canal, titulo: string, corpo: string) {
  if (!(await preparar())) return;
  const n = await plugin();
  n.sendNotification({ channelId: idDoCanal(canal), title: titulo, body: corpo, largeBody: corpo.length > 60 ? corpo : undefined, group: canal, autoCancel: true });
}

function proximaOcorrencia(e: Evento, agora: Date): Date | null {
  if (e.tipo !== "lembrete" || !e.hora) return null;
  let data = new Date(`${e.data}T${e.hora}:00`);
  if (Number.isNaN(data.getTime())) return null;
  if (e.repeticao !== "nenhuma") {
    let protecao = 0;
    while (data <= agora && protecao < 2000) {
      data = e.repeticao === "diaria" ? addDays(data, 1) : e.repeticao === "semanal" ? addWeeks(data, 1) : addMonths(data, 1);
      protecao++;
    }
  }
  if (data <= agora || data.getTime() - agora.getTime() > JANELA_AGENDA_MS) return null;
  if (e.ultimoDisparo && e.ultimoDisparo >= data.toISOString()) return null;
  return data;
}

function idDoLembrete(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (Math.imul(h, 31) + texto.charCodeAt(i)) | 0;
  return 10000 + (Math.abs(h) % 2_000_000_000);
}

function lerAgendadas(): number[] {
  try {
    const lidos = JSON.parse(localStorage.getItem(CHAVE_AGENDADAS) ?? "[]") as unknown;
    return Array.isArray(lidos) ? lidos.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

async function cancelarAgendadas() {
  textosAgendados.clear();
  const ids = lerAgendadas();
  if (ids.length === 0 || !(await preparar())) return;
  const n = await plugin();
  await n.cancel(ids).catch(() => undefined);
  localStorage.removeItem(CHAVE_AGENDADAS);
}

/** Com a app em segundo plano o JavaScript para; o que tem hora marcada vai para o alarme do Android. */
async function agendarAusencia() {
  await cancelarAgendadas();
  if (!(await preparar())) return;
  const { naoPerturbe, ilha, agentes } = useConfig.getState();
  if (ilha.notificacoes === "nenhuma") return;
  const agora = new Date();
  const itens: { id: number; canal: Canal; corpo: string; quando: Date }[] = [];
  const p = usePomodoro.getState();
  if (p.rodando && p.terminaEm && p.terminaEm > Date.now() + 1000) {
    itens.push({ id: ID_POMODORO, canal: "foco", corpo: p.etapa === "foco" ? T.pomodoro.fimFoco : T.pomodoro.fimPausa, quando: new Date(p.terminaEm) });
  }
  if (!naoPerturbe && funcaoLigada("calendario")) {
    for (const e of useOrganizacao.getState().eventos) {
      const quando = proximaOcorrencia(e, agora);
      if (quando) itens.push({ id: idDoLembrete(`${e.id}|${quando.toISOString()}`), canal: "lembretes", corpo: T.calendario.lembreteDisparado(e.titulo), quando });
    }
  }
  itens.sort((a, b) => a.quando.getTime() - b.quando.getTime());
  const n = await plugin();
  const ids: number[] = [];
  for (const item of itens.slice(0, LIMITE_AGENDADAS)) {
    n.sendNotification({
      id: item.id,
      channelId: idDoCanal(item.canal),
      title: agentes.nomes.organizador,
      body: item.corpo,
      schedule: n.Schedule.at(item.quando, false, true),
      group: item.canal,
      autoCancel: true,
    });
    ids.push(item.id);
    textosAgendados.add(item.corpo);
  }
  if (ids.length > 0) localStorage.setItem(CHAVE_AGENDADAS, JSON.stringify(ids));
}

function canalDe(r: Revelacao): Canal {
  if (r.aba === "foco") return "foco";
  if (r.aba === "chat") return "mensagens";
  if (r.tipo === "alerta") return "agentes";
  return "geral";
}

function tituloDe(r: Revelacao): string {
  return r.agente ? useConfig.getState().agentes.nomes[r.agente] : T.app.nome;
}

function vibrar(nome: NomeSom) {
  const padrao = VIBRACAO[nome];
  if (padrao === undefined || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(padrao);
  } catch {
    return;
  }
}

export function usarNotificacoesMoveis() {
  useEffect(() => {
    void preparar();
    void cancelarAgendadas();

    const pararSom = aoTocarSom((nome) => {
      if (!document.hidden) vibrar(nome);
    });

    // Enquanto o Android ainda deixa o JavaScript correr em segundo plano, o que a ilha mostraria vira notificação.
    const pararIlha = useIlha.subscribe((s, antes) => {
      const r = s.revelacao;
      if (!r || r === antes.revelacao || !document.hidden) return;
      if (textosAgendados.has(r.texto)) return;
      void notificar(canalDe(r), tituloDe(r), r.texto);
    });

    const aoSair = () => void agendarAusencia();
    const aoVoltar = () => void cancelarAgendadas();
    const aoMudar = () => (document.hidden ? aoSair() : aoVoltar());
    document.addEventListener("visibilitychange", aoMudar);
    window.addEventListener("pagehide", aoSair);
    return () => {
      pararSom();
      pararIlha();
      document.removeEventListener("visibilitychange", aoMudar);
      window.removeEventListener("pagehide", aoSair);
    };
  }, []);
}
