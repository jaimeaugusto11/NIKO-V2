import { ChevronRight, Share } from "lucide-react";
import { IPHONE, INSTALADO, NATIVO } from "../desktop/desktop";
import { useConfig } from "../estado/configuracoes";
import { ICONE_ROTA } from "../janelas/sistema/rotas";
import { rotaLigada } from "../utilitarios/funcoes";
import { T } from "../textos/textos";
import type { Rota } from "../tipos";
import { Conta } from "./Conta";

const MODULOS_MOVEIS: Rota[] = ["journal", "financas", "estudos", "metas", "conquistas", "conexoes", "ia", "configuracoes"];

export function Mais({ abrir }: { abrir: (rota: Rota) => void }) {
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const modulos = MODULOS_MOVEIS.filter((r) => rotaLigada(r, desligadas));
  return (
    <div className="movel-pagina">
      <header className="movel-titulo"><h1>{T.movel.abas.mais}</h1></header>
      {IPHONE && !NATIVO && !INSTALADO && (
        <p className="movel-instalar"><Share size={16} />{T.movel.instalarIos}</p>
      )}
      <Conta />
      <section className="movel-cartao" aria-label={T.movel.modulos}>
        {modulos.map((r) => {
          const Icone = ICONE_ROTA[r];
          return (
            <button key={r} type="button" className="movel-linha movel-linha-toque" onClick={() => abrir(r)}>
              <span className="movel-icone-modulo"><Icone size={18} /></span>
              <div className="movel-linha-texto"><b>{T.rotas[r]}</b></div>
              <ChevronRight size={18} className="texto-3" />
            </button>
          );
        })}
      </section>
    </div>
  );
}
