import { useMemo } from "react";
import { CalendarDays, CheckSquare, Flame, Bell, Timer, Pause, Play } from "lucide-react";
import { useRotina, habitoCumprido } from "../estado/rotina";
import { useOrganizacao } from "../estado/organizacao";
import { usePomodoro } from "../estado/pomodoro";
import { AGENTES, COR_ESTADO, useAgentes, useEstadoAgente } from "../estado/agentes";
import { useConfig } from "../estado/configuracoes";
import { Personagem } from "../personagens/Personagem";
import { CaixaMarcar } from "../componentes/basicos";
import { deISO, formatarData, hojeISO } from "../utilitarios/datas";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";
import type { AgenteId, Evento, Tarefa } from "../tipos";

const LIMITE_TAREFAS = 8;

function ocorreNoDia(e: Evento, dia: string): boolean {
  if (e.data === dia) return true;
  if (e.repeticao === "nenhuma" || e.data > dia) return false;
  if (e.repeticao === "diaria") return true;
  const inicio = deISO(e.data);
  const alvo = deISO(dia);
  if (e.repeticao === "semanal") return inicio.getDay() === alvo.getDay();
  return inicio.getDate() === alvo.getDate();
}

function saudacao(): string {
  const h = new Date().getHours();
  return h < 12 ? T.datas.bomDia : h < 18 ? T.datas.boaTarde : T.datas.boaNoite;
}

function pendenteHoje(t: Tarefa, hoje: string): boolean {
  return t.status !== "concluida" && t.status !== "cancelada" && Boolean(t.data) && (t.data as string) <= hoje;
}

function CartaoPomodoro() {
  const p = usePomodoro();
  if (!p.rodando && p.restanteMs === null) return null;
  const restante = p.rodando && p.terminaEm ? p.terminaEm - Date.now() : p.restanteMs ?? 0;
  const minutos = Math.max(0, Math.ceil(restante / 60000));
  return (
    <section className="movel-cartao movel-cartao-destaque">
      <header className="movel-cartao-topo"><Timer size={16} />{T.movel.agora}</header>
      <div className="movel-linha">
        <div className="movel-linha-texto">
          <b>{T.pomodoro.etapas[p.etapa]}</b>
          <span className="texto-2">{p.rodando ? T.movel.pomodoroRestante(minutos) : T.movel.pomodoroPausado}</span>
        </div>
        <button type="button" className="movel-botao-redondo" aria-label={p.rodando ? T.pomodoro.pausar : T.pomodoro.continuar} onClick={() => (p.rodando ? p.pausar() : p.continuar())}>
          {p.rodando ? <Pause size={18} /> : <Play size={18} />}
        </button>
      </div>
    </section>
  );
}

function MembroDoTime({ agente }: { agente: AgenteId }) {
  const estado = useEstadoAgente(agente);
  const nome = useConfig((s) => s.agentes.nomes[agente]);
  return (
    <span className={`movel-membro movel-agente-${estado}`} style={{ "--cor-estado": COR_ESTADO[estado] } as React.CSSProperties}>
      <span className="movel-membro-rosto">
        <Personagem agente={agente} tamanho={44} interativo={false} halo={false} olhar={false} />
        {estado === "dormindo" && <span className="movel-zzz" aria-hidden="true">z<span>z</span></span>}
      </span>
      <b className="cortar">{nome}</b>
      <span className="texto-3 cortar">{T.agentes.estados[estado]}</span>
    </span>
  );
}

function TimeAgora({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <button type="button" className="movel-cartao movel-time" aria-label={T.movel.time} onClick={aoAbrir}>
      {AGENTES.map((a) => <MembroDoTime key={a} agente={a} />)}
    </button>
  );
}

