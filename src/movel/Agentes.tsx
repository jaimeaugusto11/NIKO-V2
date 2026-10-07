import { ChevronRight, MessageSquarePlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Personagem } from "../personagens/Personagem";
import { useAgentes, AGENTES, useEstadoAgente, COR_ESTADO, estadoDoAgente } from "../estado/agentes";
import { useComunicacao } from "../estado/comunicacao";
import { useConfig } from "../estado/configuracoes";
import { formatar, horarioRelativo } from "../utilitarios/datas";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";
import type { AgenteId } from "../tipos";
import { ESTADOS_ATIVOS, useFala } from "./fala";

const LIMITE_CONVERSAS = 12;
const LIMITE_ATIVIDADES = 8;

export function SeloEstado({ agente }: { agente: AgenteId }) {
  const estado = useEstadoAgente(agente);
  return (
    <span className={`movel-selo movel-selo-${estado}`} style={{ "--cor-estado": COR_ESTADO[estado] } as React.CSSProperties}>
      <i aria-hidden="true" />
      {T.agentes.estados[estado]}
    </span>
  );
}

function CartaoAgente({ agente, aoAbrir }: { agente: AgenteId; aoAbrir: () => void }) {
  const nome = useConfig((s) => s.agentes.nomes[agente]);
  const cargo = useConfig((s) => s.agentes.cargos[agente]);
  const estado = useEstadoAgente(agente);
  const fala = useFala(agente, estado);
  const acordar = useAgentes((s) => s.acordar);
  const ativo = ESTADOS_ATIVOS.includes(estado);

  return (
    <article className={`movel-agente movel-agente-${estado}`} style={{ "--cor-estado": COR_ESTADO[estado] } as React.CSSProperties}>
      <div
        className="movel-agente-rosto"
        onPointerDown={() => {
          if (estado === "dormindo") {
            acordar(agente);
            void tocarSom("yawn", "personagens");
          }
        }}
      >
        <Personagem agente={agente} tamanho={64} olhar={false} rotulo={nome} />
        {estado === "dormindo" && <span className="movel-zzz" aria-hidden="true">z<span>z</span><span>z</span></span>}
      </div>
      <button
        type="button"
        className="movel-agente-corpo"
        aria-label={T.movel.falarCom(nome)}
        onClick={() => {
          void tocarSom("greet", "personagens");
          aoAbrir();
        }}
      >
        <span className="movel-agente-nome">
          <b className="cortar">{nome}</b>
          <SeloEstado agente={agente} />
        </span>
        <span className="texto-3 cortar">{cargo}</span>
        <AnimatePresence mode="wait" initial={false}>
          {fala && <motion.span
            key={fala}
            className={`movel-fala${ativo ? " movel-fala-viva" : ""}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {fala}
            {ativo && <span className="movel-reticencias" aria-hidden="true"><i /><i /><i /></span>}
          </motion.span>}
        </AnimatePresence>
      </button>
      <ChevronRight size={18} className="movel-agente-seta" aria-hidden="true" />
    </article>
  );
}

function ResumoDoTime() {
  const resumo = useAgentes((s) => {
    const estados = AGENTES.map((a) => estadoDoAgente(s, a));
    return T.movel.resumoTime(
      estados.filter((e) => ESTADOS_ATIVOS.includes(e)).length,
      estados.filter((e) => e === "dormindo").length,
      estados.filter((e) => e === "alerta").length,
    );
  });
  return <p className="texto-2 movel-nota">{resumo}</p>;
}

function Atividades() {
  const atividades = useAgentes((s) => s.atividades);
  const nomes = useConfig((s) => s.agentes.nomes);
  const recentes = atividades.slice(0, LIMITE_ATIVIDADES);
  return (
    <section className="movel-cartao">
      <header className="movel-cartao-topo">{T.movel.atividade}</header>
      {recentes.length === 0 ? (
        <p className="texto-3 movel-vazio">{T.movel.semAtividade}</p>
      ) : (
        <ol className="movel-linha-tempo">
          {recentes.map((a) => (
            <li key={a.id}>
              <Personagem agente={a.agenteId} estado="ocioso" tamanho={28} interativo={false} halo={false} olhar={false} />
              <div className="movel-linha-texto">
                <span className="texto-2"><b>{nomes[a.agenteId]}</b> {a.texto}</span>
              </div>
              <span className="texto-3 movel-hora">{horarioRelativo(a.data)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Agentes({ abrirConversa }: { abrirConversa: (parametros: Record<string, string>) => void }) {
  const conversas = useComunicacao((s) => s.conversas);
  const nomes = useConfig((s) => s.agentes.nomes);
  const recentes = [...conversas].sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm)).slice(0, LIMITE_CONVERSAS);

  return (
    <div className="movel-pagina">
      <header className="movel-titulo">
        <h1>{T.movel.abas.agentes}</h1>
        <ResumoDoTime />
      </header>

      <div className="movel-lista-agentes">
        {AGENTES.map((a) => (
          <CartaoAgente key={a} agente={a} aoAbrir={() => abrirConversa({ agente: a })} />
        ))}
      </div>

      <button type="button" className="movel-botao-largo" onClick={() => abrirConversa({})}>
        <MessageSquarePlus size={18} />
        {T.movel.novaConversa}
      </button>
      <p className="texto-3 movel-nota">{T.movel.semIa}</p>

      <Atividades />

      <section className="movel-cartao">
        <header className="movel-cartao-topo">{T.movel.conversas}</header>
        {recentes.length === 0 ? (
          <p className="texto-3 movel-vazio">{T.movel.semConversas}</p>
        ) : (
          recentes.map((c) => {
            const ultima = c.mensagens[c.mensagens.length - 1];
            return (
              <button key={c.id} type="button" className="movel-linha movel-linha-toque" onClick={() => abrirConversa({ conversa: c.id })}>
                <Personagem agente={ultima?.agenteId ?? c.agenteId} tamanho={36} interativo={false} halo={false} olhar={false} />
                <div className="movel-linha-texto">
                  <b className="cortar">{c.titulo || T.chat.novaConversa}</b>
                  <span className="texto-3 cortar">{ultima ? `${ultima.autor === "agente" ? `${nomes[ultima.agenteId]}: ` : ""}${ultima.texto}` : ""}</span>
                </div>
                <span className="texto-3 movel-hora">{formatar(c.atualizadaEm, "dd/MM")}</span>
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}
