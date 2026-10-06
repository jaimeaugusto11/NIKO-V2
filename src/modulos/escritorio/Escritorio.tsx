import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Box, LayoutGrid, MessageSquare, X } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Segmentado, AvisoFaixa } from "../../componentes/basicos";
import { Personagem } from "../../personagens/Personagem";
import { useAgentes, AGENTES } from "../../estado/agentes";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { horarioRelativo } from "../../utilitarios/datas";
import { useComportamento, MESAS, LUGARES, type Acao } from "./comportamento";
import { Pensamento } from "./Pensamento";
import type { AgenteId } from "../../tipos";

const Cena3D = lazy(() => import("./Cena3D"));

class LimiteErro extends Component<{ reserva: ReactNode; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  render() {
    return this.state.falhou ? this.props.reserva : this.props.children;
  }
}

const NOME_ACAO: Partial<Record<Acao, number>> = { cafe: 0, janela: 1, conversar: 2, esticar: 3, sofa: 4 };

function para2D([x, z]: [number, number]) {
  return { left: `${((x + 6) / 12) * 100}%`, top: `${((z + 4) / 8) * 100}%` };
}

function Sala2D({ comportamento, tarefas, aoEscolher }: { comportamento: ReturnType<typeof useComportamento>; tarefas: Record<AgenteId, string>; aoEscolher: (a: AgenteId) => void }) {
  return (
    <div className="sala-2d" role="img" aria-label={T.escritorio.titulo}>
      {AGENTES.map((a) => (
        <div key={a} className="sala-mesa" style={para2D(MESAS[a])}>
          <span className="sala-monitor" data-erro={comportamento[a].estado === "erro" ? "sim" : "nao"}>{tarefas[a] || T.escritorio.livre}</span>
        </div>
      ))}
      <div className="sala-objeto" style={para2D(LUGARES.sofa)}>{T.escritorio.objetos.sofa}</div>
      <div className="sala-objeto" style={para2D(LUGARES.cafe)}>{T.escritorio.objetos.cafe}</div>
      <div className="sala-objeto" style={para2D(LUGARES.janela)}>{T.escritorio.objetos.janela}</div>
      {AGENTES.map((a) => (
        <div key={a} className={`sala-agente agente-cena acao-${comportamento[a].acao}`} style={para2D(comportamento[a].alvo)}>
          <Pensamento agente={a} c={comportamento[a]} tarefa={tarefas[a]} />
          <Personagem agente={a} tamanho={52} estado={comportamento[a].estado} />
          <button type="button" className="sala-rotulo" onClick={() => aoEscolher(a)}>{useConfig.getState().agentes.nomes[a]}</button>
        </div>
      ))}
    </div>
  );
}

export default function Escritorio() {
  const modoLeve = useConfig((s) => s.modoLeveEscritorio);
  const definir = useConfig((s) => s.definir);
  const nomes = useConfig((s) => s.agentes.nomes);
  const cargos = useConfig((s) => s.agentes.cargos);
  const tarefas = useAgentes((s) => s.tarefaAtual);
  const atividades = useAgentes((s) => s.atividades);
  const irPara = useInterface((s) => s.irPara);
  const comportamento = useComportamento();
  const [escolhido, setEscolhido] = useState<AgenteId | null>(null);
  const escuro = document.documentElement.dataset.tema === "escuro";

  const legenda = (a: AgenteId) => {
    const c = comportamento[a];
    if (tarefas[a]) return tarefas[a];
    const i = NOME_ACAO[c.acao];
    return c.estado === "ocioso" && i !== undefined ? T.escritorio.acoesLivres[i] : T.agentes.estados[c.estado];
  };

  const reserva = <><AvisoFaixa tipo="alerta">{T.escritorio.falhou3d}</AvisoFaixa><Sala2D comportamento={comportamento} tarefas={tarefas} aoEscolher={setEscolhido} /></>;

  return (
    <>
      <CabecalhoAba
        titulo={T.escritorio.titulo}
        subtitulo={T.escritorio.subtitulo}
        acoes={
          <Segmentado
            rotulo={T.escritorio.titulo}
            valor={modoLeve ? "2d" : "3d"}
            aoMudar={(v) => definir({ modoLeveEscritorio: v === "2d" })}
            opcoes={[{ valor: "3d", rotulo: T.escritorio.modo3d, icone: <Box size={13} /> }, { valor: "2d", rotulo: T.escritorio.modoLeve, icone: <LayoutGrid size={13} /> }]}
          />
        }
      />
      <div className="escritorio">
        <div className="escritorio-cena">
          {modoLeve ? (
            <Sala2D comportamento={comportamento} tarefas={tarefas} aoEscolher={setEscolhido} />
          ) : (
            <LimiteErro reserva={reserva}>
              <Suspense fallback={<div className="vazio" aria-busy="true">{T.escritorio.carregando3d}</div>}>
                <Cena3D comportamento={comportamento} tarefas={tarefas} aoEscolher={setEscolhido} escuro={escuro} />
              </Suspense>
            </LimiteErro>
          )}
          {escolhido && (
            <div className="escritorio-cartao cartao">
              <div className="linha">
                <Personagem agente={escolhido} tamanho={44} />
                <div className="coluna" style={{ gap: 0, flex: 1 }}>
                  <b>{nomes[escolhido]}</b>
                  <span className="texto-3" style={{ fontSize: 11 }}>{cargos[escolhido]}: {T.agentes.areas[escolhido]}</span>
                </div>
                <Botao pequeno soIcone variante="fantasma" icone={<X size={14} />} aria-label={T.geral.fechar} onClick={() => setEscolhido(null)} />
              </div>
              <div className="coluna" style={{ gap: 2 }}>
                <span className="rotulo-secao">{T.escritorio.tarefaAtual}</span>
                <span>{legenda(escolhido)}</span>
              </div>
              <div className="coluna" style={{ gap: 2 }}>
                <span className="rotulo-secao">{T.escritorio.ultimasAcoes}</span>
                {atividades.filter((x) => x.agenteId === escolhido).slice(0, 5).map((x) => (
                  <span key={x.id} className="texto-2 cortar" style={{ fontSize: 12 }}>{x.texto} . {horarioRelativo(x.data)}</span>
                ))}
                {!atividades.some((x) => x.agenteId === escolhido) && <span className="texto-3">{T.agentes.semAtividade}</span>}
              </div>
              <Botao variante="primario" icone={<MessageSquare size={14} />} onClick={() => irPara("chat", { agente: escolhido })}>{T.escritorio.conversar}</Botao>
            </div>
          )}
        </div>
        <div className="lista-time">
          {AGENTES.map((a) => (
            <Cartao key={a} className="cartao-clicavel">
              <button type="button" className="linha" style={{ width: "100%", textAlign: "left" }} onClick={() => setEscolhido(a)}>
                <Personagem agente={a} tamanho={36} interativo={false} halo={false} estado={comportamento[a].estado} />
                <div className="coluna" style={{ gap: 0, minWidth: 0 }}>
                  <b>{nomes[a]}</b>
                  <span className="texto-2 cortar" style={{ fontSize: 12 }}>{legenda(a)}</span>
                </div>
              </button>
            </Cartao>
          ))}
        </div>
      </div>
    </>
  );
}
