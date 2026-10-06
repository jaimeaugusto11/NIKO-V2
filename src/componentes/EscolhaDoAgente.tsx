import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Personagem } from "../personagens/Personagem";
import { AGENTES } from "../estado/agentes";
import { useConfig } from "../estado/configuracoes";
import { useConversando } from "../estado/conversando";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";
import type { AgenteId } from "../tipos";

const INTERVALOS = [70, 70, 75, 80, 90, 105, 125, 150, 185];

function sequenciaAte(alvo: AgenteId): AgenteId[] {
  const fim = AGENTES.indexOf(alvo);
  const passos = INTERVALOS.length;
  return Array.from({ length: passos + 1 }, (_, i) => AGENTES[(fim - (passos - i) + AGENTES.length * 4) % AGENTES.length]);
}

export function Digitando() {
  return (
    <span className="pontos-digitando" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.14 }} />
      ))}
    </span>
  );
}

export function EscolhaDoAgente({ tamanho = 30 }: { tamanho?: number }) {
  const fase = useConversando((s) => s.fase);
  const agente = useConversando((s) => s.agente);
  const nomes = useConfig((s) => s.agentes.nomes);
  const sequencia = useMemo(() => (agente ? sequenciaAte(agente) : []), [agente]);
  const [passo, setPasso] = useState(0);
  const parou = fase !== "escolhendo" || passo >= sequencia.length - 1;

  useEffect(() => {
    if (fase !== "escolhendo") {
      setPasso(sequencia.length - 1);
      return;
    }
    setPasso(0);
    let i = 0;
    let t = 0;
    const avancar = () => {
      i += 1;
      setPasso(i);
      if (i < sequencia.length - 1) {
        void tocarSom("tick", "interface");
        t = window.setTimeout(avancar, INTERVALOS[i] ?? 180);
      } else void tocarSom("pop", "interface");
    };
    t = window.setTimeout(avancar, INTERVALOS[0]);
    return () => window.clearTimeout(t);
  }, [fase, sequencia]);

  if (!fase || !agente) return null;
  const mostrado = sequencia[Math.min(passo, sequencia.length - 1)] ?? agente;

  return (
    <div className="roleta" data-parou={parou ? "sim" : "nao"}>
      <div className="roleta-janela" style={{ width: tamanho + 14, height: tamanho + 14 }}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={`${mostrado}-${passo}`}
            className="roleta-boneco"
            initial={{ y: "-90%", opacity: 0.4 }}
            animate={parou ? { y: [0, -7, 0], opacity: 1, transition: { duration: 0.34, ease: "easeOut" } } : { y: 0, opacity: 1, transition: { duration: 0.06 } }}
            exit={{ y: "90%", opacity: 0, transition: { duration: 0.06 } }}
          >
            <Personagem agente={mostrado} estado={parou ? (fase === "respondendo" ? "pensando" : "sucesso") : "ocioso"} tamanho={tamanho} interativo={false} halo={false} olhar={false} />
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="roleta-texto">
        {fase === "escolhendo" && !parou ? (
          <>{T.chat.escolhendo}</>
        ) : (
          <>
            <b>{nomes[agente]}</b> {fase === "respondendo" ? T.chat.pensandoCurto : T.chat.vaiResponder}
            <Digitando />
          </>
        )}
      </span>
    </div>
  );
}
