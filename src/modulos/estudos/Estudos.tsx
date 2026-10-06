import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  Plus, FileText, Kanban, CalendarClock, Layers, Link2, BarChart3, Trash2, CheckCircle2, GraduationCap, ExternalLink, Pencil, BookCheck, Flag, ListChecks, LayoutDashboard, ChevronDown, Timer, FolderOpen, Ellipsis, Search,
} from "lucide-react";
import { addDays } from "date-fns";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Campo, Modal, Vazio, ConfirmarModal, CaixaMarcar, Pilulas, AvisoFaixa } from "../../componentes/basicos";
import { Editor } from "../../componentes/Editor";
import { BarrasHorizontais, BarrasVerticais } from "../../componentes/Graficos";
import { useEstudos, cartoesVencidos } from "../../estado/estudos";
import { useRotina } from "../../estado/rotina";
import { usePomodoro } from "../../estado/pomodoro";
import { useInterface } from "../../estado/interface";
import { useAgentes } from "../../estado/agentes";
import { T } from "../../textos/textos";
import { dataValida, descreverDistancia, formatar, hojeISO, paraISO } from "../../utilitarios/datas";
import { gerarId, urlSegura } from "../../utilitarios/basicos";
import { minutosEstudoPorDia, sequenciaDias } from "../../utilitarios/estatisticas";
import { tocarSom } from "../../ponte/sons";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import { excluirArquivosDaMateria } from "../../ponte/arquivos";
import { Arquivos } from "./Arquivos";
import type { EstadoLink, Materia, Prioridade, Tarefa, TipoArea, TipoDataImportante } from "../../tipos";

type Aba = keyof typeof T.estudos.abas;

const ICONES_ABA: Record<Aba, React.ReactNode> = {
  anotacoes: <FileText size={14} />,
  quadro: <Kanban size={14} />,
  datas: <CalendarClock size={14} />,
  revisoes: <Layers size={14} />,
  links: <Link2 size={14} />,
  arquivos: <FolderOpen size={14} />,
  estatisticas: <BarChart3 size={14} />,
};

function NovaArea({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const criarArea = useEstudos((s) => s.criarArea);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoArea>("faculdade");
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (aberto) {
      setNome("");
      setErro("");
    }
  }, [aberto]);
  return (
    <Modal aberto={aberto} titulo={T.estudos.novaArea} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!nome.trim()) return setErro(T.validacao.obrigatorio);
          criarArea(nome, tipo);
          aoFechar();
        }}
      >
        <Campo id="a-nome" rotulo={T.estudos.nomeArea} obrigatorio erro={erro}>
          <input id="a-nome" className="campo" value={nome} maxLength={60} aria-invalid={!!erro} onChange={(e) => { setNome(e.target.value); setErro(""); }} />
        </Campo>
        <Campo id="a-tipo" rotulo={T.estudos.tipoArea} dica={T.estudos.colunasDica}>
          <select id="a-tipo" className="seletor" value={tipo} onChange={(e) => setTipo(e.target.value as TipoArea)}>
            {(Object.keys(T.estudos.tipos) as TipoArea[]).map((t) => <option key={t} value={t}>{T.estudos.tipos[t]}</option>)}
          </select>
        </Campo>
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function NovaMateria({ areaId, aberto, aoFechar, aoCriar }: { areaId?: string; aberto: boolean; aoFechar: () => void; aoCriar: (m: Materia) => void }) {
  const areas = useEstudos((s) => s.areas);
  const criar = useEstudos((s) => s.criarMateria);
  const [nome, setNome] = useState("");
  const [area, setArea] = useState(areaId ?? "");
  const [semestre, setSemestre] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (aberto) {
      setNome("");
      setSemestre("");
      setArea(areaId ?? areas[0]?.id ?? "");
      setErros({});
    }
  }, [aberto, areaId, areas]);
  const tipo = areas.find((a) => a.id === area)?.tipo;
  return (
    <Modal aberto={aberto} titulo={T.estudos.novaMateria} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
          if (!area) novos.area = T.validacao.obrigatorio;
          setErros(novos);
          if (Object.keys(novos).length) return;
          aoCriar(criar(area, nome, semestre.trim() || undefined));
          aoFechar();
        }}
      >
        <Campo id="m-nome" rotulo={T.estudos.nomeMateria} obrigatorio erro={erros.nome}>
          <input id="m-nome" className="campo" value={nome} maxLength={80} aria-invalid={!!erros.nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo id="m-area" rotulo={T.estudos.areas} obrigatorio erro={erros.area}>
          <select id="m-area" className="seletor" value={area} onChange={(e) => setArea(e.target.value)}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </Campo>
        {tipo === "faculdade" && (
          <Campo id="m-sem" rotulo={T.estudos.semestre}>
            <input id="m-sem" className="campo" value={semestre} maxLength={12} placeholder="2026.2" onChange={(e) => setSemestre(e.target.value)} />
          </Campo>
        )}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function Anotacoes({ materia, paginaInicial }: { materia: Materia; paginaInicial?: string }) {
  const paginas = useEstudos((s) => s.paginas).filter((p) => p.materiaId === materia.id);
  const criar = useEstudos((s) => s.criarPagina);
  const atualizar = useEstudos((s) => s.atualizarPagina);
  const excluir = useEstudos((s) => s.excluirPagina);
  const marcarEstudada = useEstudos((s) => s.marcarEstudada);
  const [atual, setAtual] = useState<string | undefined>(paginaInicial ?? paginas[0]?.id);
  const [confirmar, setConfirmar] = useState(false);
  const pagina = paginas.find((p) => p.id === atual) ?? paginas[0];

  useEffect(() => {
    if (paginaInicial) setAtual(paginaInicial);
  }, [paginaInicial]);

  const arvore = (paiId: string | undefined, nivel: number): React.ReactNode =>
    paginas
      .filter((p) => p.paiId === paiId)
      .map((p) => (
        <div key={p.id}>
          <button type="button" className="lista-lateral-item" aria-current={pagina?.id === p.id} style={{ paddingLeft: 8 + nivel * 14 }} onClick={() => setAtual(p.id)}>
            <FileText size={13} />
            <span className="cortar">{p.titulo || T.estudos.semTitulo}</span>
            {p.estudadaEm && <BookCheck size={12} className="empurrar" color="var(--sucesso)" />}
          </button>
          {arvore(p.id, nivel + 1)}
        </div>
      ));

  return (
    <div className="duas-colunas" style={{ gridTemplateColumns: "220px minmax(0, 1fr)" }}>
      <div className="coluna" style={{ gap: 8 }}>
        <Botao pequeno icone={<Plus size={13} />} onClick={() => setAtual(criar(materia.id).id)}>{T.estudos.novaPagina}</Botao>
        <div className="lista-lateral">{arvore(undefined, 0)}</div>
      </div>
      {!pagina ? (
        <Vazio icone={<FileText size={28} />} titulo={T.estudos.semPaginas} acao={<Botao variante="primario" onClick={() => setAtual(criar(materia.id).id)}>{T.estudos.novaPagina}</Botao>} />
      ) : (
        <div className="coluna">
          <div className="linha" style={{ flexWrap: "wrap" }}>
            <input
              key={pagina.id}
              className="campo campo-titulo"
              defaultValue={pagina.titulo}
              maxLength={120}
              placeholder={T.estudos.semTitulo}
              aria-label={T.estudos.tituloPagina}
              onBlur={(e) => e.target.value !== pagina.titulo && atualizar(pagina.id, { titulo: e.target.value.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <Botao pequeno icone={<Plus size={13} />} onClick={() => setAtual(criar(materia.id, pagina.id).id)}>{T.estudos.subpagina}</Botao>
            <Botao
              pequeno
              variante={pagina.estudadaEm ? "secundario" : "primario"}
              icone={<BookCheck size={13} />}
              onClick={() => {
                marcarEstudada(pagina.id);
                void tocarSom("proud", "personagens");
                void useAgentes.getState().trabalhar("tutor", T.estudos.revisoesAgendadas, 400);
              }}
            >
              {T.estudos.marcarEstudada}
            </Botao>
            <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={14} />} aria-label={T.geral.excluir} onClick={() => setConfirmar(true)} />
          </div>
          {pagina.estudadaEm && <span className="campo-dica">{T.estudos.estudadaEm(formatar(pagina.estudadaEm, "d/MM"))}</span>}
          <Editor chave={pagina.id} conteudo={pagina.conteudo} aoMudar={(html) => atualizar(pagina.id, { conteudo: html })} placeholder={T.estudos.paginaVazia} />
          <ConfirmarModal
            aberto={confirmar}
            titulo={T.geral.confirmarExclusao}
            texto={T.estudos.excluirPagina}
            aoFechar={() => setConfirmar(false)}
            aoConfirmar={() => {
              excluir(pagina.id);
              setAtual(undefined);
            }}
          />
        </div>
      )}
    </div>
  );
}

function CartaoKanban({ tarefa, aoAbrir }: { tarefa: Tarefa; aoAbrir: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: tarefa.id });
  const feitos = tarefa.checklist.filter((c) => c.feito).length;
  return (
    <div
      ref={setNodeRef}
      className="kanban-cartao"
      style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.7 : 1, zIndex: isDragging ? 10 : undefined }}
      {...attributes}
      {...listeners}
      onClick={aoAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter") aoAbrir();
        listeners?.onKeyDown?.(e);
      }}
    >
      <span className={tarefa.status === "concluida" ? "riscado" : ""}>{tarefa.titulo}</span>
      <div className="linha" style={{ flexWrap: "wrap", gap: 6 }}>
        {tarefa.prioridade === "alta" && <span className="etiqueta etiqueta-erro"><Flag size={10} />{T.prioridade.alta}</span>}
        {tarefa.data && <span className="etiqueta"><CalendarClock size={10} />{descreverDistancia(tarefa.data)}</span>}
        {tarefa.checklist.length > 0 && <span className="etiqueta"><ListChecks size={10} />{feitos}/{tarefa.checklist.length}</span>}
        {tarefa.estimativaPomodoros ? <span className="etiqueta">{tarefa.estimativaPomodoros} x 25 min</span> : null}
      </div>
    </div>
  );
}

