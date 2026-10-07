import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Download, Upload, BellRing, CalendarDays, Trash2, Repeat, CornerDownLeft } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Campo, Modal, Segmentado, Vazio } from "../../componentes/basicos";
import { useOrganizacao } from "../../estado/organizacao";
import { useRotina } from "../../estado/rotina";
import { useEstudos } from "../../estado/estudos";
import { useFinancas } from "../../estado/financas";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { dataValida, deISO, formatar, formatarData, hojeISO, horaValida, paraISO } from "../../utilitarios/datas";
import { baixarArquivo, lerArquivoTexto } from "../../utilitarios/basicos";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import type { Repeticao } from "../../tipos";
import { itensDoCalendario, type FonteDoCalendario, type ItemDoCalendario } from "../../utilitarios/itensDoCalendario";
import { usarAgendaExterna } from "../../ponte/agendaExterna";
import { useConfig } from "../../estado/configuracoes";
import { funcaoLigada, type Funcao } from "../../utilitarios/funcoes";

type Fonte = FonteDoCalendario;
type Vista = "mes" | "semana" | "agenda";
type Item = ItemDoCalendario;

const COR_FONTE: Record<Fonte, string> = {
  eventos: "#3b6fe0",
  tarefas: "#2f9e6b",
  estudos: "#a855f7",
  financas: "#d9922b",
  metas: "#e05a8a",
  agenda: "#0e9fb0",
};

const FONTES = Object.keys(T.calendario.fontes) as Fonte[];
const FUNCAO_DA_FONTE: Record<Fonte, Funcao> = { eventos: "calendario", tarefas: "journal", estudos: "estudos", financas: "financas", metas: "metas", agenda: "calendario" };

function escaparIcs(t: string) {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function repeteTodoDia(i: Item) {
  return i.evento?.repeticao === "diaria";
}

function corDa(fonte: Fonte): CSSProperties {
  return { "--cor": COR_FONTE[fonte] } as CSSProperties;
}

function lerRapido(texto: string): { titulo: string; hora?: string } {
  const t = texto.trim();
  const m = /^(\d{1,2})(?:[:h](\d{2}))?\s+(.+)$/i.exec(t);
  if (m) {
    const hora = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
    if (horaValida(hora)) return { titulo: m[3].trim(), hora };
  }
  return { titulo: t };
}

function FormEvento({ aberto, dataInicial, aoFechar }: { aberto: boolean; dataInicial: string; aoFechar: () => void }) {
  const criar = useOrganizacao((s) => s.criarEvento);
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(dataInicial);
  const [hora, setHora] = useState("");
  const [tipo, setTipo] = useState<"evento" | "lembrete">("evento");
  const [repeticao, setRepeticao] = useState<Repeticao>("nenhuma");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setTitulo("");
    setData(dataInicial);
    setHora("");
    setTipo("evento");
    setRepeticao("nenhuma");
    setErros({});
  }, [aberto, dataInicial]);

  return (
    <Modal aberto={aberto} titulo={T.calendario.novoEvento} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!titulo.trim()) novos.titulo = T.validacao.obrigatorio;
          if (!dataValida(data)) novos.data = T.validacao.dataInvalida;
          if (hora && !horaValida(hora)) novos.hora = T.validacao.horaInvalida;
          if (tipo === "lembrete" && !hora) novos.hora = T.calendario.lembreteHora;
          setErros(novos);
          if (Object.keys(novos).length) return;
          criar({ titulo, data, hora: hora || undefined, tipo, repeticao });
          if (tipo === "lembrete" && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
          aoFechar();
        }}
      >
        <Segmentado rotulo={T.calendario.tipo} valor={tipo} aoMudar={setTipo} opcoes={[{ valor: "evento", rotulo: T.calendario.evento, icone: <CalendarDays size={13} /> }, { valor: "lembrete", rotulo: T.calendario.lembrete, icone: <BellRing size={13} /> }]} />
        <Campo id="ev-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={erros.titulo}>
          <input id="ev-titulo" className="campo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="ev-data" rotulo={T.financas.data} obrigatorio erro={erros.data}>
            <input id="ev-data" type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo id="ev-hora" rotulo={T.calendario.hora} obrigatorio={tipo === "lembrete"} erro={erros.hora}>
            <input id="ev-hora" type="time" className="campo" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Campo>
          <Campo id="ev-rep" rotulo={T.calendario.repeticao}>
            <select id="ev-rep" className="seletor" value={repeticao} onChange={(e) => setRepeticao(e.target.value as Repeticao)}>
              {(Object.keys(T.calendario.repeticoes) as Repeticao[]).map((r) => <option key={r} value={r}>{T.calendario.repeticoes[r]}</option>)}
            </select>
          </Campo>
        </div>
        {tipo === "lembrete" && <p className="campo-dica">{T.calendario.lembreteDica}</p>}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function Chip({ i }: { i: Item }) {
  return (
    <span className="cal-chip" style={corDa(i.fonte)} title={i.hora ? `${i.hora} ${i.titulo}` : i.titulo}>
      {i.hora && <span className="cal-chip-hora numero">{i.hora}</span>}
      <span className="cortar privado">{i.titulo}</span>
    </span>
  );
}

