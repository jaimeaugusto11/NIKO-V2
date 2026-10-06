import { useEffect, useMemo, useRef, useState } from "react";
import { PainelFuncoes } from "./PainelFuncoes";
import { blocoLigado, conquistaLigada, funcaoLigada } from "../../utilitarios/funcoes";
import { Plus, Timer, Wallet, Plug, Layers, Gauge, Trophy, CalendarDays, Users, ListTodo, SlidersHorizontal, ToggleRight, GripVertical, ChevronRight, Cpu, Play, Pause, RotateCcw, SkipForward } from "lucide-react";
import { useMosaico } from "../../componentes/useMosaico";
import { resumoPorAgente } from "../../utilitarios/contextoIa";
import { lerConsumo, type Consumo } from "../../ponte/ponteLocal";
import { faltaPara, nivelDoUso, rotuloJanela } from "../../utilitarios/consumo";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cartao, Botao, Modal, Alternador, Progresso, Vazio } from "../../componentes/basicos";
import { ItemTarefa } from "../../componentes/ItemTarefa";
import { MapaDeCalor } from "../../componentes/MapaDeCalor";
import { BarrasHorizontais, BarrasVerticais, Anel } from "../../componentes/Graficos";
import { Personagem } from "../../personagens/Personagem";
import { Marca } from "../../marcas/Marca";
import { useConfig, type BlocoInicio } from "../../estado/configuracoes";
import { useRotina, tarefasDoDia, habitoCumprido } from "../../estado/rotina";
import { useEstudos, revisoesParaHoje, cartoesVencidos } from "../../estado/estudos";
import { usePomodoro, restanteAtual, formatarRelogio } from "../../estado/pomodoro";
import type { EtapaPomodoro } from "../../tipos";
import { useFinancas, gastoPorCategoria, receitasDoMes, gastosDoMes, parteDoUsuario, saldoDaConta } from "../../estado/financas";
import { useComunicacao } from "../../estado/comunicacao";
import { useAgentes, AGENTES, estadoDoAgente, COR_ESTADO } from "../../estado/agentes";
import { useConquistas, CONQUISTAS } from "../../estado/conquistas";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { hojeISO, saudacao, formatarData, agoraDoNiko, descreverDistancia, paraISO, formatar, horarioRelativo, diaDoMomento } from "../../utilitarios/datas";
import { formatarDinheiro } from "../../utilitarios/dinheiro";
import { somar } from "../../utilitarios/basicos";
import { minutosEstudoPorDia, sequenciaDias } from "../../utilitarios/estatisticas";
import { addDays } from "date-fns";

function extra(i: number, base: number) {
  return i >= base ? "item-extra" : "";
}

const numeroCurto =new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const dolar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

const ICONES: Record<BlocoInicio, React.ReactNode> = {
  time: <Users size={16} />,
  hoje: <ListTodo size={16} />,
  foco: <Timer size={16} />,
  financas: <Wallet size={16} />,
  conexoes: <Plug size={16} />,
  revisoes: <Layers size={16} />,
  consumo: <Gauge size={16} />,
  mapa: <CalendarDays size={16} />,
  conquistas: <Trophy size={16} />,
};

const LARGURA: Record<BlocoInicio, string> = {
  time: "bento-12",
  hoje: "bento-4",
  foco: "bento-4",
  financas: "bento-4",
  conexoes: "bento-4",
  revisoes: "bento-4",
  consumo: "bento-4",
  conquistas: "bento-12",
  mapa: "bento-12",
};

const TITULO: Record<BlocoInicio, string> = {
  time: T.inicio.time,
  hoje: T.inicio.hoje,
  foco: T.inicio.foco,
  financas: T.inicio.financas,
  conexoes: T.inicio.conexoes,
  revisoes: T.inicio.revisoes,
  consumo: T.inicio.consumo,
  mapa: T.inicio.mapa,
  conquistas: T.inicio.conquistas,
};

