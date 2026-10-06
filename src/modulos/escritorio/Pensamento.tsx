import { useEffect, useState } from "react";
import { Coffee, CloudSun, Sofa, MessagesSquare, PersonStanding, Laptop, Zap, Keyboard, PartyPopper, Bug, Moon, Ear, BellRing } from "lucide-react";
import { useAgentes } from "../../estado/agentes";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import type { AgenteId } from "../../tipos";
import type { Comportamento } from "./comportamento";

const ICONE_ACAO: Record<string, React.ReactNode> = {
  mesa: <Laptop size={12} />,
  cafe: <Coffee size={12} />,
  janela: <CloudSun size={12} />,
  sofa: <Sofa size={12} />,
  conversar: <MessagesSquare size={12} />,
  esticar: <PersonStanding size={12} />,
};

const ICONE_ESTADO: Record<string, React.ReactNode> = {
  pensando: <Zap size={12} />,
  escrevendo: <Keyboard size={12} />,
  sucesso: <PartyPopper size={12} />,
  erro: <Bug size={12} />,
  dormindo: <Moon size={12} />,
  ouvindo: <Ear size={12} />,
};

function sortear(lista: string[], anterior: string) {
  if (lista.length <= 1) return lista[0] ?? "";
  let novo = anterior;
  while (novo === anterior) novo = lista[Math.floor(Math.random() * lista.length)];
  return novo;
}

export function Pensamento({ agente, c, tarefa }: { agente: AgenteId; c: Comportamento; tarefa?: string }) {
  const alerta = useAgentes((s) => s.alertas.find((a) => a.agenteId === agente));
  const irPara = useInterface((s) => s.irPara);
  const acao = ICONE_ACAO[c.acao] ? c.acao : "mesa";
  const lista = c.estado !== "ocioso" && T.escritorio.pensamentosEstado[c.estado] ? T.escritorio.pensamentosEstado[c.estado] : T.escritorio.pensamentos[agente][acao] ?? [];
  const [texto, setTexto] = useState(() => sortear(lista, ""));
  const chave = `${c.estado}-${acao}`;

  useEffect(() => {
    setTexto((t) => sortear(lista, t));
    const intervalo = window.setInterval(() => {
      if (!document.hidden) setTexto((t) => sortear(lista, t));
    }, 9000 + Math.random() * 4000);
    return () => window.clearInterval(intervalo);
  }, [chave]);

  if (c.estado === "alerta" && alerta)
    return (
      <button type="button" className="balao-cena balao-fala" onClick={() => alerta.rota && irPara(alerta.rota)}>
        <BellRing size={12} />
        <span className="cortar privado">{alerta.texto}</span>
      </button>
    );

  const exibido = tarefa || texto;
  if (!exibido) return null;
  return (
    <div key={exibido} className="balao-cena balao-pensamento" aria-live="polite">
      {tarefa ? <Keyboard size={12} /> : ICONE_ESTADO[c.estado] ?? ICONE_ACAO[acao]}
      <span className="privado">{exibido}</span>
    </div>
  );
}