function LinhaDoDia({ i, aoExcluir, aoAbrirJournal }: { i: Item; aoExcluir?: () => void; aoAbrirJournal?: () => void }) {
  return (
    <div className="cal-linha" style={corDa(i.fonte)}>
      <span className="cal-linha-hora numero">{i.hora ?? ""}</span>
      <span className="cal-linha-barra" />
      <div className="cal-linha-texto">
        <span className="cortar privado">{i.titulo}</span>
        <span className="texto-3">{[T.calendario.fontes[i.fonte], i.evento && i.evento.repeticao !== "nenhuma" ? T.calendario.repeticoes[i.evento.repeticao] : ""].filter(Boolean).join(" . ")}</span>
      </div>
      {aoAbrirJournal && <Botao pequeno variante="fantasma" onClick={aoAbrirJournal}>{T.rotas.journal}</Botao>}
      {aoExcluir && <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={aoExcluir} />}
    </div>
  );
}

export default function Calendario() {
  const parametros = useInterface((s) => s.parametros);
  const avisar = useInterface((s) => s.avisar);
  const irPara = useInterface((s) => s.irPara);
  const eventos = useOrganizacao((s) => s.eventos);
  const metas = useOrganizacao((s) => s.metas);
  const criarEvento = useOrganizacao((s) => s.criarEvento);
  const excluirEvento = useOrganizacao((s) => s.excluirEvento);
  const restaurarEvento = useOrganizacao((s) => s.restaurarEvento);
  const tarefas = useRotina((s) => s.tarefas);
  const datas = useEstudos((s) => s.datas);
  const revisoes = useEstudos((s) => s.revisoesConteudo);
  const recorrentes = useFinancas((s) => s.recorrentes);
  const [vista, setVista] = useState<Vista>("mes");
  const [foco, setFoco] = useState(parametros.data && dataValida(parametros.data) ? parametros.data : hojeISO());
  const [fontes, setFontes] = useState<Record<Fonte, boolean>>({ eventos: true, tarefas: true, estudos: true, financas: true, metas: true, agenda: true });
  const agenda = usarAgendaExterna();
  const [novo, setNovo] = useState(false);
  const [diaSelecionado, setDiaSelecionado] = useState(foco);
  const [rapido, setRapido] = useState("");

  useEffect(() => {
    if (parametros.data && dataValida(parametros.data)) {
      setFoco(parametros.data);
      setDiaSelecionado(parametros.data);
    }
  }, [parametros.data]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "calendario") setNovo(true);
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const base = deISO(foco);
  const hoje = hojeISO();
  const intervalo = vista === "mes"
    ? { inicio: startOfWeek(startOfMonth(base), { weekStartsOn: 1 }), fim: endOfWeek(endOfMonth(base), { weekStartsOn: 1 }) }
    : vista === "semana"
      ? { inicio: startOfWeek(base, { weekStartsOn: 1 }), fim: endOfWeek(base, { weekStartsOn: 1 }) }
      : { inicio: base, fim: addDays(base, 30) };
  const inicioISO = paraISO(intervalo.inicio);
  const fimISO = paraISO(intervalo.fim);

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const gerar = useMemo(() => (de: string, ate: string) => itensDoCalendario({ eventos, tarefas, datas, revisoes, metas, recorrentes, agenda }, de, ate).filter((i) => fontes[i.fonte]), [eventos, tarefas, datas, revisoes, metas, recorrentes, agenda, fontes, desligadas]);
  const itens = useMemo(() => gerar(inicioISO, fimISO), [gerar, inicioISO, fimISO]);
  const proximos = useMemo(() => gerar(hoje, paraISO(addDays(deISO(hoje), 6))).filter((i) => !repeteTodoDia(i)), [gerar, hoje]);
  const doDiaSelecionado = useMemo(() => gerar(diaSelecionado, diaSelecionado), [gerar, diaSelecionado]);

  const esconderDiarios = vista !== "semana";
  const porDia = itens.reduce<Record<string, Item[]>>((acc, i) => {
    if (esconderDiarios && repeteTodoDia(i)) return acc;
    (acc[i.data] ??= []).push(i);
    return acc;
  }, {});
  const diariosDoDia = doDiaSelecionado.filter(repeteTodoDia);
  const doDia = doDiaSelecionado.filter((i) => !repeteTodoDia(i));
  const diaTodo = doDia.filter((i) => !i.hora);
  const comHora = doDia.filter((i) => i.hora);

  const mover = (n: number) => {
    const d = vista === "mes" ? addMonths(base, n) : vista === "semana" ? addWeeks(base, n) : addDays(base, n * 30);
    setFoco(paraISO(d));
  };

  const irParaHoje = () => {
    setFoco(hoje);
    setDiaSelecionado(hoje);
  };

  const exportarIcs = () => {
    const agora = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const regra: Record<Repeticao, string> = { nenhuma: "", diaria: "RRULE:FREQ=DAILY", semanal: "RRULE:FREQ=WEEKLY", mensal: "RRULE:FREQ=MONTHLY" };
    const corpo = eventos.map((e) => {
      const data = e.data.replace(/-/g, "");
      const inicio = e.hora ? `DTSTART:${data}T${e.hora.replace(":", "")}00` : `DTSTART;VALUE=DATE:${data}`;
      return ["BEGIN:VEVENT", `UID:${e.id}@niko`, `DTSTAMP:${agora}`, inicio, `SUMMARY:${escaparIcs(e.titulo)}`, regra[e.repeticao], "END:VEVENT"].filter(Boolean).join("\r\n");
    });
    baixarArquivo("niko-calendario.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Niko//PT-BR", ...corpo, "END:VCALENDAR"].join("\r\n"), "text/calendar");
  };

  const importarIcs = async (arquivo: File) => {
    try {
      const texto = await lerArquivoTexto(arquivo, 2 * 1024 * 1024);
      const blocos = texto.replace(/\r\n[ \t]/g, "").split("BEGIN:VEVENT").slice(1, 500);
      let n = 0;
      for (const b of blocos) {
        const resumo = /SUMMARY[^:]*:(.*)/.exec(b)?.[1]?.trim().replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ");
        const inicio = /DTSTART[^:]*:(\d{8})(T(\d{4}))?/.exec(b);
        if (!resumo || !inicio) continue;
        const data = `${inicio[1].slice(0, 4)}-${inicio[1].slice(4, 6)}-${inicio[1].slice(6, 8)}`;
        if (!dataValida(data)) continue;
        const rr = /RRULE:FREQ=(DAILY|WEEKLY|MONTHLY)/.exec(b)?.[1];
        criarEvento({ titulo: resumo.slice(0, 120), data, hora: inicio[3] ? `${inicio[3].slice(0, 2)}:${inicio[3].slice(2)}` : undefined, tipo: "evento", repeticao: rr === "DAILY" ? "diaria" : rr === "WEEKLY" ? "semanal" : rr === "MONTHLY" ? "mensal" : "nenhuma" });
        n++;
      }
      avisar(n ? T.calendario.importadosIcs(n) : T.validacao.arquivoInvalido);
    } catch {
      avisar(T.validacao.arquivoInvalido);
    }
  };

  const criarRapido = () => {
    const { titulo, hora } = lerRapido(rapido);
    if (!titulo) return;
    criarEvento({ titulo: titulo.slice(0, 120), data: diaSelecionado, hora, tipo: "evento", repeticao: "nenhuma" });
    setRapido("");
    avisar(T.calendario.criado(titulo));
  };

  const excluir = (i: Item) => {
    if (!i.evento) return undefined;
    return () => {
      const r = excluirEvento(i.evento!.id);
      if (r) avisar(T.geral.excluido, () => restaurarEvento(r));
    };
  };

  const abrirJournal = (i: Item) => (i.fonte === "tarefas" ? () => irPara("journal", { data: i.data }) : undefined);

  const escolherDia = (iso: string) => {
    setDiaSelecionado(iso);
    if (vista === "mes" && !isSameMonth(deISO(iso), base)) setFoco(iso);
  };

  const tituloPeriodo = vista === "mes"
    ? { principal: formatarData(base, "MMMM"), secundario: formatarData(base, "yyyy") }
    : { principal: `${formatar(inicioISO, "d MMM")} . ${formatar(fimISO, "d MMM")}`, secundario: formatarData(intervalo.fim, "yyyy") };

  const dias = eachDayOfInterval({ start: intervalo.inicio, end: intervalo.fim });
  const semanasNoMes = Math.ceil(dias.length / 7);

  const agrupadoAgenda = Object.entries(porDia);
  const diariosNoPeriodo = [...new Map(itens.filter(repeteTodoDia).map((i) => [i.evento!.id, i])).values()];

  return (
    <>
      <CabecalhoAba
        titulo={T.calendario.titulo}
        subtitulo={T.calendario.subtitulo}
        agente="organizador"
        acoes={
          <>
            <Botao pequeno variante="primario" icone={<Plus size={13} />} onClick={() => setNovo(true)}>{T.calendario.novoEvento}</Botao>
            <Botao pequeno icone={<Download size={13} />} onClick={exportarIcs} disabled={eventos.length === 0}>{T.calendario.exportarIcs}</Botao>
            <label className="botao botao-secundario botao-pequeno" style={{ cursor: "pointer" }}>
              <Upload size={13} />
              {T.calendario.importarIcs}
              <input type="file" accept=".ics,text/calendar" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importarIcs(f); e.target.value = ""; }} />
            </label>
          </>
        }
      />

      <div className="cal-barra">
        <div className="cal-periodo">
          <h2><span>{tituloPeriodo.principal}</span> <span className="texto-3">{tituloPeriodo.secundario}</span></h2>
          <div className="cal-navegar">
            <Botao pequeno soIcone variante="fantasma" icone={<ChevronLeft size={15} />} aria-label={T.geral.anterior} onClick={() => mover(-1)} />
            <Botao pequeno variante="fantasma" onClick={irParaHoje}>{T.geral.hoje}</Botao>
            <Botao pequeno soIcone variante="fantasma" icone={<ChevronRight size={15} />} aria-label={T.geral.proximo} onClick={() => mover(1)} />
          </div>
        </div>
        <Segmentado<Vista> rotulo={T.calendario.titulo} valor={vista} aoMudar={setVista} opcoes={(Object.keys(T.calendario.vistas) as Vista[]).map((v) => ({ valor: v, rotulo: T.calendario.vistas[v] }))} />
        <div className="cal-filtros" role="group" aria-label={T.calendario.mostrar}>
          {FONTES.filter((f) => funcaoLigada(FUNCAO_DA_FONTE[f], desligadas)).map((f) => (
            <button key={f} type="button" className="cal-filtro" style={corDa(f)} aria-pressed={fontes[f]} onClick={() => setFontes({ ...fontes, [f]: !fontes[f] })}>
              <span className="cal-filtro-ponto" />
              {T.calendario.fontes[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-layout">
        <div className="cal-principal">
          {vista === "mes" && (
            <div className="cal-mes" style={{ "--semanas": semanasNoMes } as CSSProperties}>
              {T.calendario.diasSemana.map((d, n) => <div key={d} className="cal-mes-cabecalho" data-fds={n >= 5 ? "sim" : "nao"}>{d}</div>)}
              {dias.map((d, n) => {
                const iso = paraISO(d);
                const lista = porDia[iso] ?? [];
                const limite = 3;
                return (
                  <button
                    key={iso}
                    type="button"
                    className="cal-dia"
                    data-fora={!isSameMonth(d, base) ? "sim" : "nao"}
                    data-hoje={iso === hoje ? "sim" : "nao"}
                    data-fds={n % 7 >= 5 ? "sim" : "nao"}
                    data-passado={iso < hoje ? "sim" : "nao"}
                    aria-pressed={iso === diaSelecionado}
                    aria-label={`${formatar(iso, "d 'de' MMMM")}, ${T.calendario.itensNoDia(lista.length)}`}
                    onClick={() => escolherDia(iso)}
                    onDoubleClick={() => { setDiaSelecionado(iso); setNovo(true); }}
                  >
                    <span className="cal-dia-topo">
                      <span className="cal-dia-numero numero">{d.getDate()}</span>
                      {lista.length > limite && <span className="cal-dia-mais">{T.calendario.mais(lista.length - limite)}</span>}
                    </span>
                    <span className="cal-dia-marcas">
                      {lista.slice(0, limite).map((i) => <Chip key={i.id} i={i} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {vista === "semana" && (
            <div className="cal-semana">
              {dias.map((d, n) => {
                const iso = paraISO(d);
                const lista = porDia[iso] ?? [];
                return (
                  <button
                    key={iso}
                    type="button"
                    className="cal-semana-dia"
                    data-hoje={iso === hoje ? "sim" : "nao"}
                    data-fds={n >= 5 ? "sim" : "nao"}
                    aria-pressed={iso === diaSelecionado}
                    aria-label={`${formatar(iso, "d 'de' MMMM")}, ${T.calendario.itensNoDia(lista.length)}`}
                    onClick={() => setDiaSelecionado(iso)}
                    onDoubleClick={() => { setDiaSelecionado(iso); setNovo(true); }}
                  >
                    <span className="cal-semana-cabecalho">
                      <span className="rotulo-secao">{T.calendario.diasSemana[n]}</span>
                      <span className="cal-dia-numero numero">{d.getDate()}</span>
                    </span>
                    <span className="cal-semana-lista">
                      {lista.map((i) => <Chip key={i.id} i={i} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {vista === "agenda" && (
            <div className="cal-agenda">
              {diariosNoPeriodo.length > 0 && (
                <div className="cal-agenda-diarios">
                  <span className="linha texto-2" style={{ gap: 6, fontSize: 12 }}><Repeat size={13} />{T.calendario.todoDia}</span>
                  <div className="cal-agenda-chips">{diariosNoPeriodo.map((i) => <Chip key={i.id} i={i} />)}</div>
                </div>
              )}
              {agrupadoAgenda.length === 0 ? (
                <Cartao><Vazio icone={<CalendarDays size={28} />} titulo={T.calendario.semItens} /></Cartao>
              ) : agrupadoAgenda.map(([dia, lista]) => (
                <div key={dia} className="cal-agenda-dia" data-hoje={dia === hoje ? "sim" : "nao"} data-selecionado={dia === diaSelecionado ? "sim" : "nao"}>
                  <button type="button" className="cal-agenda-data" onClick={() => setDiaSelecionado(dia)}>
                    <span className="cal-agenda-numero numero">{formatar(dia, "d")}</span>
                    <span className="texto-2" style={{ textTransform: "capitalize" }}>{formatar(dia, "EEE")}</span>
                    <span className="texto-3" style={{ fontSize: 11, textTransform: "capitalize" }}>{formatar(dia, "MMM")}</span>
                  </button>
                  <div className="cal-agenda-itens">
                    {lista.map((i) => <LinhaDoDia key={i.id} i={i} aoExcluir={excluir(i)} aoAbrirJournal={abrirJournal(i)} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="cal-lateral">
          <Cartao className="cal-painel">
            <div className="cal-painel-topo">
              <div className="cal-painel-data">
                <span className="cal-painel-numero numero">{formatar(diaSelecionado, "d")}</span>
                <div className="coluna" style={{ gap: 0 }}>
                  <b style={{ textTransform: "capitalize" }}>{formatar(diaSelecionado, "EEEE")}</b>
                  <span className="texto-3" style={{ fontSize: 12, textTransform: "capitalize" }}>{formatar(diaSelecionado, "MMMM yyyy")}</span>
                </div>
              </div>
              <div className="linha" style={{ gap: 6 }}>
                {diaSelecionado === hoje && <span className="etiqueta etiqueta-destaque">{T.geral.hoje}</span>}
                <Botao pequeno soIcone icone={<Plus size={14} />} aria-label={T.calendario.novoEvento} onClick={() => setNovo(true)} />
              </div>
            </div>

            <form className="cal-rapido" onSubmit={(e) => { e.preventDefault(); criarRapido(); }}>
              <input className="campo" value={rapido} maxLength={140} placeholder={T.calendario.rapido} aria-label={T.calendario.rapidoRotulo} onChange={(e) => setRapido(e.target.value)} />
              <Botao type="submit" pequeno soIcone variante="fantasma" icone={<CornerDownLeft size={14} />} aria-label={T.geral.criar} disabled={!rapido.trim()} />
            </form>

            {doDia.length === 0 && diariosDoDia.length === 0 ? (
              <p className="texto-3 cal-painel-vazio">{T.calendario.diaLivre}</p>
            ) : (
              <div className="coluna" style={{ gap: 14 }}>
                {diaTodo.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao">{T.calendario.diaTodo}</span>
                    {diaTodo.map((i) => <LinhaDoDia key={i.id} i={i} aoExcluir={excluir(i)} aoAbrirJournal={abrirJournal(i)} />)}
                  </div>
                )}
                {comHora.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao">{T.calendario.comHorario}</span>
                    {comHora.map((i) => <LinhaDoDia key={i.id} i={i} aoExcluir={excluir(i)} aoAbrirJournal={abrirJournal(i)} />)}
                  </div>
                )}
                {diariosDoDia.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao linha" style={{ gap: 6 }}><Repeat size={12} />{T.calendario.todoDia}</span>
                    {diariosDoDia.map((i) => <LinhaDoDia key={i.id} i={i} aoExcluir={excluir(i)} />)}
                    {esconderDiarios && <span className="campo-dica">{T.calendario.todoDiaDica}</span>}
                  </div>
                )}
              </div>
            )}
            <p className="campo-dica cal-dica-duplo">{T.calendario.dicaDuplo}</p>
          </Cartao>

          <Cartao titulo={T.calendario.proximos} icone={<CalendarDays size={16} />}>
            {proximos.length === 0 ? <p className="texto-3">{T.calendario.semProximos}</p> : (
              <div className="cal-proximos">
                {proximos.slice(0, 8).map((i) => (
                  <button key={i.id} type="button" className="cal-proximo" style={corDa(i.fonte)} onClick={() => { setFoco(i.data); setDiaSelecionado(i.data); }}>
                    <span className="cal-proximo-dia">
                      <span className="numero">{formatar(i.data, "d")}</span>
                      <span>{formatar(i.data, "EEE")}</span>
                    </span>
                    <span className="cal-linha-barra" />
                    <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
                      <span className="cortar privado">{i.titulo}</span>
                      <span className="texto-3" style={{ fontSize: 11 }}>{[i.data === hoje ? T.geral.hoje : "", i.hora, T.calendario.fontes[i.fonte]].filter(Boolean).join(" . ")}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Cartao>
        </aside>
      </div>
      <FormEvento aberto={novo} dataInicial={diaSelecionado} aoFechar={() => setNovo(false)} />
    </>
  );
}
