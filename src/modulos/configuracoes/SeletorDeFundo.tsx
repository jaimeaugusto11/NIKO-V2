import { FUNDO_PADRAO_DAS_BORDAS, useConfig } from "../../estado/configuracoes";
import { DESTAQUE_PADRAO } from "../../janelas/area-de-trabalho/usarTema";
import { FUNDO_DESTAQUE, hexValido, misturar } from "../../utilitarios/cores";
import { T } from "../../textos/textos";

export const FUNDOS_PRONTOS = [
  { valor: FUNDO_PADRAO_DAS_BORDAS, rotulo: T.configuracoes.fundosProntos.grafite },
  { valor: "#000000", rotulo: T.configuracoes.fundosProntos.preto },
  { valor: "#1d2738", rotulo: T.configuracoes.fundosProntos.noite },
  { valor: "#f4f5f7", rotulo: T.configuracoes.fundosProntos.branco },
];

interface PropsSeletorDeFundo {
  id: string;
  fundo: string;
  opacidade: number;
  aoMudar: (mudanca: { fundo?: string; opacidade?: number }) => void;
}

export function SeletorDeFundo({ id, fundo, opacidade, aoMudar }: PropsSeletorDeFundo) {
  const destaque = useConfig((s) => s.destaque);
  const corDoDestaque = destaque && hexValido(destaque) ? destaque : DESTAQUE_PADRAO.escuro;
  const amostra = (valor: string) => (valor === FUNDO_DESTAQUE ? misturar(corDoDestaque, "#000000", 0.82) : valor);
  const pronto = FUNDOS_PRONTOS.some((f) => f.valor === fundo);
  const percentual = Math.round(opacidade * 100);

  return (
    <>
      <div className="campo-grupo">
        <span className="campo-rotulo">{T.configuracoes.corDeFundo}</span>
        <div className="pilulas">
          {FUNDOS_PRONTOS.map((f) => (
            <button key={f.valor} type="button" className="pilula" aria-pressed={fundo === f.valor} onClick={() => aoMudar({ fundo: f.valor })}>
              <span className="ponto-cor" style={{ background: amostra(f.valor), border: "1px solid var(--borda-forte)" }} />
              {f.rotulo}
            </button>
          ))}
          <label className="pilula" aria-pressed={!pronto} htmlFor={`${id}-cor`}>
            <input
              id={`${id}-cor`}
              type="color"
              className="seletor-cor"
              style={{ width: 18, height: 18 }}
              value={hexValido(fundo) ? fundo : amostra(fundo)}
              aria-label={T.configuracoes.outraCor}
              onChange={(e) => aoMudar({ fundo: e.target.value })}
            />
            {T.configuracoes.outraCor}
          </label>
        </div>
        <span className="campo-dica">{T.configuracoes.textoAutomatico}</span>
      </div>
      <div className="campo-grupo">
        <label className="campo-rotulo" htmlFor={`${id}-opacidade`}>{T.configuracoes.opacidade}</label>
        <div className="linha">
          <input
            id={`${id}-opacidade`}
            type="range"
            min={30}
            max={100}
            step={5}
            value={percentual}
            style={{ flex: 1 }}
            onChange={(e) => aoMudar({ opacidade: Number(e.target.value) / 100 })}
          />
          <span className="numero" style={{ width: 44, textAlign: "right" }}>{T.configuracoes.opacidadeValor(percentual)}</span>
        </div>
      </div>
    </>
  );
}
