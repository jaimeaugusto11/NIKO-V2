import type { ReactNode } from "react";
import type { AgenteId } from "../tipos";
import { Personagem } from "../personagens/Personagem";

interface Props {
  rotulo?: string;
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  agente?: AgenteId;
}

export function CabecalhoAba({ rotulo, titulo, subtitulo, acoes, agente }: Props) {
  return (
    <header className="cabecalho-aba">
      <div className="cabecalho-aba-texto">
        {rotulo && <span className="rotulo-pequeno">{rotulo}</span>}
        <h1 className="titulo-pagina">{titulo}</h1>
        {subtitulo && <p className="texto-2">{subtitulo}</p>}
        {acoes && <div className="cabecalho-aba-acoes">{acoes}</div>}
      </div>
      {agente && (
        <div className="cabecalho-aba-ilustracao">
          <Personagem agente={agente} tamanho={84} />
        </div>
      )}
    </header>
  );
}