export function Hoje({ abrirAgentes }: { abrirAgentes: () => void }) {
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const mudarStatus = useRotina((s) => s.mudarStatus);
  const registrarHabito = useRotina((s) => s.registrarHabito);
  const eventos = useOrganizacao((s) => s.eventos);
  const alertas = useAgentes((s) => s.alertas);
  const resolverAlerta = useAgentes((s) => s.resolverAlerta);
  const nomes = useConfig((s) => s.agentes.nomes);
  const hoje = hojeISO();

  const deHoje = useMemo(
    () => tarefas.filter((t) => pendenteHoje(t, hoje)).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || (a.hora ?? "99").localeCompare(b.hora ?? "99")),
    [tarefas, hoje],
  );
  const agenda = useMemo(() => eventos.filter((e) => ocorreNoDia(e, hoje)).sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? "")), [eventos, hoje]);
  const ativos = habitos.filter((h) => !h.arquivado);
  const recentes = [...alertas].reverse().slice(0, 3);

  return (
    <div className="movel-pagina">
      <header className="movel-saudacao">
        <span className="texto-3">{formatarData(new Date(), "EEEE, d 'de' MMMM")}</span>
        <h1>{saudacao()}</h1>
        <p className="texto-2">{T.movel.resumoDoDia(deHoje.length, agenda.length)}</p>
      </header>

      <TimeAgora aoAbrir={abrirAgentes} />

      <CartaoPomodoro />

      {recentes.length > 0 && (
        <section className="movel-cartao">
          <header className="movel-cartao-topo"><Bell size={16} />{T.movel.avisos}</header>
          {recentes.map((a) => (
            <button
              key={a.id}
              type="button"
              className="movel-linha movel-linha-toque"
              onClick={() => {
                resolverAlerta(a.id);
                void tocarSom("approve", "personagens");
              }}
            >
              <Personagem agente={a.agenteId} estado="alerta" tamanho={32} interativo={false} halo={false} olhar={false} />
              <div className="movel-linha-texto">
                <b>{nomes[a.agenteId]}</b>
                <span className="texto-2">{a.texto}</span>
              </div>
            </button>
          ))}
        </section>
      )}

      <section className="movel-cartao">
        <header className="movel-cartao-topo"><CalendarDays size={16} />{T.movel.agenda}</header>
        {agenda.length === 0 ? (
          <p className="texto-3 movel-vazio">{T.movel.semEventos}</p>
        ) : (
          agenda.map((e) => (
            <div key={e.id} className="movel-linha">
              <span className="movel-hora">{e.hora ?? T.movel.diaTodo}</span>
              <div className="movel-linha-texto"><b>{e.titulo}</b></div>
            </div>
          ))
        )}
      </section>

      <section className="movel-cartao">
        <header className="movel-cartao-topo"><CheckSquare size={16} />{T.movel.tarefas}</header>
        {deHoje.length === 0 ? (
          <p className="texto-3 movel-vazio">{T.movel.semTarefas}</p>
        ) : (
          deHoje.slice(0, LIMITE_TAREFAS).map((t) => (
            <div key={t.id} className="movel-linha">
              <CaixaMarcar
                marcada={false}
                rotulo={t.titulo}
                aoMudar={() => {
                  mudarStatus(t.id, "concluida");
                  void tocarSom("pop");
                }}
              />
              <div className="movel-linha-texto">
                <b>{t.titulo}</b>
                {(t.data as string) < hoje ? <span className="movel-atrasada">{T.movel.atrasada}</span> : t.hora && <span className="texto-3">{t.hora}</span>}
              </div>
            </div>
          ))
        )}
        {deHoje.length > LIMITE_TAREFAS && <p className="texto-3 movel-vazio">{T.movel.maisTarefas(deHoje.length - LIMITE_TAREFAS)}</p>}
      </section>

      <section className="movel-cartao">
        <header className="movel-cartao-topo"><Flame size={16} />{T.movel.habitos}</header>
        {ativos.length === 0 ? (
          <p className="texto-3 movel-vazio">{T.movel.semHabitos}</p>
        ) : (
          <div className="movel-habitos">
            {ativos.map((h) => {
              const valor = registros[hoje]?.[h.id] ?? 0;
              const feito = habitoCumprido(h, valor);
              return (
                <button
                  key={h.id}
                  type="button"
                  className="movel-habito"
                  aria-pressed={feito}
                  onClick={() => {
                    registrarHabito(hoje, h.id, h.tipo === "sim_nao" ? (feito ? 0 : 1) : valor + 1);
                    if (!feito) void tocarSom("pop");
                  }}
                >
                  <span className="cortar">{h.nome}</span>
                  {h.tipo === "quantidade" && <span className="texto-3">{valor}/{h.meta} {h.unidade}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
