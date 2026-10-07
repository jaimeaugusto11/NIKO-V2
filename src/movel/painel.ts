import { useEffect, useMemo } from "react";
import { AGENTES, COR_ESTADO, estadoDoAgente, useAgentes } from "../estado/agentes";
import { useConfig } from "../estado/configuracoes";
import { useOrganizacao } from "../estado/organizacao";
import { usePomodoro } from "../estado/pomodoro";
import { useRotina } from "../estado/rotina";
import { deISO, hojeISO } from "../utilitarios/datas";
import { T } from "../textos/textos";
import type { AgenteId, EstadoAgente, Evento } from "../tipos";

const LIMITE_TAREFAS = 3;

export interface AgentePainel {
  nome: string;
  estado: string;
  letra: string;
  cor: string;
}

export interface Painel {
  notificacaoTitulo: string;
  notificacaoTexto: string;
  contagem: number;
  linha: string;
  aviso: string;
  vazio: string;
  agentes: AgentePainel[];
  tarefas: string[];
}

interface EntradaPainel {
  nomes: Record<AgenteId, string>;
  estados: Record<AgenteId, EstadoAgente>;
  tarefas: string[];
  totalTarefas: number;
  eventos: number;
  alerta: { nome: string; texto: string } | null;
  etapa: string;
  rodando: boolean;
  terminaEm: number | null;
  restanteMs: number | null;
  agora: number;
}

function ocorreNoDia(e: Evento, dia: string): boolean {
  if (e.data === dia) return true;
  if (e.repeticao === "nenhuma" || e.data > dia) return false;
  if (e.repeticao === "diaria") return true;
  const inicio = deISO(e.data);
  const alvo = deISO(dia);
  if (e.repeticao === "semanal") return inicio.getDay() === alvo.getDay();
  return inicio.getDate() === alvo.getDate();
}

function horaDe(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** O que a notificação fixa e o widget mostram. O pomodoro ganha ao aviso, porque está a contar. */
export function descreverPainel(entrada: EntradaPainel): Painel {
  const agentes = AGENTES.map((id) => {
    const nome = entrada.nomes[id] || id;
    return { nome, estado: T.agentes.estados[entrada.estados[id]], letra: [...nome][0]?.toUpperCase() ?? "?", cor: COR_ESTADO[entrada.estados[id]] };
  });
  const resumo = T.movel.resumoDoDia(entrada.totalTarefas, entrada.eventos);
  const aviso = entrada.alerta ? `${entrada.alerta.nome} · ${entrada.alerta.texto}` : "";
  const base = { vazio: T.movel.semTarefas, agentes, tarefas: entrada.tarefas };
  if (entrada.rodando && entrada.terminaEm && entrada.terminaEm > entrada.agora) {
    return { ...base, notificacaoTitulo: entrada.etapa, notificacaoTexto: resumo, contagem: entrada.terminaEm, linha: `${entrada.etapa} · até ${horaDe(entrada.terminaEm)}`, aviso };
  }
  if (entrada.rodando || entrada.restanteMs !== null) {
    const minutos = Math.max(0, Math.ceil((entrada.restanteMs ?? 0) / 60000));
    return { ...base, notificacaoTitulo: entrada.etapa, notificacaoTexto: `${T.movel.pomodoroPausado} · ${minutos} min`, contagem: 0, linha: `${entrada.etapa} · ${T.movel.pomodoroPausado} · ${minutos} min`, aviso };
  }
  if (entrada.alerta) {
    return { ...base, notificacaoTitulo: entrada.alerta.nome, notificacaoTexto: entrada.alerta.texto, contagem: 0, linha: aviso, aviso: resumo };
  }
  return { ...base, notificacaoTitulo: T.app.nome, notificacaoTexto: resumo, contagem: 0, linha: resumo, aviso: "" };
}

let ultimoEnviado = "";

function publicarPainel(json: string) {
  if (json === ultimoEnviado) return;
  const ponte = (window as Window & { NikoAndroid?: { publicar: (valor: string) => boolean } }).NikoAndroid;
  if (!ponte?.publicar) return;
  try {
    if (ponte.publicar(json)) ultimoEnviado = json;
  } catch {
    return;
  }
}

export function PainelMovel() {
  const nomes = useConfig((s) => s.agentes.nomes);
  const foto = useAgentes((s) => s);
  const tarefas = useRotina((s) => s.tarefas);
  const eventos = useOrganizacao((s) => s.eventos);
  const etapa = usePomodoro((s) => s.etapa);
  const rodando = usePomodoro((s) => s.rodando);
  const terminaEm = usePomodoro((s) => s.terminaEm);
  const restanteMs = usePomodoro((s) => s.restanteMs);
  const hoje = hojeISO();

  const json = useMemo(() => {
    const deHoje = tarefas.filter((t) => t.status !== "concluida" && t.status !== "cancelada" && Boolean(t.data) && (t.data as string) <= hoje);
    const estados = Object.fromEntries(AGENTES.map((id) => [id, estadoDoAgente(foto, id)])) as Record<AgenteId, EstadoAgente>;
    const ultimo = [...foto.alertas].reverse()[0];
    return JSON.stringify(
      descreverPainel({
        nomes,
        estados,
        tarefas: deHoje.slice(0, LIMITE_TAREFAS).map((t) => t.titulo),
        totalTarefas: deHoje.length,
        eventos: eventos.filter((e) => ocorreNoDia(e, hoje)).length,
        alerta: ultimo ? { nome: nomes[ultimo.agenteId], texto: ultimo.texto } : null,
        etapa: T.pomodoro.etapas[etapa],
        rodando,
        terminaEm,
        restanteMs,
        agora: Date.now(),
      }),
    );
  }, [nomes, foto, tarefas, eventos, etapa, rodando, terminaEm, restanteMs, hoje]);

  useEffect(() => {
    publicarPainel(json);
    const repetir = () => {
      ultimoEnviado = "";
      publicarPainel(json);
    };
    const espera = window.setTimeout(repetir, 2000);
    const aoVoltar = () => {
      if (document.hidden) return;
      ultimoEnviado = "";
      publicarPainel(json);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearTimeout(espera);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [json]);

  return null;
}