function ColunaKanban({ id, nome, conclui, quantidade, children, aoNovo, aoRenomear, aoExcluir }: { id: string; nome: string; conclui: boolean; quantidade: number; children: React.ReactNode; aoNovo: () => void; aoRenomear: () => void; aoExcluir?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="kanban-coluna" data-sobre={isOver ? "sim" : "nao"}>
      <div className="linha-entre kanban-coluna-topo">
        <span className="linha" style={{ fontWeight: 500 }}>
          {conclui && <CheckCircle2 size={13} color="var(--sucesso)" />}
          {nome}
          <span className="texto-3 numero">{quantidade}</span>
        </span>
        <span className="linha" style={{ gap: 0 }}>
          <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={12} />} aria-label={T.geral.editar} onClick={aoRenomear} />
          {aoExcluir && <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={aoExcluir} />}
          <Botao pequeno soIcone variante="fantasma" icone={<Plus size={13} />} aria-label={T.estudos.novoCartao} onClick={aoNovo} />
        </span>
      </div>
      <div className="kanban-lista">{children}</div>
    </div>
  );
}

function EditarCartao({ tarefa, materia, aoFechar }: { tarefa: Tarefa | null; materia: Materia; aoFechar: () => void }) {
  const atualizar = useRotina((s) => s.atualizarTarefa);
  const excluir = useRotina((s) => s.excluirTarefa);
  const restaurar = useRotina((s) => s.restaurarTarefa);
  const avisar = useInterface((s) => s.avisar);
  const [dados, setDados] = useState<Tarefa | null>(tarefa);
  const [novoItem, setNovoItem] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    setDados(tarefa);
    setErros({});
    setNovoItem("");
  }, [tarefa]);
  if (!dados) return <Modal aberto={false} titulo="" aoFechar={aoFechar}>{null}</Modal>;

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (!dados.titulo.trim()) novos.titulo = T.validacao.obrigatorio;
    if (dados.data && !dataValida(dados.data)) novos.data = T.validacao.dataInvalida;
    if (dados.estimativaPomodoros != null && (dados.estimativaPomodoros < 0 || dados.estimativaPomodoros > 40)) novos.estimativa = T.validacao.entre(0, 40);
    setErros(novos);
    if (Object.keys(novos).length) return;
    const coluna = materia.colunas.find((c) => c.id === dados.colunaId);
    atualizar(dados.id, { ...dados, titulo: dados.titulo.trim(), status: coluna?.conclui ? "concluida" : dados.status === "concluida" ? "a_fazer" : dados.status });
    aoFechar();
  };

  return (
    <Modal aberto={!!tarefa} titulo={T.estudos.cartao} aoFechar={aoFechar} largo>
      <form className="formulario" onSubmit={salvar} noValidate>
        <Campo id="k-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={erros.titulo}>
          <input id="k-titulo" className="campo" value={dados.titulo} maxLength={200} aria-invalid={!!erros.titulo} onChange={(e) => setDados({ ...dados, titulo: e.target.value })} />
        </Campo>
        <Campo id="k-desc" rotulo={T.financas.descricao}>
          <textarea id="k-desc" className="area-texto" value={dados.descricao} maxLength={2000} onChange={(e) => setDados({ ...dados, descricao: e.target.value })} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="k-coluna" rotulo={T.estudos.coluna}>
            <select id="k-coluna" className="seletor" value={dados.colunaId ?? materia.colunas[0]?.id} onChange={(e) => setDados({ ...dados, colunaId: e.target.value })}>
              {materia.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo id="k-prazo" rotulo={T.estudos.prazo} erro={erros.data} dica={T.estudos.prazoDica}>
            <input id="k-prazo" type="date" className="campo" value={dados.data ?? ""} aria-invalid={!!erros.data} onChange={(e) => setDados({ ...dados, data: e.target.value || undefined })} />
          </Campo>
          <Campo id="k-prioridade" rotulo={T.estudos.prioridade}>
            <select id="k-prioridade" className="seletor" value={dados.prioridade} onChange={(e) => setDados({ ...dados, prioridade: e.target.value as Prioridade })}>
              {(Object.keys(T.prioridade) as Prioridade[]).map((p) => <option key={p} value={p}>{T.prioridade[p]}</option>)}
            </select>
          </Campo>
          <Campo id="k-est" rotulo={T.estudos.estimativa} erro={erros.estimativa}>
            <input id="k-est" className="campo" inputMode="numeric" value={dados.estimativaPomodoros ?? ""} aria-invalid={!!erros.estimativa} onChange={(e) => setDados({ ...dados, estimativaPomodoros: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : undefined })} />
          </Campo>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.estudos.checklist}</span>
          {dados.checklist.map((item) => (
            <div key={item.id} className="linha">
              <CaixaMarcar marcada={item.feito} rotulo={item.texto} aoMudar={(v) => setDados({ ...dados, checklist: dados.checklist.map((c) => (c.id === item.id ? { ...c, feito: v } : c)) })} />
              <span className={`cortar ${item.feito ? "riscado" : ""}`} style={{ flex: 1 }}>{item.texto}</span>
              <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={() => setDados({ ...dados, checklist: dados.checklist.filter((c) => c.id !== item.id) })} />
            </div>
          ))}
          <div className="linha">
            <input
              className="campo"
              value={novoItem}
              maxLength={120}
              placeholder={T.estudos.novoItem}
              aria-label={T.estudos.novoItem}
              onChange={(e) => setNovoItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!novoItem.trim()) return;
                  setDados({ ...dados, checklist: [...dados.checklist, { id: gerarId(), texto: novoItem.trim(), feito: false }] });
                  setNovoItem("");
                }
              }}
            />
          </div>
        </div>
        <div className="formulario-acoes" style={{ justifyContent: "space-between" }}>
          <Botao
            variante="perigo"
            icone={<Trash2 size={14} />}
            onClick={() => {
              const r = excluir(dados.id);
              if (r) avisar(T.geral.excluido, () => restaurar(r));
              aoFechar();
            }}
          >
            {T.geral.excluir}
          </Botao>
          <span className="linha">
            <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function Quadro({ materia }: { materia: Materia }) {
  const tarefas = useRotina((s) => s.tarefas).filter((t) => t.materiaId === materia.id);
  const criar = useRotina((s) => s.criarTarefa);
  const atualizarTarefa = useRotina((s) => s.atualizarTarefa);
  const atualizarMateria = useEstudos((s) => s.atualizarMateria);
  const [aberta, setAberta] = useState<Tarefa | null>(null);
  const [renomear, setRenomear] = useState<{ id: string | null; nome: string; conclui: boolean } | null>(null);
  const [erroColuna, setErroColuna] = useState("");
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const primeira = materia.colunas[0]?.id;

  const aoSoltar = (e: DragEndEvent) => {
    if (!e.over) return;
    const coluna = materia.colunas.find((c) => c.id === e.over?.id);
    const tarefa = tarefas.find((t) => t.id === e.active.id);
    if (!coluna || !tarefa || (tarefa.colunaId ?? primeira) === coluna.id) return;
    atualizarTarefa(tarefa.id, {
      colunaId: coluna.id,
      status: coluna.conclui ? "concluida" : tarefa.status === "concluida" ? "a_fazer" : tarefa.status,
      concluidaEm: coluna.conclui ? new Date().toISOString() : undefined,
    });
    void tocarSom(coluna.conclui ? "finish" : "blip", coluna.conclui ? "personagens" : "interface");
  };

  const salvarColuna = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renomear) return;
    const nome = renomear.nome.trim();
    if (!nome) return setErroColuna(T.validacao.obrigatorio);
    const colunas = renomear.id
      ? materia.colunas.map((c) => (c.id === renomear.id ? { ...c, nome, conclui: renomear.conclui } : c))
      : [...materia.colunas, { id: gerarId(), nome, conclui: renomear.conclui }];
    atualizarMateria(materia.id, { colunas });
    setRenomear(null);
  };

  return (
    <>
      <div className="linha-entre">
        <span className="campo-dica">{T.estudos.quadroDica}</span>
        <Botao pequeno icone={<Plus size={13} />} onClick={() => { setErroColuna(""); setRenomear({ id: null, nome: "", conclui: false }); }}>{T.estudos.novaColuna}</Botao>
      </div>
      <DndContext sensors={sensores} onDragEnd={aoSoltar}>
        <div className="kanban">
          {materia.colunas.map((c) => {
            const daColuna = tarefas.filter((t) => (t.colunaId ?? primeira) === c.id).sort((a, b) => a.ordem - b.ordem);
            return (
              <ColunaKanban
                key={c.id}
                id={c.id}
                nome={c.nome}
                conclui={c.conclui}
                quantidade={daColuna.length}
                aoNovo={() => setAberta(criar({ titulo: T.estudos.novoCartao, materiaId: materia.id, colunaId: c.id, status: c.conclui ? "concluida" : "a_fazer" }))}
                aoRenomear={() => { setErroColuna(""); setRenomear({ id: c.id, nome: c.nome, conclui: c.conclui }); }}
                aoExcluir={
                  materia.colunas.length > 1
                    ? () => {
                        const destino = materia.colunas.find((x) => x.id !== c.id)!.id;
                        daColuna.forEach((t) => atualizarTarefa(t.id, { colunaId: destino }));
                        atualizarMateria(materia.id, { colunas: materia.colunas.filter((x) => x.id !== c.id) });
                      }
                    : undefined
                }
              >
                {daColuna.map((t) => <CartaoKanban key={t.id} tarefa={t} aoAbrir={() => setAberta(t)} />)}
              </ColunaKanban>
            );
          })}
        </div>
      </DndContext>
      <EditarCartao tarefa={aberta} materia={materia} aoFechar={() => setAberta(null)} />
      <Modal aberto={!!renomear} titulo={renomear?.id ? T.geral.editar : T.estudos.novaColuna} aoFechar={() => setRenomear(null)}>
        {renomear && (
          <form className="formulario" onSubmit={salvarColuna} noValidate>
            <Campo id="c-nome" rotulo={T.estudos.nomeColuna} obrigatorio erro={erroColuna}>
              <input id="c-nome" className="campo" value={renomear.nome} maxLength={40} onChange={(e) => { setRenomear({ ...renomear, nome: e.target.value }); setErroColuna(""); }} />
            </Campo>
            <label className="linha">
              <CaixaMarcar marcada={renomear.conclui} rotulo={T.estudos.colunaConclui} aoMudar={(v) => setRenomear({ ...renomear, conclui: v })} />
              <span>{T.estudos.colunaConclui}</span>
            </label>
            <div className="formulario-acoes">
              <Botao onClick={() => setRenomear(null)}>{T.geral.cancelar}</Botao>
              <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function Datas({ materia }: { materia: Materia }) {
  const datas = useEstudos((s) => s.datas).filter((d) => d.materiaId === materia.id).sort((a, b) => a.data.localeCompare(b.data));
  const criar = useEstudos((s) => s.criarData);
  const atualizar = useEstudos((s) => s.atualizarData);
  const excluir = useEstudos((s) => s.excluirData);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoDataImportante>("prova");
  const [data, setData] = useState(paraISO(addDays(new Date(), 7)));
  const [erros, setErros] = useState<Record<string, string>>({});

  return (
    <div className="coluna">
      <form
        className="formulario-linha"
        style={{ alignItems: "end" }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!titulo.trim()) novos.titulo = T.validacao.obrigatorio;
          if (!dataValida(data)) novos.data = T.validacao.dataInvalida;
          setErros(novos);
          if (Object.keys(novos).length) return;
          criar({ materiaId: materia.id, titulo, tipo, data });
          setTitulo("");
          void tocarSom("pop");
        }}
      >
        <Campo id="d-titulo" rotulo={T.estudos.tituloData} obrigatorio erro={erros.titulo}>
          <input id="d-titulo" className="campo" value={titulo} maxLength={120} aria-invalid={!!erros.titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <Campo id="d-tipo" rotulo={T.calendario.tipo}>
          <select id="d-tipo" className="seletor" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDataImportante)}>
            {(Object.keys(T.estudos.tiposData) as TipoDataImportante[]).map((t) => <option key={t} value={t}>{T.estudos.tiposData[t]}</option>)}
          </select>
        </Campo>
        <Campo id="d-data" rotulo={T.financas.data} obrigatorio erro={erros.data}>
          <input id="d-data" type="date" className="campo" value={data} aria-invalid={!!erros.data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Botao type="submit" variante="primario" icone={<Plus size={14} />}>{T.estudos.novaData}</Botao>
      </form>
      {datas.length === 0 ? (
        <Vazio icone={<CalendarClock size={28} />} titulo={T.estudos.semDatas} />
      ) : (
        <div className="lista">
          {datas.map((d) => {
            const dias = Math.round((new Date(d.data).getTime() - new Date(hojeISO()).getTime()) / 86400000);
            return (
              <div key={d.id} className="lista-item">
                <CaixaMarcar marcada={d.concluida} rotulo={d.titulo} aoMudar={(v) => { atualizar(d.id, { concluida: v }); if (v) void tocarSom("proud", "personagens"); }} />
                <div className="lista-item-principal">
                  <span className={`lista-item-titulo ${d.concluida ? "riscado" : ""}`}>{d.titulo}</span>
                  <span className="lista-item-sub">{T.estudos.tiposData[d.tipo]} . {formatar(d.data, "EEEE, d 'de' MMMM")}</span>
                </div>
                {!d.concluida && <span className={`etiqueta ${dias <= 3 ? "etiqueta-erro" : dias <= 7 ? "etiqueta-alerta" : ""}`}>{descreverDistancia(d.data)}</span>}
                <div className="lista-item-acoes">
                  <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => excluir(d.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessaoRevisao({ materiaId, aoFim }: { materiaId?: string; aoFim: () => void }) {
  const cartoes = useEstudos((s) => s.cartoes);
  const avaliar = useEstudos((s) => s.avaliarCartao);
  const materias = useEstudos((s) => s.materias);
  const [mostrar, setMostrar] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const fila = cartoesVencidos(cartoes).filter((c) => !materiaId || c.materiaId === materiaId);
  const atual = fila[0];

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (!atual) return;
      if (e.code === "Space" && !mostrar) {
        e.preventDefault();
        setMostrar(true);
      }
      if (mostrar && ["1", "2", "3", "4"].includes(e.key)) {
        avaliar(atual.id, Number(e.key) as 1 | 2 | 3 | 4);
        setMostrar(false);
        setFeitos((f) => f + 1);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [atual, mostrar, avaliar]);

  if (!atual)
    return (
      <Vazio
        icone={<CheckCircle2 size={28} color="var(--sucesso)" />}
        titulo={feitos > 0 ? T.estudos.fimSessao : T.estudos.semRevisoes}
        texto={feitos > 0 ? T.estudos.revisados(feitos) : undefined}
        acao={<Botao onClick={aoFim}>{T.geral.voltar}</Botao>}
      />
    );

  return (
    <div className="sessao-revisao">
      <div className="linha-entre texto-3" style={{ fontSize: 12 }}>
        <span>{materias.find((m) => m.id === atual.materiaId)?.nome}</span>
        <span className="numero">{T.estudos.restantes(fila.length)}</span>
      </div>
      <div className="sessao-revisao-cartao">
        <p className="sessao-revisao-frente">{atual.frente}</p>
        {mostrar && <p className="sessao-revisao-verso">{atual.verso}</p>}
      </div>
      <div className="linha" style={{ justifyContent: "center", flexWrap: "wrap" }}>
        {!mostrar ? (
          <Botao variante="primario" onClick={() => setMostrar(true)}>{T.estudos.mostrarResposta} <span className="tecla">Espaço</span></Botao>
        ) : (
          ([1, 2, 3, 4] as const).map((n) => (
            <Botao
              key={n}
              variante={n === 3 ? "primario" : n === 1 ? "perigo" : "secundario"}
              onClick={() => {
                avaliar(atual.id, n);
                setMostrar(false);
                setFeitos((f) => f + 1);
                void tocarSom(n === 1 ? "blip" : "pop");
              }}
            >
              {T.estudos.notas[n]} <span className="tecla">{n}</span>
            </Botao>
          ))
        )}
      </div>
    </div>
  );
}

function Revisoes({ materia, sessaoInicial }: { materia?: Materia; sessaoInicial: boolean }) {
  const cartoes = useEstudos((s) => s.cartoes).filter((c) => !materia || c.materiaId === materia.id);
  const criar = useEstudos((s) => s.criarCartao);
  const excluir = useEstudos((s) => s.excluirCartao);
  const revisoesConteudo = useEstudos((s) => s.revisoesConteudo);
  const paginas = useEstudos((s) => s.paginas);
  const concluirRevisao = useEstudos((s) => s.concluirRevisaoConteudo);
  const [sessao, setSessao] = useState(sessaoInicial);
  const [frente, setFrente] = useState("");
  const [verso, setVerso] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const vencidos = cartoesVencidos(cartoes);
  const hoje = hojeISO();
  const conteudo = revisoesConteudo.filter((r) => !r.feita && r.data <= hoje && (!materia || paginas.find((p) => p.id === r.paginaId)?.materiaId === materia.id));

  if (sessao) return <SessaoRevisao materiaId={materia?.id} aoFim={() => setSessao(false)} />;

  return (
    <div className="coluna" style={{ gap: 16 }}>
      <div className="linha-entre">
        <span className="texto-2">{T.estudos.cartoesDaMateria(cartoes.length)}</span>
        <Botao variante="primario" icone={<Layers size={14} />} disabled={vencidos.length === 0} onClick={() => setSessao(true)}>
          {vencidos.length ? T.estudos.revisarAgora(vencidos.length) : T.estudos.semRevisoes}
        </Botao>
      </div>
      {conteudo.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.estudos.revisoesConteudo}</span>
          {conteudo.map((r) => (
            <div key={r.id} className="lista-item">
              <BookCheck size={14} />
              <span className="lista-item-principal">{paginas.find((p) => p.id === r.paginaId)?.titulo || T.estudos.semTitulo}</span>
              <Botao pequeno onClick={() => concluirRevisao(r.id)}>{T.estudos.revisaoFeita}</Botao>
            </div>
          ))}
        </div>
      )}
      {materia && (
        <form
          className="formulario-linha"
          style={{ alignItems: "end" }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const novos: Record<string, string> = {};
            if (!frente.trim()) novos.frente = T.validacao.obrigatorio;
            if (!verso.trim()) novos.verso = T.validacao.obrigatorio;
            setErros(novos);
            if (Object.keys(novos).length) return;
            criar(materia.id, frente, verso);
            setFrente("");
            setVerso("");
            document.getElementById("r-frente")?.focus();
          }}
        >
          <Campo id="r-frente" rotulo={T.estudos.frente} obrigatorio erro={erros.frente}>
            <input id="r-frente" className="campo" value={frente} maxLength={500} aria-invalid={!!erros.frente} onChange={(e) => setFrente(e.target.value)} />
          </Campo>
          <Campo id="r-verso" rotulo={T.estudos.verso} obrigatorio erro={erros.verso}>
            <input id="r-verso" className="campo" value={verso} maxLength={2000} aria-invalid={!!erros.verso} onChange={(e) => setVerso(e.target.value)} />
          </Campo>
          <Botao type="submit" icone={<Plus size={14} />}>{T.estudos.novoCartaoRevisao}</Botao>
        </form>
      )}
      <div className="lista">
        {cartoes.map((c) => (
          <div key={c.id} className="lista-item">
            <div className="lista-item-principal">
              <span className="lista-item-titulo">{c.frente}</span>
              <span className="lista-item-sub">{c.verso}</span>
            </div>
            <span className="etiqueta">{new Date(c.vencimento) <= new Date() ? T.datas.hoje : descreverDistancia(paraISO(new Date(c.vencimento)))}</span>
            <div className="lista-item-acoes">
              <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => excluir(c.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Links({ materia }: { materia?: Materia }) {
  const links = useEstudos((s) => s.links).filter((l) => !materia || l.materiaId === materia.id);
  const salvar = useEstudos((s) => s.salvarLink);
  const atualizar = useEstudos((s) => s.atualizarLink);
  const excluir = useEstudos((s) => s.excluirLink);
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [tags, setTags] = useState("");
  const [filtro, setFiltro] = useState<EstadoLink | "todos">("todos");
  const [erro, setErro] = useState("");

  const lista = links.filter((l) => filtro === "todos" || l.estado === filtro);

  return (
    <div className="coluna">
      <AvisoFaixa>{T.estudos.aviso_meta}</AvisoFaixa>
      <form
        className="formulario-linha"
        style={{ alignItems: "end" }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const u = urlSegura(url);
          if (!u) return setErro(T.validacao.urlInvalida);
          salvar({
            url: u.href,
            titulo: titulo.trim().slice(0, 120) || u.hostname.replace(/^www\./, ""),
            nota: "",
            tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
            materiaId: materia?.id,
            estado: "para_ler",
          });
          setUrl("");
          setTitulo("");
          setTags("");
          setErro("");
          void tocarSom("gulp");
        }}
      >
        <Campo id="l-url" rotulo={T.estudos.url} obrigatorio erro={erro}>
          <input id="l-url" className="campo" value={url} type="url" inputMode="url" placeholder="https://" aria-invalid={!!erro} onChange={(e) => { setUrl(e.target.value); setErro(""); }} />
        </Campo>
        <Campo id="l-titulo" rotulo={T.estudos.tituloLink}>
          <input id="l-titulo" className="campo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <Campo id="l-tags" rotulo={T.estudos.tags} dica={T.estudos.tagsDica}>
          <input id="l-tags" className="campo" value={tags} maxLength={120} onChange={(e) => setTags(e.target.value)} />
        </Campo>
        <Botao type="submit" variante="primario" icone={<Plus size={14} />}>{T.estudos.novoLink}</Botao>
      </form>
      <Pilulas<EstadoLink | "todos">
        rotulo={T.estudos.abas.links}
        valor={filtro}
        aoMudar={setFiltro}
        opcoes={[{ valor: "todos", rotulo: T.geral.todos }, ...(Object.keys(T.estudos.estadosLink) as EstadoLink[]).map((e) => ({ valor: e, rotulo: T.estudos.estadosLink[e] }))]}
      />
      {lista.length === 0 ? (
        <Vazio icone={<Link2 size={28} />} titulo={T.estudos.semLinks} />
      ) : (
        <div className="lista">
          {lista.map((l) => (
            <div key={l.id} className="lista-item">
              <Link2 size={14} />
              <div className="lista-item-principal">
                <a className="lista-item-titulo" href={l.url} target="_blank" rel="noopener noreferrer">{l.titulo}</a>
                <span className="lista-item-sub">{l.url}</span>
              </div>
              {l.tags.map((t) => <span key={t} className="etiqueta">{t}</span>)}
              <select className="seletor" style={{ width: 130, height: 28 }} value={l.estado} aria-label={T.estudos.estadoLink} onChange={(e) => atualizar(l.id, { estado: e.target.value as EstadoLink })}>
                {(Object.keys(T.estudos.estadosLink) as EstadoLink[]).map((e) => <option key={e} value={e}>{T.estudos.estadosLink[e]}</option>)}
              </select>
              <a className="botao botao-fantasma botao-pequeno botao-icone" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={T.estudos.abrirLink}><ExternalLink size={13} /></a>
              <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => excluir(l.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Estatisticas() {
  const materias = useEstudos((s) => s.materias);
  const datas = useEstudos((s) => s.datas);
  const registro = useEstudos((s) => s.registroRevisoes);
  const sessoes = usePomodoro((s) => s.sessoes);
  const porMateria = new Map<string, number>();
  for (const s of sessoes) if (s.etapa === "foco" && s.situacao === "concluida" && s.materiaId) porMateria.set(s.materiaId, (porMateria.get(s.materiaId) ?? 0) + s.minutos);
  const ultimos = Array.from({ length: 14 }, (_, i) => paraISO(addDays(new Date(), i - 13)));
  const minutos = minutosEstudoPorDia(sessoes);
  const sequencia = sequenciaDias(new Set([...minutos.keys(), ...registro.filter((r) => r.quantidade > 0).map((r) => r.data)]));
  const hoje = hojeISO();
  const provas = datas.filter((d) => d.tipo === "prova" && !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="grade">
      <Cartao className="col-6" titulo={T.estudos.horasPorMateria}>
        {porMateria.size === 0 ? <p className="texto-3">{T.estudos.semHoras}</p> : (
          <BarrasHorizontais formatar={(v) => `${(v / 60).toFixed(1).replace(".", ",")} h`} barras={[...porMateria].map(([id, v]) => ({ rotulo: materias.find((m) => m.id === id)?.nome ?? "", valor: v })).sort((a, b) => b.valor - a.valor)} />
        )}
      </Cartao>
      <Cartao className="col-6" titulo={T.estudos.revisadosPorDia}>
        <BarrasVerticais altura={120} formatar={(v) => `${v}`} barras={ultimos.map((d) => ({ rotulo: d.slice(8), valor: registro.find((r) => r.data === d)?.quantidade ?? 0 }))} />
      </Cartao>
      <Cartao className="col-6">
        <span className="numero-grande">{sequencia}</span>
        <p className="texto-2">{T.estudos.sequenciaEstudo(sequencia)}</p>
      </Cartao>
      <Cartao className="col-6" titulo={T.estudos.proximasProvas}>
        {provas.length === 0 ? <p className="texto-3">{T.estudos.semDatas}</p> : provas.map((p) => (
          <div key={p.id} className="linha-entre" style={{ padding: "4px 0" }}>
            <span>{p.titulo}</span>
            <span className="etiqueta etiqueta-alerta">{descreverDistancia(p.data)}</span>
          </div>
        ))}
      </Cartao>
    </div>
  );
}

function NavMaterias({ materiaId, aoEscolher, aoNovaMateria, aoNovaArea, aoExcluirArea }: { materiaId?: string; aoEscolher: (id?: string) => void; aoNovaMateria: (areaId?: string) => void; aoNovaArea: () => void; aoExcluirArea: (id: string) => void }) {
  const areas = useEstudos((s) => s.areas);
  const materias = useEstudos((s) => s.materias);
  const cartoes = useEstudos((s) => s.cartoes);
  const datas = useEstudos((s) => s.datas);
  const [areaId, setAreaId] = useState(materias.find((m) => m.id === materiaId)?.areaId);
  const [busca, setBusca] = useState("");
  const [largura, setLargura] = useState(0);
  const navegacao = useRef<HTMLElement>(null);
  const linhaMaterias = useRef<HTMLDivElement>(null);
  const areaDaMateria = materias.find((m) => m.id === materiaId)?.areaId;
  const area = areas.find((a) => a.id === (areaDaMateria ?? areaId));
  const lista = materias.filter((m) => m.areaId === area?.id);
  const capacidade = Math.max(1, Math.floor((largura - 110) / 174));
  const visiveis = lista.slice(0, capacidade);
  const selecionada = lista.find((m) => m.id === materiaId);
  if (selecionada && !visiveis.includes(selecionada)) visiveis[visiveis.length - 1] = selecionada;
  const termo = busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  const resultados = lista.filter((m) => m.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(termo));
  const vencidos = cartoesVencidos(cartoes);
  const hoje = hojeISO();
  const totalHoje = vencidos.length;

  useEffect(() => {
    if (areaDaMateria) setAreaId(areaDaMateria);
  }, [areaDaMateria]);

  useEffect(() => {
    const linha = linhaMaterias.current;
    if (!linha) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(linha);
    return () => observador.disconnect();
  }, [area?.id]);

  useEffect(() => {
    const fecharMenus = (e: PointerEvent) => {
      navegacao.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => {
        if (e.target instanceof Node && !menu.contains(e.target)) menu.open = false;
      });
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const menu = navegacao.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (!menu) return;
      e.stopPropagation();
      menu.open = false;
      menu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", fecharMenus);
    document.addEventListener("keydown", aoTeclar, true);
    return () => {
      document.removeEventListener("pointerdown", fecharMenus);
      document.removeEventListener("keydown", aoTeclar, true);
    };
  }, []);

  const fecharMenus = () => navegacao.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => { menu.open = false; });
  const escolherMateria = (id: string) => {
    fecharMenus();
    setBusca("");
    aoEscolher(id);
  };

  const botaoMateria = (m: Materia) => {
    const pendentes = vencidos.filter((c) => c.materiaId === m.id).length;
    const prova = datas.filter((d) => d.materiaId === m.id && !d.concluida && d.data >= hoje).sort((x, y) => x.data.localeCompare(y.data))[0];
    return (
      <button key={m.id} type="button" className="estudos-nav-item" aria-current={m.id === materiaId} title={m.nome} onClick={() => escolherMateria(m.id)}>
        <span className="coluna" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="cortar">{m.nome}</span>
          {prova && <span className="estudos-nav-prova cortar"><Flag size={10} />{descreverDistancia(prova.data)}</span>}
        </span>
        {pendentes > 0 && <span className="estudos-badge" title={T.estudos.revisarAgora(pendentes)}>{pendentes}</span>}
      </button>
    );
  };

  return (
    <nav ref={navegacao} className="estudos-nav" aria-label={T.estudos.areas} style={{ ["--cor-area" as string]: area?.cor ?? "var(--destaque)" }}>
      <div className="estudos-nav-topo">
        <div className="estudos-nav-areas">
          <button type="button" className="estudos-nav-item estudos-nav-geral" aria-current={!area && !materiaId} onClick={() => { fecharMenus(); setAreaId(undefined); aoEscolher(undefined); }}>
            <LayoutDashboard size={15} />
            <span>{T.estudos.visaoGeral}</span>
            {totalHoje > 0 && <span className="estudos-badge">{totalHoje}</span>}
          </button>
          {areas.map((a) => (
            <button key={a.id} type="button" className="estudos-nav-item estudos-nav-area-nome" aria-current={a.id === area?.id} title={a.nome} style={{ ["--cor-area" as string]: a.cor }} onClick={() => {
              fecharMenus();
              setBusca("");
              setAreaId(a.id);
              if (areaDaMateria !== a.id) aoEscolher(materias.find((m) => m.areaId === a.id)?.id);
            }}>
              <span className="ponto-cor" style={{ background: a.cor }} />
              <span className="cortar">{a.nome}</span>
            </button>
          ))}
        </div>
        <Botao pequeno soIcone variante="fantasma" icone={<Plus size={15} />} aria-label={T.estudos.novaArea} title={T.estudos.novaArea} onClick={aoNovaArea} />
        {area && (
          <details className="estudos-menu" key={area.id}>
            <summary className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.estudos.acoesArea} title={T.estudos.acoesArea}><Ellipsis size={17} /></summary>
            <div className="estudos-menu-painel estudos-menu-acoes">
              <button type="button" onClick={() => { fecharMenus(); aoNovaMateria(area.id); }}><Plus size={14} />{T.estudos.novaMateria}</button>
              <button type="button" className="estudos-menu-excluir" onClick={() => { fecharMenus(); aoExcluirArea(area.id); }}><Trash2 size={14} />{T.estudos.excluirAreaRotulo}</button>
            </div>
          </details>
        )}
      </div>
      {area && (
        <div ref={linhaMaterias} className="estudos-nav-materias">
          {lista.length === 0 ? (
            <button type="button" className="estudos-nav-vazio" onClick={() => aoNovaMateria(area.id)}><Plus size={13} />{T.estudos.novaMateria}</button>
          ) : visiveis.map(botaoMateria)}
          {lista.length > capacidade && (
            <details className="estudos-menu estudos-menu-mais" key={area.id}>
              <summary className="botao botao-secundario botao-pequeno">{T.estudos.maisMaterias(lista.length - visiveis.length)}<ChevronDown size={13} /></summary>
              <div className="estudos-menu-painel">
                <label className="estudos-nav-busca"><Search size={14} /><input className="campo" value={busca} placeholder={T.estudos.buscarMateria} aria-label={T.estudos.buscarMateria} onChange={(e) => setBusca(e.target.value)} /></label>
                <div className="estudos-menu-resultados">
                  {resultados.map(botaoMateria)}
                  {resultados.length === 0 && <p className="texto-3">{T.estudos.semResultadoBusca}</p>}
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </nav>
  );
}

function CabecalhoMateria({ materia, aba, aoAba, aoExcluir }: { materia: Materia; aba: Aba; aoAba: (a: Aba) => void; aoExcluir: () => void }) {
  const area = useEstudos((s) => s.areas.find((a) => a.id === materia.areaId));
  const paginas = useEstudos((s) => s.paginas).filter((p) => p.materiaId === materia.id).length;
  const cartoes = useEstudos((s) => s.cartoes).filter((c) => c.materiaId === materia.id);
  const datas = useEstudos((s) => s.datas).filter((d) => d.materiaId === materia.id && !d.concluida && d.data >= hojeISO()).sort((a, b) => a.data.localeCompare(b.data));
  const tarefas = useRotina((s) => s.tarefas).filter((t) => t.materiaId === materia.id && t.status !== "concluida" && t.status !== "cancelada").length;
  const sessoes = usePomodoro((s) => s.sessoes);
  const rodando = usePomodoro((s) => s.rodando);
  const vinculo = usePomodoro((s) => s.materiaId);
  const minutos = sessoes.filter((x) => x.materiaId === materia.id && x.etapa === "foco" && x.situacao === "concluida").reduce((a, x) => a + x.minutos, 0);
  const pendentes = cartoesVencidos(cartoes).length;
  const cor = area?.cor ?? "var(--destaque)";
  const estudandoAqui = rodando && vinculo === materia.id;

  const estudar = () => {
    const p = usePomodoro.getState();
    if (estudandoAqui) return p.alternar();
    p.escolherEtapa("foco");
    p.definirVinculo(materia.id);
    p.iniciar();
    void tocarSom("work", "pomodoro");
    void useAgentes.getState().trabalhar("tutor", T.estudos.estudando(materia.nome), 600);
  };

  return (
    <header className="materia-cabecalho" style={{ ["--cor-area" as string]: cor }}>
      <div className="materia-cabecalho-topo">
        <div className="coluna" style={{ gap: 2, minWidth: 0 }}>
          <span className="rotulo-pequeno" style={{ color: cor }}>{area?.nome}{materia.semestre ? ` . ${materia.semestre}` : ""}</span>
          <h2 className="materia-nome">{materia.nome}</h2>
          <div className="materia-numeros">
            <span><b className="numero">{paginas}</b> {T.estudos.numeros.paginas}</span>
            <span><b className="numero">{tarefas}</b> {T.estudos.numeros.tarefas}</span>
            <span><b className="numero">{(minutos / 60).toFixed(1).replace(".", ",")} h</b> {T.estudos.numeros.horas}</span>
            {datas[0] && <span className="materia-prova"><CalendarClock size={12} />{datas[0].titulo} {descreverDistancia(datas[0].data)}</span>}
          </div>
        </div>
        <div className="materia-acoes">
          <Botao variante={estudandoAqui ? "secundario" : "primario"} icone={<Timer size={14} />} onClick={estudar}>{estudandoAqui ? T.pomodoro.pausar : T.estudos.estudarAgora}</Botao>
          <Botao icone={<Layers size={14} />} disabled={pendentes === 0} onClick={() => aoAba("revisoes")}>{pendentes > 0 ? T.estudos.revisarAgora(pendentes) : T.estudos.semRevisoes}</Botao>
          <Botao soIcone variante="fantasma" icone={<Trash2 size={14} />} aria-label={T.estudos.excluirMateriaRotulo} title={T.estudos.excluirMateriaRotulo} onClick={aoExcluir} />
        </div>
      </div>
      <div className="abas-linha" role="tablist" aria-label={materia.nome}>
        {ABAS_MATERIA.map((a) => (
          <button key={a} type="button" role="tab" aria-selected={aba === a} className="aba-linha" onClick={() => aoAba(a)}>
            {ICONES_ABA[a]}
            {T.estudos.abas[a]}
            {a === "revisoes" && pendentes > 0 && <span className="estudos-badge">{pendentes}</span>}
          </button>
        ))}
      </div>
    </header>
  );
}

const ABAS_MATERIA: Aba[] = ["anotacoes", "quadro", "datas", "revisoes", "arquivos", "links"];
const ABAS_GERAIS: Aba[] = ["estatisticas", "revisoes", "links"];

export default function Estudos() {
  const parametros = useInterface((s) => s.parametros);
  const areas = useEstudos((s) => s.areas);
  const materias = useEstudos((s) => s.materias);
  const excluirMateria = useEstudos((s) => s.excluirMateria);
  const excluirArea = useEstudos((s) => s.excluirArea);
  const [materiaId, setMateriaId] = useState<string | undefined>(parametros.materia || undefined);
  const [aba, setAba] = useState<Aba>((parametros.aba as Aba) || (parametros.materia ? "anotacoes" : "estatisticas"));
  const [criandoArea, setCriandoArea] = useState(false);
  const [criandoMateria, setCriandoMateria] = useState<string | undefined | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: "area" | "materia"; id: string } | null>(null);
  const materia = materias.find((m) => m.id === materiaId);
  const sessaoInicial = parametros.sessao === "1";

  useEffect(() => {
    if (parametros.materia !== undefined) setMateriaId(parametros.materia || undefined);
    if (parametros.aba) setAba(parametros.aba as Aba);
  }, [parametros]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "estudos") setCriandoMateria(undefined);
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const escolher = (id?: string) => {
    setMateriaId(id);
    setAba((a) => (id ? (ABAS_MATERIA.includes(a) && a !== "revisoes" && a !== "links" ? a : "anotacoes") : ABAS_GERAIS.includes(a) ? a : "estatisticas"));
  };

  const abaValida = materia ? (ABAS_MATERIA.includes(aba) ? aba : "anotacoes") : ABAS_GERAIS.includes(aba) ? aba : "estatisticas";

  const conteudo = useMemo(() => {
    switch (abaValida) {
      case "anotacoes":
        return materia && <Anotacoes materia={materia} paginaInicial={parametros.pagina} />;
      case "quadro":
        return materia && <Quadro materia={materia} />;
      case "datas":
        return materia && <Datas materia={materia} />;
      case "revisoes":
        return <Revisoes materia={materia} sessaoInicial={sessaoInicial} key={`${materia?.id}-${sessaoInicial}`} />;
      case "arquivos":
        return materia && <Arquivos materia={materia} />;
      case "links":
        return <Links materia={materia} />;
      case "estatisticas":
        return <Estatisticas />;
    }
  }, [abaValida, materia, parametros.pagina, sessaoInicial]);

  return (
    <>
      <div className="estudos-cabecalho">
        <CabecalhoAba titulo={T.estudos.titulo} subtitulo={T.estudos.subtitulo} agente="tutor" />
      </div>
      {areas.length === 0 ? (
        <Cartao>
          <Vazio icone={<GraduationCap size={28} />} titulo={T.estudos.semMaterias} texto={T.estudos.semMateriasDica} acao={<Botao variante="primario" onClick={() => setCriandoArea(true)}>{T.estudos.novaArea}</Botao>} />
        </Cartao>
      ) : (
        <div className="estudos-layout">
          <NavMaterias materiaId={materiaId} aoEscolher={escolher} aoNovaMateria={(id) => setCriandoMateria(id)} aoNovaArea={() => setCriandoArea(true)} aoExcluirArea={(id) => setConfirmar({ tipo: "area", id })} />
          <section className="estudos-area">
            {materia ? (
              <CabecalhoMateria materia={materia} aba={abaValida} aoAba={setAba} aoExcluir={() => setConfirmar({ tipo: "materia", id: materia.id })} />
            ) : (
              <header className="materia-cabecalho">
                <div className="materia-cabecalho-topo">
                  <div className="coluna" style={{ gap: 2 }}>
                    <span className="rotulo-pequeno">{T.estudos.todasMaterias}</span>
                    <h2 className="materia-nome">{T.estudos.visaoGeral}</h2>
                  </div>
                </div>
                <div className="abas-linha" role="tablist" aria-label={T.estudos.visaoGeral}>
                  {ABAS_GERAIS.map((a) => (
                    <button key={a} type="button" role="tab" aria-selected={abaValida === a} className="aba-linha" onClick={() => setAba(a)}>
                      {ICONES_ABA[a]}
                      {T.estudos.abas[a]}
                    </button>
                  ))}
                </div>
              </header>
            )}
            <div className="estudos-conteudo">{conteudo}</div>
          </section>
        </div>
      )}
      <NovaArea aberto={criandoArea} aoFechar={() => setCriandoArea(false)} />
      <NovaMateria aberto={criandoMateria !== null} areaId={criandoMateria ?? undefined} aoFechar={() => setCriandoMateria(null)} aoCriar={(m) => escolher(m.id)} />
      <ConfirmarModal
        aberto={!!confirmar}
        titulo={T.geral.confirmarExclusao}
        texto={confirmar?.tipo === "area" ? T.estudos.excluirArea : T.estudos.excluirMateria}
        aoFechar={() => setConfirmar(null)}
        aoConfirmar={() => {
          if (!confirmar) return;
          const materiasApagadas = confirmar.tipo === "area" ? materias.filter((m) => m.areaId === confirmar.id).map((m) => m.id) : [confirmar.id];
          if (confirmar.tipo === "area") excluirArea(confirmar.id);
          else excluirMateria(confirmar.id);
          for (const id of materiasApagadas) void excluirArquivosDaMateria(id).catch(() => undefined);
          if (confirmar.id === materiaId || (confirmar.tipo === "area" && materia?.areaId === confirmar.id)) escolher(undefined);
        }}
      />
    </>
  );
}
