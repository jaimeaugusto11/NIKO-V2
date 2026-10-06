import { useEffect, useRef, useState } from "react";
import { Circle, CircleDot, CheckCircle2, CalendarClock, XCircle, CirclePause, Trash2, Flag, type LucideIcon } from "lucide-react";
import type { StatusTarefa, Tarefa } from "../tipos";
import { useRotina } from "../estado/rotina";
import { useInterface } from "../estado/interface";
import { useAgentes } from "../estado/agentes";
import { T } from "../textos/textos";
import { tocarSom } from "../ponte/sons";

export const ICONE_STATUS: Record<StatusTarefa, LucideIcon> = {
  a_fazer: Circle,
  em_andamento: CircleDot,
  concluida: CheckCircle2,
  reagendada: CalendarClock,
  cancelada: XCircle,
  em_aguardo: CirclePause,
};

export const ORDEM_STATUS: StatusTarefa[] = ["a_fazer", "em_andamento", "concluida", "reagendada", "em_aguardo", "cancelada"];

export function SeletorStatus({ status, aoMudar }: { status: StatusTarefa; aoMudar: (s: StatusTarefa) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const Icone = ICONE_STATUS[status];

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("pointerdown", fechar);
    return () => window.removeEventListener("pointerdown", fechar);
  }, [aberto]);

  return (
    <div ref={caixa} style={{ position: "relative" }}>
      <button
        type="button"
        className={`seletor-status status-${status}`}
        aria-label={T.status[status]}
        title={T.geral.dicaStatus(T.status[status])}
        aria-haspopup="menu"
        onClick={() => aoMudar(status === "concluida" ? "a_fazer" : "concluida")}
        onContextMenu={(e) => {
          e.preventDefault();
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
          }
        }}
      >
        <Icone size={17} />
      </button>
      {aberto && (
        <div className="menu-flutuante" role="menu" style={{ top: 30, left: 0 }}>
          {ORDEM_STATUS.map((s) => {
            const I = ICONE_STATUS[s];
            return (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={s === status}
                className="menu-item"
                onClick={() => {
                  aoMudar(s);
                  setAberto(false);
                }}
              >
                <I size={14} className={`status-${s}`} />
                {T.status[s]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ItemTarefa({ tarefa, mostrarData, extra }: { tarefa: Tarefa; mostrarData?: boolean; extra?: React.ReactNode }) {
  const mudarStatus = useRotina((s) => s.mudarStatus);
  const atualizar = useRotina((s) => s.atualizarTarefa);
  const excluir = useRotina((s) => s.excluirTarefa);
  const restaurar = useRotina((s) => s.restaurarTarefa);
  const avisar = useInterface((s) => s.avisar);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(tarefa.titulo);

  const salvarTitulo = () => {
    const limpo = titulo.trim();
    if (limpo && limpo !== tarefa.titulo) atualizar(tarefa.id, { titulo: limpo.slice(0, 200) });
    else setTitulo(tarefa.titulo);
    setEditando(false);
  };

  return (
    <div className="item-tarefa">
      <SeletorStatus
        status={tarefa.status}
        aoMudar={(s) => {
          mudarStatus(tarefa.id, s);
          if (s === "concluida") {
            void tocarSom("finish", "personagens");
            useAgentes.getState().registrar("organizador", `${T.geral.concluir}: ${tarefa.titulo}`);
          }
        }}
      />
      <div className="lista-item-principal">
        {editando ? (
          <input
            className="campo"
            style={{ height: 30 }}
            value={titulo}
            autoFocus
            maxLength={200}
            aria-label={T.geral.editar}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvarTitulo();
              if (e.key === "Escape") {
                setTitulo(tarefa.titulo);
                setEditando(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={`lista-item-titulo privado ${tarefa.status === "concluida" || tarefa.status === "cancelada" ? "riscado" : ""}`}
            style={{ textAlign: "left" }}
            onDoubleClick={() => setEditando(true)}
            onKeyDown={(e) => e.key === "F2" && setEditando(true)}
            title={T.geral.editar}
          >
            {tarefa.titulo}
          </button>
        )}
        {(mostrarData || tarefa.hora || tarefa.checklist.length > 0) && (
          <span className="lista-item-sub numero">
            {[tarefa.hora, mostrarData && tarefa.data ? tarefa.data.split("-").reverse().slice(0, 2).join("/") : "", tarefa.checklist.length > 0 ? `${tarefa.checklist.filter((c) => c.feito).length}/${tarefa.checklist.length}` : ""]
              .filter(Boolean)
              .join(" . ")}
          </span>
        )}
      </div>
      {tarefa.prioridade === "alta" && <Flag size={13} color="var(--erro)" aria-label={T.prioridade.alta} />}
      {extra}
      <div className="lista-item-acoes">
        <button
          type="button"
          className="botao botao-fantasma botao-pequeno botao-icone"
          aria-label={T.geral.excluir}
          title={T.geral.excluir}
          onClick={() => {
            const removida = excluir(tarefa.id);
            if (removida) avisar(T.geral.excluido, () => restaurar(removida));
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
