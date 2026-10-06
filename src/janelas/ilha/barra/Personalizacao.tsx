import { motion } from "motion/react";
import { Check, ExternalLink, Image, Settings2 } from "lucide-react";
import { useConfig, type RepousoIlha, type Tema } from "../../../estado/configuracoes";
import { useInterface } from "../../../estado/interface";
import { useIlha } from "../../../estado/ilha";
import { controle } from "../../../ponte/ponteLocal";
import { tocarSom } from "../../../ponte/sons";
import { DESTAQUE_PADRAO } from "../../area-de-trabalho/usarTema";
import { FUNDOS_PRONTOS } from "../../../modulos/configuracoes/SeletorDeFundo";
import { FUNDO_DESTAQUE, hexValido, misturar, textoSobre } from "../../../utilitarios/cores";
import { T } from "../../../textos/textos";

const P = T.ilha.barra.personalizacao;
const DESTAQUES_PRONTOS = ["#a78bfa", "#3b82f6", "#10b981", "#f59e0b", "#f4505e", "#ec4899"];

function Escolha<V extends string>({ rotulo, valor, opcoes, aoMudar }: { rotulo: string; valor: V; opcoes: { valor: V; rotulo: string }[]; aoMudar: (v: V) => void }) {
  return (
    <div className="ilha-escolha" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} className="ilha-escolha-opcao" onClick={() => aoMudar(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function Amostra({ cor, rotulo, ativa, aoClicar }: { cor: string; rotulo: string; ativa: boolean; aoClicar: () => void }) {
  return (
    <button type="button" className="ilha-amostra" style={{ background: cor }} aria-label={rotulo} title={rotulo} aria-pressed={ativa} onClick={aoClicar}>
      {ativa && <Check size={12} color={textoSobre(cor)} />}
    </button>
  );
}

function CorLivre({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (cor: string) => void }) {
  return (
    <label className="ilha-amostra ilha-amostra-livre" title={rotulo}>
      <input type="color" value={valor} aria-label={rotulo} onChange={(e) => aoMudar(e.target.value)} />
    </label>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="ilha-personalizar-secao">
      <span className="ilha-personalizar-titulo">{titulo}</span>
      {children}
    </div>
  );
}

export function Personalizacao({ topo, aoFechar }: { topo: number; aoFechar: () => void }) {
  const cfg = useConfig();
  const irPara = useInterface((s) => s.irPara);
  const corDoDestaque = cfg.destaque && hexValido(cfg.destaque) ? cfg.destaque : DESTAQUE_PADRAO.escuro;
  const amostraDeFundo = (valor: string) => (valor === FUNDO_DESTAQUE ? misturar(corDoDestaque, "#000000", 0.82) : valor);
  const fonte = cfg.ilha;
  const percentual = Math.round(fonte.opacidade * 100);

  const aplicarCor = (mudanca: { fundo?: string; opacidade?: number }) => {
    cfg.definirIlha(mudanca);
    cfg.definir({ dock: { ...useConfig.getState().dock, ...mudanca } });
  };

  return (
    <motion.div
      className="ilha-pop ilha-personalizar"
      style={{ top: topo, maxHeight: `calc(100vh - ${topo + 12}px)` }}
      role="dialog"
      aria-label={T.ilha.barra.personalizar}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: "spring", visualDuration: 0.28, bounce: 0.15 }}
    >
      <Secao titulo={P.temaDoNiko}>
        <Escolha<Tema> rotulo={P.temaDoNiko} valor={cfg.tema} aoMudar={(tema) => cfg.definir({ tema })} opcoes={(["claro", "escuro", "sistema"] as Tema[]).map((t) => ({ valor: t, rotulo: P.temas[t] }))} />
      </Secao>

      <Secao titulo={P.destaque}>
        <div className="ilha-amostras">
          {DESTAQUES_PRONTOS.map((cor) => (
            <Amostra key={cor} cor={cor} rotulo={cor} ativa={corDoDestaque.toLowerCase() === cor} aoClicar={() => cfg.definir({ destaque: cor })} />
          ))}
          <CorLivre rotulo={T.configuracoes.outraCor} valor={corDoDestaque} aoMudar={(destaque) => cfg.definir({ destaque })} />
        </div>
      </Secao>

      <Secao titulo={P.cores}>
        <div className="ilha-amostras">
          {FUNDOS_PRONTOS.map((f) => (
            <Amostra key={f.valor} cor={amostraDeFundo(f.valor)} rotulo={f.rotulo} ativa={fonte.fundo === f.valor} aoClicar={() => aplicarCor({ fundo: f.valor })} />
          ))}
          <CorLivre rotulo={T.configuracoes.outraCor} valor={hexValido(fonte.fundo) ? fonte.fundo : amostraDeFundo(fonte.fundo)} aoMudar={(fundo) => aplicarCor({ fundo })} />
        </div>
        <div className="ilha-rapido-linha">
          <span className="ilha-personalizar-rotulo">{T.configuracoes.opacidade}</span>
          <input
            type="range"
            className="ilha-rapido-deslizante"
            min={30}
            max={100}
            step={5}
            value={percentual}
            aria-label={T.configuracoes.opacidade}
            style={{ ["--preenchido" as string]: `${((percentual - 30) / 70) * 100}%` }}
            onChange={(e) => aplicarCor({ opacidade: Number(e.target.value) / 100 })}
          />
          <span className="ilha-rapido-valor numero">{percentual}%</span>
        </div>
        <p className="ilha-rapido-vazio">{T.configuracoes.textoAutomatico}</p>
      </Secao>

      <Secao titulo={P.tamanhoDaIlha}>
        <Escolha rotulo={P.tamanhoDaIlha} valor={cfg.ilha.tamanho} aoMudar={(tamanho) => cfg.definirIlha({ tamanho })} opcoes={(["pequena", "media", "grande"] as const).map((t) => ({ valor: t, rotulo: T.configuracoes.tamanhos[t] }))} />
      </Secao>

      <Secao titulo={P.repouso}>
        <Escolha<RepousoIlha> rotulo={P.repouso} valor={cfg.ilha.repouso} aoMudar={(repouso) => cfg.definirIlha({ repouso })} opcoes={(Object.keys(T.configuracoes.repousos) as RepousoIlha[]).map((r) => ({ valor: r, rotulo: T.configuracoes.repousos[r] }))} />
      </Secao>

      <div className="ilha-personalizar-rodape">
        <button
          type="button"
          className="ilha-rapido-texto"
          onClick={() => {
            void tocarSom("open");
            aoFechar();
            void controle.ferramenta("papelDeParede").catch(() => useIlha.getState().avisarFalha(T.ilha.barra.indisponivel));
          }}
        >
          <Image size={14} />
          {P.papelDeParede}
          <ExternalLink size={12} />
        </button>
        <button
          type="button"
          className="ilha-rapido-texto"
          onClick={() => {
            void tocarSom("open");
            aoFechar();
            irPara("configuracoes", { secao: "aparencia" });
          }}
        >
          <Settings2 size={14} />
          {P.maisOpcoes}
        </button>
      </div>
    </motion.div>
  );
}
