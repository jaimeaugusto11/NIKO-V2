import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Sparkles } from "lucide-react";
import { useInterface } from "../../estado/interface";
import { useConfig, type ModoBorda, type Tema } from "../../estado/configuracoes";
import { Personagem } from "../../personagens/Personagem";
import { AGENTES } from "../../estado/agentes";
import { Botao, Campo, Segmentado, Tecla } from "../../componentes/basicos";
import { T } from "../../textos/textos";
import { tocarSom } from "../../ponte/sons";
import { EditorFoto } from "../../componentes/FotoPerfil";

function PreviaDoModo({ modo }: { modo: ModoBorda }) {
  return (
    <div className="previa-modo" data-modo={modo} role="img" aria-label={`${T.primeira.previaModo}: ${T.configuracoes.modos[modo]}`}>
      <span className="previa-modo-janela" />
      <span className="previa-modo-ilha" />
      <span className="previa-modo-cursor" />
    </div>
  );
}

export function PrimeiraExecucao() {
  const cfg = useConfig();
  const [passo, setPasso] = useState(0);
  const [nome, setNome] = useState(cfg.nome);
  const [erroNome, setErroNome] = useState("");
  const total = T.primeira.passos.length;

  const concluir = () => {
    cfg.definir({ primeiraExecucaoFeita: true, nome: nome.trim().slice(0, 40) });
    void tocarSom("greet", "personagens");
  };

  const avancar = () => {
    if (passo === 1) {
      const limpo = nome.trim();
      if (limpo.length > 40) {
        setErroNome(T.validacao.tamanhoMaximo(40));
        return;
      }
      cfg.definir({ nome: limpo });
    }
    setPasso((p) => Math.min(total - 1, p + 1));
  };

  return (
    <div className="sobreposicao sobreposicao-centro" style={{ zIndex: 1200 }}>
      <motion.div className="assistente" role="dialog" aria-modal="true" aria-label={T.primeira.passos[passo]} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
        <ol className="assistente-passos" aria-label={T.primeira.progresso}>
          {T.primeira.passos.map((p, i) => (
            <li key={p} data-estado={i < passo ? "feito" : i === passo ? "atual" : "proximo"}>
              <span className="assistente-bolinha">{i < passo ? <Check size={11} /> : i + 1}</span>
              <span className="assistente-rotulo">{p}</span>
            </li>
          ))}
        </ol>
        <AnimatePresence mode="wait">
          <motion.div key={passo} className="assistente-corpo" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            {passo === 0 && (
              <>
                <div className="linha" style={{ gap: 24, justifyContent: "center", padding: "8px 0 16px" }}>
                  {AGENTES.map((a) => (
                    <div key={a} className="coluna" style={{ alignItems: "center", gap: 8 }}>
                      <Personagem agente={a} tamanho={72} rotulo={T.agentes.nomes[a]} />
                      <b>{T.agentes.nomes[a]}</b>
                      <span className="texto-3" style={{ fontSize: 11, textAlign: "center", maxWidth: 140 }}>{cfg.agentes.cargos[a]}: {T.agentes.areas[a]}</span>
                    </div>
                  ))}
                </div>
                <h2 className="titulo-secao">{T.primeira.boasVindas}</h2>
                <p className="texto-2">{T.primeira.boasVindasTexto}</p>
              </>
            )}
            {passo === 1 && (
              <div className="formulario">
                <h2 className="titulo-secao">{T.primeira.perfil}</h2>
                <EditorFoto tamanho={84} />
                <Campo id="pe-nome" rotulo={T.configuracoes.nomePerfil} erro={erroNome}>
                  <input
                    id="pe-nome"
                    className="campo"
                    value={nome}
                    maxLength={40}
                    autoFocus
                    aria-invalid={erroNome ? "true" : "false"}
                    onChange={(e) => {
                      setNome(e.target.value);
                      setErroNome("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && avancar()}
                  />
                </Campo>
                <div className="campo-grupo">
                  <span className="campo-rotulo">{T.configuracoes.tema}</span>
                  <Segmentado<Tema>
                    rotulo={T.configuracoes.tema}
                    valor={cfg.tema}
                    aoMudar={(tema) => cfg.definir({ tema })}
                    opcoes={[
                      { valor: "claro", rotulo: T.barraLateral.temaClaro },
                      { valor: "escuro", rotulo: T.barraLateral.temaEscuro },
                      { valor: "sistema", rotulo: T.barraLateral.temaSistema },
                    ]}
                  />
                </div>
              </div>
            )}
            {passo === 2 && (
              <div className="formulario">
                <h2 className="titulo-secao">{T.primeira.ilha}</h2>
                <div className="campo-grupo">
                  <span className="campo-rotulo">{T.configuracoes.secoes.ilha}</span>
                  <Segmentado<ModoBorda>
                    rotulo={T.configuracoes.secoes.ilha}
                    valor={cfg.ilha.modo}
                    aoMudar={(modo) => cfg.definirIlha({ modo })}
                    opcoes={(["fixo", "esconder", "inteligente"] as ModoBorda[]).map((m) => ({ valor: m, rotulo: T.configuracoes.modos[m] }))}
                  />
                  <PreviaDoModo modo={cfg.ilha.modo} />
                  <span className="campo-dica">{T.configuracoes.modosDica[cfg.ilha.modo]}</span>
                </div>
                <div className="campo-grupo">
                  <span className="campo-rotulo">{T.configuracoes.secoes.dock}</span>
                  <Segmentado<ModoBorda>
                    rotulo={T.configuracoes.secoes.dock}
                    valor={cfg.dock.modo}
                    aoMudar={(modo) => cfg.definir({ dock: { ...cfg.dock, modo } })}
                    opcoes={(["fixo", "esconder", "inteligente"] as ModoBorda[]).map((m) => ({ valor: m, rotulo: T.configuracoes.modos[m] }))}
                  />
                </div>
              </div>
            )}
            {passo === 3 && (
              <>
                <h2 className="titulo-secao">{T.primeira.ia}</h2>
                <p className="texto-2">{T.primeira.iaTexto}</p>
                <div>
                  <Botao
                    icone={<Sparkles size={14} />}
                    onClick={() => {
                      concluir();
                      useInterface.getState().irPara("ia");
                    }}
                  >
                    {T.primeira.configurarIa}
                  </Botao>
                </div>
                <h2 className="titulo-secao" style={{ marginTop: 8 }}>{T.primeira.dados}</h2>
                <p className="texto-2">{T.primeira.dadosTexto}</p>
              </>
            )}
            {passo === 4 && (
              <>
                <h2 className="titulo-secao">{T.primeira.pronto}</h2>
                <p className="texto-2">{T.primeira.prontoTexto}</p>
                <div className="linha" style={{ marginTop: 8 }}>
                  <Tecla>Ctrl K</Tecla>
                  <Tecla>Ctrl Alt Espaço</Tecla>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="assistente-rodape">
          <Botao variante="fantasma" onClick={() => concluir()}>{T.primeira.pular}</Botao>
          <div className="linha">
            {passo > 0 && <Botao onClick={() => setPasso((p) => p - 1)}>{T.geral.voltar}</Botao>}
            {passo === total - 1 ? (
              <Botao variante="primario" onClick={() => concluir()}>{T.primeira.comecar}</Botao>
            ) : (
              <Botao variante="primario" onClick={avancar}>{T.primeira.continuar}</Botao>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