function BlocoTime() {
  const agentes = useAgentes();
  const nomes = useConfig((s) => s.agentes.nomes);
  const cargos = useConfig((s) => s.agentes.cargos);
  const irPara = useInterface((s) => s.irPara);
  const tarefas = useRotina((s) => s.tarefas);
  const estudos = useEstudos();
  const fin = useFinancas();
  const hoje = hojeISO();
  const abertas = tarefasDoDia(tarefas, hoje).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length;
  const revisoes = revisoesParaHoje(estudos);
  const prova = estudos.datas.filter((d) => !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
  const gasto = somar(gastosDoMes(fin, hoje.slice(0, 7)), (t) => parteDoUsuario(t, fin.divisoes));
  const falha = agentes.alertas.find((a) => a.agenteId === "operador");

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const comTarefas = funcaoLigada("journal", desligadas);
  const comEstudos = funcaoLigada("estudos", desligadas);
  const comFinancas = funcaoLigada("financas", desligadas);
  const falas = {
    organizador: comTarefas && abertas > 0 ? T.falas.organizador.bomDia(abertas) : T.falas.organizador.livre,
    tutor: !comEstudos ? T.falas.tutor.semFuncao : revisoes > 0 ? T.falas.tutor.revisoes(revisoes) : prova ? T.falas.tutor.prova(prova.titulo, descreverDistancia(prova.data)) : T.falas.tutor.livre,
    operador: falha ? falha.texto : !comFinancas ? T.falas.operador.semFuncao : gasto > 0 ? T.falas.operador.gasto(formatarDinheiro(gasto)) : T.falas.operador.livre,
    java: resumoPorAgente().java,
  };

  const nome = useConfig((s) => s.nome);
  const data = formatarData(agoraDoNiko(), "EEEE, d 'de' MMMM");
  return (
    <div className="inicio-hero">
      <div className="coluna" style={{ gap: 2 }}>
        <span className="rotulo-pequeno">{T.inicio.rotulo}</span>
        <h1 className="titulo-pagina">{T.inicio.titulo(saudacao(), nome || T.barraLateral.perfil)}</h1>
        <span className="texto-2" style={{ textTransform: "capitalize" }}>{data}</span>
      </div>
      <div className="inicio-time">
        {AGENTES.map((a) => {
          const estado = estadoDoAgente(agentes, a);
          return (
            <button key={a} type="button" className="inicio-agente" onClick={() => irPara("chat", { agente: a })}>
              <Personagem agente={a} tamanho={52} interativo={false} halo={false} />
              <div className="inicio-agente-texto">
                <b className="cortar">{nomes[a]}</b>
                <span className="inicio-agente-cargo">
                  <span className="texto-3">{cargos[a]}</span>
                  <span className="inicio-agente-estado cortar" style={{ ["--cor" as string]: COR_ESTADO[estado] }}>{T.agentes.estados[estado]}</span>
                </span>
                <span className="texto-2 privado inicio-fala">{falas[a]}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function BlocoHoje() {
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const datas = useEstudos((s) => s.datas);
  const abrirCaptura = useInterface((s) => s.abrirCaptura);
  const irPara = useInterface((s) => s.irPara);
  const hoje = hojeISO();
  const doDia = tarefasDoDia(tarefas, hoje).filter((t) => t.status !== "cancelada");
  const pendentes = habitos.filter((h) => !h.arquivado && !habitoCumprido(h, registros[hoje]?.[h.id]));
  const proximas = datas.filter((d) => !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 8);
  const fimSemana = paraISO(addDays(new Date(), 7));
  const proximosDias = tarefas
    .filter((t) => t.data && t.data > hoje && t.data <= fimSemana && t.status !== "concluida" && t.status !== "cancelada")
    .sort((a, b) => `${a.data}${a.hora ?? ""}`.localeCompare(`${b.data}${b.hora ?? ""}`))
    .slice(0, 8);

  if (doDia.length === 0 && pendentes.length === 0 && proximas.length === 0)
    return <Vazio titulo={T.inicio.nadaHoje} acao={<Botao variante="primario" icone={<Plus size={14} />} onClick={() => abrirCaptura(true)}>{T.inicio.novaTarefa}</Botao>} />;

  return (
    <div className="coluna" style={{ gap: 16 }}>
      <div>
        <div className="linha-entre" style={{ marginBottom: 4 }}>
          <span className="rotulo-secao">{T.inicio.tarefasHoje}</span>
          <Botao pequeno variante="fantasma" icone={<Plus size={13} />} onClick={() => abrirCaptura(true)}>{T.inicio.novaTarefa}</Botao>
        </div>
        {doDia.map((t) => <ItemTarefa key={t.id} tarefa={t} />)}
      </div>
      {pendentes.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.habitosPendentes}</span>
          <div className="pilulas">
            {pendentes.map((h) => (
              <button key={h.id} type="button" className="pilula" onClick={() => irPara("journal")}>{h.nome}</button>
            ))}
          </div>
        </div>
      )}
      {proximas.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.proximasDatas}</span>
          {proximas.map((d, i) => (
            <button key={d.id} type="button" className={`linha-entre lista-lateral-item ${extra(i, 3)}`} onClick={() => irPara("estudos", { materia: d.materiaId, aba: "datas" })}>
              <span className="cortar">{d.titulo}</span>
              <span className="etiqueta etiqueta-alerta">{descreverDistancia(d.data)}</span>
            </button>
          ))}
        </div>
      )}
      {proximosDias.length > 0 && (
        <div className="coluna secao-extra" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.proximosDias}</span>
          {proximosDias.map((t) => (
            <button key={t.id} type="button" className="linha-entre inicio-linha inicio-linha-botao item-extra" onClick={() => irPara("journal", { data: t.data ?? hoje })}>
              <span className="cortar">{t.titulo}</span>
              <span className="texto-3 numero" style={{ flex: "0 0 auto", fontSize: 12 }}>{[descreverDistancia(t.data!), t.hora].filter(Boolean).join(" . ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BlocoFoco() {
  const sessoes = usePomodoro((s) => s.sessoes);
  const materias = useEstudos((s) => s.materias);
  const comEstudos = useConfig((s) => funcaoLigada("estudos", s.funcoesDesligadas));
  const hoje = hojeISO();
  const doDia = sessoes.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && diaDoMomento(s.inicio) === hoje);
  const minutos = somar(doDia, (s) => s.minutos);
  const porMateria = new Map<string, number>();
  for (const s of doDia) porMateria.set(s.materiaId ?? "", (porMateria.get(s.materiaId ?? "") ?? 0) + s.minutos);
  const semana = Array.from({ length: 7 }, (_, i) => paraISO(addDays(new Date(), i - 6)));
  const minutosDia = new Map<string, number>();
  for (const s of sessoes) if (s.etapa === "foco" && s.situacao === "concluida") minutosDia.set(diaDoMomento(s.inicio), (minutosDia.get(diaDoMomento(s.inicio)) ?? 0) + s.minutos);

  return (
    <div className="coluna">
      <Cronometro />
      <div className="foco-numeros">
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-medio">{doDia.length}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.pomodorosHoje}</span>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-medio">{minutos}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.minutosFoco}</span>
        </div>
      </div>
      {comEstudos && porMateria.size > 0 && (
        <BarrasHorizontais
          formatar={(v) => `${v} min`}
          barras={[...porMateria].map(([id, v]) => ({ rotulo: materias.find((m) => m.id === id)?.nome ?? T.pomodoro.semMateria, valor: v }))}
        />
      )}
      <div className="coluna secao-extra" style={{ gap: 4 }}>
        <span className="rotulo-secao">{T.inicio.focoSemana}</span>
        <div className="item-extra">
          <BarrasVerticais altura={64} formatar={(v) => `${v} min`} barras={semana.map((d) => ({ rotulo: formatar(d, "EEEEE"), valor: minutosDia.get(d) ?? 0 }))} />
        </div>
      </div>
    </div>
  );
}

const ETAPAS: EtapaPomodoro[] = ["foco", "pausa_curta", "pausa_longa"];

function Cronometro() {
  const p = usePomodoro();
  const materias = useEstudos((s) => s.materias);
  const comEstudos = useConfig((s) => funcaoLigada("estudos", s.funcoesDesligadas));
  const ciclos = useConfig((s) => s.pomodoro.ciclos);
  const [agora, setAgora] = useState(() => Date.now());
  const iniciado = p.rodando || p.restanteMs != null;

  useEffect(() => {
    if (!p.rodando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [p.rodando]);

  const restante = restanteAtual(p, agora);
  const progresso = p.duracaoMs > 0 ? 1 - restante / p.duracaoMs : 0;
  const cor = p.etapa === "foco" ? "var(--destaque)" : "var(--sucesso)";

  return (
    <div className="foco-cronometro" data-rodando={p.rodando ? "sim" : "nao"}>
      <div className="foco-anel">
        <Anel progresso={iniciado ? progresso : 0} tamanho={132} espessura={8} cor={cor} />
        <div className="foco-anel-centro">
          <span className="foco-relogio">{formatarRelogio(restante)}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.pomodoro.etapas[p.etapa]}</span>
          {p.etapa === "foco" && <span className="texto-3" style={{ fontSize: 10 }}>{T.pomodoro.ciclo(p.ciclo, ciclos)}</span>}
        </div>
      </div>
      <div className="foco-lado">
        <div className="segmentado foco-etapas" role="tablist">
          {ETAPAS.map((e) => (
            <button key={e} type="button" role="tab" aria-selected={p.etapa === e} disabled={iniciado && p.etapa !== e} onClick={() => p.escolherEtapa(e)}>
              {T.pomodoro.etapasCurtas[e]}
            </button>
          ))}
        </div>
        {p.etapa === "foco" && comEstudos && (
          <select className="seletor" aria-label={T.pomodoro.materia} value={p.materiaId ?? ""} onChange={(e) => p.definirVinculo(e.target.value || undefined, p.tarefaId)}>
            <option value="">{T.pomodoro.semMateria}</option>
            {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        )}
        <div className="linha" style={{ gap: 6 }}>
          <Botao variante={p.rodando ? "secundario" : "primario"} icone={p.rodando ? <Pause size={14} /> : <Play size={14} />} onClick={p.alternar} style={{ flex: 1 }}>
            {p.rodando ? T.pomodoro.pausar : p.restanteMs != null ? T.pomodoro.continuar : T.pomodoro.iniciar}
          </Botao>
          {iniciado && <Botao soIcone icone={<RotateCcw size={14} />} aria-label={T.pomodoro.reiniciar} title={T.pomodoro.reiniciar} onClick={p.reiniciar} />}
          <Botao soIcone icone={<SkipForward size={14} />} aria-label={T.pomodoro.pular} title={T.pomodoro.pular} onClick={p.pular} />
        </div>
      </div>
    </div>
  );
}

function BlocoFinancas() {
  const fin = useFinancas();
  const irPara = useInterface((s) => s.irPara);
  const mes = hojeISO().slice(0, 7);
  const gastos = gastoPorCategoria(fin, mes);
  const entradas = somar(receitasDoMes(fin, mes), (t) => t.valor);
  const saidas = somar([...gastos.values()], (v) => v);
  const comOrcamento = fin.categorias
    .filter((c) => c.tipo === "despesa" && c.orcamento > 0)
    .map((c) => ({ c, gasto: gastos.get(c.id) ?? 0 }))
    .sort((x, y) => y.gasto / y.c.orcamento - x.gasto / x.c.orcamento)
    .slice(0, 8);
  const ultimas = [...fin.transacoes].filter((t) => t.data <= hojeISO()).sort((x, y) => y.data.localeCompare(x.data) || y.criadaEm.localeCompare(x.criadaEm)).slice(0, 14);
  const hojeDia = new Date().getDate();
  const proximas = fin.recorrentes.filter((r) => r.ativa).map((r) => ({ ...r, falta: (r.dia - hojeDia + 31) % 31 })).sort((x, y) => x.falta - y.falta).slice(0, 6);

  return (
    <div className="coluna" style={{ gap: 14 }}>
      <div className="linha" style={{ gap: 20, flexWrap: "wrap" }}>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-grande privado" style={{ color: entradas - saidas >= 0 ? "var(--sucesso)" : "var(--erro)" }}>{formatarDinheiro(entradas - saidas)}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.saldoMes}</span>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="privado numero">{formatarDinheiro(entradas)}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.financas.entradas}</span>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="privado numero">{formatarDinheiro(saidas)}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.financas.saidas}</span>
        </div>
      </div>
      {fin.contas.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.financas.abas.contas}</span>
          {fin.contas.filter((c) => !c.arquivada).slice(0, 8).map((c, i) => {
            const s = saldoDaConta(fin, c.id);
            return (
              <div key={c.id} className={`linha-entre inicio-linha ${extra(i, 4)}`}>
                <span className="linha"><span className="ponto-cor" style={{ background: c.cor }} />{c.nome}</span>
                <span className="numero privado" style={{ color: s < 0 ? "var(--erro)" : undefined }}>{formatarDinheiro(s)}</span>
              </div>
            );
          })}
        </div>
      )}
      {comOrcamento.length > 0 && (
        <div className="coluna" style={{ gap: 8 }}>
          <span className="rotulo-secao">{T.financas.abas.orcamento}</span>
          {comOrcamento.map(({ c, gasto }, i) => {
            const p = gasto / c.orcamento;
            return (
              <div key={c.id} className={`coluna ${extra(i, 3)}`} style={{ gap: 4 }}>
                <div className="linha-entre" style={{ fontSize: 12 }}>
                  <span>{c.nome}</span>
                  <span className="texto-2 numero privado">{formatarDinheiro(gasto)} / {formatarDinheiro(c.orcamento)}</span>
                </div>
                <Progresso valor={p} nivel={p >= 1 ? "erro" : p >= 0.8 ? "alerta" : "sucesso"} rotulo={c.nome} />
              </div>
            );
          })}
        </div>
      )}
      {ultimas.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.ultimosLancamentos}</span>
          {ultimas.map((x, i) => (
            <div key={x.id} className={`linha-entre inicio-linha ${extra(i, 4)}`}>
              <span className="cortar">{x.descricao}</span>
              <span className="numero privado" style={{ color: x.tipo === "receita" ? "var(--sucesso)" : undefined, flex: "0 0 auto" }}>{x.tipo === "receita" ? "+" : x.tipo === "despesa" ? "-" : ""}{formatarDinheiro(x.valor)}</span>
            </div>
          ))}
        </div>
      )}
      {proximas.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.proximasContas}</span>
          {proximas.map((r, i) => (
            <div key={r.id} className={`linha-entre inicio-linha ${extra(i, 2)}`}>
              <span>{r.descricao}</span>
              <span className="texto-2 numero privado">{formatarDinheiro(r.valor)} . {r.falta === 0 ? T.datas.hoje : T.datas.emDias(r.falta)}</span>
            </div>
          ))}
        </div>
      )}
      <Botao pequeno variante="fantasma" onClick={() => irPara("financas")} icone={<ChevronRight size={13} />}>{T.rotas.financas}</Botao>
    </div>
  );
}
function BlocoConexoes() {
  const conexoes = useComunicacao((s) => s.conexoes);
  const abrirJanela = useInterface((s) => s.abrirJanelaConexao);
  const irPara = useInterface((s) => s.irPara);
  const eventos = useComunicacao((s) => s.eventosConexao).slice(0, 8);
  const ativas = conexoes.filter((c) => c.ligada);
  if (ativas.length === 0) return <Vazio titulo={T.ilha.semConexoes} acao={<Botao onClick={() => irPara("conexoes")}>{T.rotas.conexoes}</Botao>} />;
  return (
    <div className="coluna" style={{ gap: 14 }}>
      <div className="lista">
        {ativas.map((c) => (
          <button key={c.id} type="button" className="lista-item" style={{ textAlign: "left" }} onClick={() => abrirJanela(c.id)}>
            <Marca marca={c.id} />
            <div className="lista-item-principal">
              <span className="lista-item-titulo">{T.conexoes.servicos[c.id].nome}</span>
              <span className="lista-item-sub privado">{c.resumo || T.conexoes.status[c.status]}</span>
            </div>
            <span className={`etiqueta ${c.status === "conectado" ? "etiqueta-sucesso" : c.status === "erro" ? "etiqueta-erro" : ""}`}>{T.conexoes.status[c.status]}</span>
          </button>
        ))}
      </div>
      {eventos.length > 0 && (
        <div className="coluna secao-extra" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.conexoes.eventos}</span>
          {eventos.map((e) => (
            <div key={e.id} className="linha inicio-linha item-extra" style={{ gap: 8 }}>
              <span className="ponto-cor" style={{ background: e.tipo === "falha" ? "var(--erro)" : e.tipo === "sucesso" ? "var(--sucesso)" : "var(--texto-3)" }} />
              <span className="cortar privado" style={{ flex: 1 }}>{e.texto}</span>
              <span className="texto-3" style={{ fontSize: 11, flex: "0 0 auto" }}>{horarioRelativo(e.data)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlocoRevisoes() {
  const estudos = useEstudos();
  const sessoes = usePomodoro((s) => s.sessoes);
  const irPara = useInterface((s) => s.irPara);
  const n = revisoesParaHoje(estudos);
  const vencidos = cartoesVencidos(estudos.cartoes);
  const porMateria = estudos.materias.map((m) => ({ m, q: vencidos.filter((c) => c.materiaId === m.id).length })).filter((x) => x.q > 0).sort((a, b) => b.q - a.q).slice(0, 10);
  const hoje = hojeISO();
  const conteudo = estudos.revisoesConteudo.filter((r) => !r.feita && r.data <= hoje).length;
  const prova = estudos.datas.filter((d) => !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
  const ultimos = Array.from({ length: 7 }, (_, i) => paraISO(addDays(new Date(), i - 6)));
  const minutos = minutosEstudoPorDia(sessoes);
  const sequencia = sequenciaDias(new Set([...minutos.keys(), ...estudos.registroRevisoes.filter((r) => r.quantidade > 0).map((r) => r.data)]));

  return (
    <div className="coluna" style={{ gap: 14 }}>
      <div className="linha" style={{ gap: 20 }}>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-grande">{n}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.revisoesHoje}</span>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-grande">{sequencia}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.diasSeguidos}</span>
        </div>
      </div>
      {porMateria.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.porMateria}</span>
          {porMateria.map(({ m, q }, i) => (
            <button key={m.id} type="button" className={`linha-entre inicio-linha inicio-linha-botao ${extra(i, 4)}`} onClick={() => irPara("estudos", { materia: m.id, aba: "revisoes" })}>
              <span className="cortar">{m.nome}</span>
              <span className="etiqueta">{q}</span>
            </button>
          ))}
        </div>
      )}
      {conteudo > 0 && <span className="texto-2" style={{ fontSize: 12 }}>{T.inicio.conteudoPendente(conteudo)}</span>}
      {prova && (
        <div className="linha-entre inicio-linha">
          <span className="cortar">{prova.titulo}</span>
          <span className="etiqueta etiqueta-alerta">{descreverDistancia(prova.data)}</span>
        </div>
      )}
      <div className="coluna" style={{ gap: 4 }}>
        <span className="rotulo-secao">{T.inicio.ultimos7}</span>
        <BarrasVerticais altura={64} formatar={(v) => `${v}`} barras={ultimos.map((d) => ({ rotulo: formatar(d, "EEEEE"), valor: (estudos.registroRevisoes.find((r) => r.data === d)?.quantidade ?? 0) + Math.round((minutos.get(d) ?? 0) / 25), detalhe: `${estudos.registroRevisoes.find((r) => r.data === d)?.quantidade ?? 0} cartões, ${minutos.get(d) ?? 0} min` }))} />
      </div>
      <Botao variante={n > 0 ? "primario" : "secundario"} disabled={n === 0} onClick={() => irPara("estudos", { aba: "revisoes", sessao: "1" })}>{T.inicio.revisar}</Botao>
    </div>
  );
}
function LimitesDosPlanos() {
  const [dados, setDados] = useState<Consumo | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    const ler = () => {
      if (document.hidden) return;
      lerConsumo()
        .then((d) => vivo && (setDados(d), setFalhou(false)))
        .catch(() => vivo && setFalhou(true));
    };
    ler();
    const t = window.setInterval(ler, 5 * 60000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, []);

  if (falhou && !dados) return <span className="texto-3" style={{ fontSize: 12 }}>{T.consumo.ponteFora}</span>;
  if (!dados) return <span className="texto-3" style={{ fontSize: 12 }}>{T.geral.carregando}</span>;
  const ferramentas = dados.ferramentas.filter((f) => f.situacao === "ok" && f.janelas.length > 0);

  return (
    <div className="inicio-planos">
      {dados.sessao && <span className="texto-2 cortar" style={{ fontSize: 12 }}>{T.inicio.sessaoAgora(dados.sessao.projeto, dados.sessao.mensagens)}</span>}
      {ferramentas.map((f) => (
        <div key={f.id} className="inicio-plano">
          <div className="linha-entre">
            <span className="linha" style={{ gap: 6 }}>{f.id === "claude" ? <Marca marca="anthropic" tamanho={14} /> : <Cpu size={14} />}<b>{f.nome}</b></span>
            {f.plano && <span className="etiqueta">{f.plano}</span>}
          </div>
          {f.janelas.slice(0, 2).map((j) => (
            <div key={j.id} className="inicio-plano-janela">
              <div className="linha-entre" style={{ fontSize: 12 }}>
                <span className="cortar">{rotuloJanela(j.rotulo)}</span>
                <span className="numero" style={{ fontWeight: 600 }}>{Math.round(j.usado)}%</span>
              </div>
              <Progresso valor={j.usado / 100} nivel={nivelDoUso(j.usado)} rotulo={rotuloJanela(j.rotulo)} />
              <span className="texto-3" style={{ fontSize: 11 }}>{faltaPara(j.reiniciaEm)}</span>
            </div>
          ))}
        </div>
      ))}
      {ferramentas.length === 0 && <span className="texto-3" style={{ fontSize: 12 }}>{T.consumo.semJanelas}</span>}
    </div>
  );
}

function BlocoConsumo() {
  const uso = useComunicacao((s) => s.usoIa);
  const consumo = useConfig((s) => s.consumo);
  const nomes = useConfig((s) => s.agentes.nomes);
  const irPara = useInterface((s) => s.irPara);
  const mes = hojeISO().slice(0, 7);
  const doMes = uso.filter((u) => u.data.startsWith(mes));
  const tokens = somar(doMes, (u) => u.entrada + u.saida);
  const temPreco = consumo.precoEntrada + consumo.precoSaida > 0;
  const custo = somar(doMes, (u) => (u.entrada * consumo.precoEntrada + u.saida * consumo.precoSaida) / 1e6);
  const porModeloMapa = new Map<string, number>();
  for (const u of doMes) porModeloMapa.set(u.modelo, (porModeloMapa.get(u.modelo) ?? 0) + u.entrada + u.saida);
  const porModelo = [...porModeloMapa].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const porAgente = AGENTES.map((a) => ({ rotulo: nomes[a], valor: somar(doMes.filter((u) => u.agenteId === a), (u) => u.entrada + u.saida) })).filter((b) => b.valor > 0);

  return (
    <div className="coluna" style={{ gap: 14 }}>
      {consumo.lerPlanos ? (
        <div className="coluna" style={{ gap: 6 }}>
          <span className="rotulo-secao">{T.inicio.limitesPlanos}</span>
          <LimitesDosPlanos />
        </div>
      ) : (
        <div className="inicio-plano">
          <span className="texto-2" style={{ fontSize: 12 }}>{T.inicio.limitesDesligados}</span>
          <Botao pequeno onClick={() => irPara("consumo")}>{T.consumo.ligarParte2}</Botao>
        </div>
      )}
      {doMes.length > 0 ? (
        <>
          <div className="linha" style={{ gap: 20, flexWrap: "wrap" }}>
            <div className="coluna" style={{ gap: 0 }}>
              <span className="numero-grande">{numeroCurto.format(tokens)}</span>
              <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.tokensMes}</span>
            </div>
            {temPreco && (
              <div className="coluna" style={{ gap: 0 }}>
                <span className="numero-grande">{dolar.format(custo)}</span>
                <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.custoMes}</span>
              </div>
            )}
          </div>
          {porAgente.length > 0 && (
            <div className="coluna" style={{ gap: 6 }}>
              <span className="rotulo-secao">{T.inicio.porAgente}</span>
              <BarrasHorizontais formatar={(v) => numeroCurto.format(v)} barras={porAgente} />
            </div>
          )}
          {porModelo.length > 0 && (
            <div className="coluna secao-extra" style={{ gap: 4 }}>
              <span className="rotulo-secao">{T.inicio.porModelo}</span>
              {porModelo.map(([m, v]) => (
                <div key={m} className="linha-entre inicio-linha item-extra">
                  <span className="cortar">{m}</span>
                  <span className="numero texto-2" style={{ flex: "0 0 auto" }}>{numeroCurto.format(v)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className="texto-3" style={{ fontSize: 12 }}>{T.inicio.semUsoInicio}</span>
      )}
      <Botao pequeno variante="fantasma" icone={<ChevronRight size={13} />} onClick={() => irPara("consumo")}>{T.rotas.consumo}</Botao>
    </div>
  );
}

function BlocoConquistas() {
  const todasAlcancadas = useConquistas((s) => s.alcancadas);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const alcancadas = todasAlcancadas.filter((a) => conquistaLigada(a.codigo, desligadas));
  const irPara = useInterface((s) => s.irPara);
  const recentes = [...alcancadas].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
  const proximas = CONQUISTAS.filter((c) => conquistaLigada(c.codigo, desligadas) && !alcancadas.some((a) => a.codigo === c.codigo)).slice(0, 10);
  return (
    <div className="coluna" style={{ gap: 8 }}>
      {recentes.map((a, i) => (
        <div key={`${a.codigo}-${a.nivel}`} className={`linha ${extra(i, 3)}`}>
          <Trophy size={14} color="var(--alerta)" />
          <span className="cortar">{T.conquistas.itens[a.codigo]?.nome}</span>
          <span className="etiqueta empurrar">{T.conquistas.nivel(a.nivel)}</span>
        </div>
      ))}
      {proximas.length > 0 && <span className="rotulo-secao" style={{ marginTop: 6 }}>{T.inicio.proximasConquistas}</span>}
      <div className="conquistas-grade">
        {proximas.map((c, i) => (
          <div key={c.codigo} className={`linha texto-3 conquista-proxima ${extra(i, 6)}`} title={T.conquistas.itens[c.codigo]?.regra}>
            <Trophy size={14} style={{ flex: "0 0 auto" }} />
            <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
              <span className="cortar" style={{ color: "var(--texto-2)" }}>{T.conquistas.itens[c.codigo]?.nome}</span>
              <span className="cortar" style={{ fontSize: 11 }}>{T.conquistas.itens[c.codigo]?.regra}</span>
            </span>
          </div>
        ))}
      </div>
      <Botao pequeno variante="fantasma" icone={<ChevronRight size={13} />} onClick={() => irPara("conquistas")}>{T.rotas.conquistas}</Botao>
    </div>
  );
}

const COMPONENTE: Record<BlocoInicio, () => React.JSX.Element> = {
  time: BlocoTime,
  hoje: BlocoHoje,
  foco: BlocoFoco,
  financas: BlocoFinancas,
  conexoes: BlocoConexoes,
  revisoes: BlocoRevisoes,
  consumo: BlocoConsumo,
  mapa: () => <MapaDeCalor />,
  conquistas: BlocoConquistas,
};

function LinhaOrdenavel({ id, visivel, aoMudar }: { id: BlocoInicio; visivel: boolean; aoMudar: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} className="lista-item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, background: "var(--superficie)" }}>
      <button type="button" className="botao botao-fantasma botao-pequeno botao-icone" aria-label={TITULO[id]} {...attributes} {...listeners} style={{ cursor: "grab" }}>
        <GripVertical size={14} />
      </button>
      {ICONES[id]}
      <span className="lista-item-principal">{TITULO[id]}</span>
      <Alternador ligado={visivel} aoMudar={aoMudar} rotulo={TITULO[id]} />
    </div>
  );
}

export default function Inicio() {
  const todosOsBlocos = useConfig((s) => s.blocosInicio);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const blocos = useMemo(() => todosOsBlocos.filter((b) => blocoLigado(b.id, desligadas)), [todosOsBlocos, desligadas]);
  const definir = useConfig((s) => s.definir);
  const [personalizando, setPersonalizando] = useState(false);
  const [escolhendoFuncoes, setEscolhendoFuncoes] = useState(false);
  const grade = useRef<HTMLDivElement>(null);
  useMosaico(grade, blocos.filter((b) => b.visivel).map((b) => b.id).join());

  const aoArrastar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const de = todosOsBlocos.findIndex((b) => b.id === e.active.id);
    const para = todosOsBlocos.findIndex((b) => b.id === e.over?.id);
    definir({ blocosInicio: arrayMove(todosOsBlocos, de, para) });
  };

  return (
    <>
      <div className="bento" ref={grade}>
        {blocos
          .filter((b) => b.visivel)
          .map((b) => {
            const Componente = COMPONENTE[b.id];
            return (
              <Cartao key={b.id} titulo={b.id === "time" ? undefined : TITULO[b.id]} icone={ICONES[b.id]} className={`${LARGURA[b.id]} bento-cartao`} acoes={
                  b.id === "time" ? (
                    <div className="linha" style={{ gap: 4 }}>
                      <Botao pequeno variante="fantasma" icone={<ToggleRight size={13} />} onClick={() => setEscolhendoFuncoes(true)}>{T.funcoes.botao}</Botao>
                      <Botao pequeno variante="fantasma" icone={<SlidersHorizontal size={13} />} onClick={() => setPersonalizando(true)}>{T.inicio.personalizar}</Botao>
                    </div>
                  ) : undefined
                }>
                <Componente />
              </Cartao>
            );
          })}
      </div>
      <Modal aberto={personalizando} titulo={T.inicio.personalizarTitulo} aoFechar={() => setPersonalizando(false)}>
        <p className="campo-dica" style={{ marginBottom: 12 }}>{T.inicio.personalizarDica}</p>
        <DndContext collisionDetection={closestCenter} onDragEnd={aoArrastar}>
          <SortableContext items={blocos.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="lista">
              {blocos.map((b) => (
                <LinhaOrdenavel key={b.id} id={b.id} visivel={b.visivel} aoMudar={(v) => definir({ blocosInicio: todosOsBlocos.map((x) => (x.id === b.id ? { ...x, visivel: v } : x)) })} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </Modal>
      <PainelFuncoes aberto={escolhendoFuncoes} aoFechar={() => setEscolhendoFuncoes(false)} />
    </>
  );
}
