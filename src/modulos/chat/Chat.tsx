import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Search, Send, Download, Trash2, Copy, Check, Sparkles, Terminal, Square, Settings2, Info, RotateCcw, Play, Zap, AlertTriangle, Paperclip, Lightbulb, ListChecks, ScanText, type LucideIcon } from "lucide-react";
import { TextoRico } from "../../componentes/TextoRico";
import { CartoesDaMensagem } from "../../componentes/CartaoAcao";
import { EscolhaDoAgente } from "../../componentes/EscolhaDoAgente";
import { AnexosDaMensagem, ChipsAnexos, ZonaDeSoltar, useAnexos, useArrastarArquivos } from "../../componentes/AnexosChat";
import { Personagem } from "../../personagens/Personagem";
import { Botao, Tecla } from "../../componentes/basicos";
import { useComunicacao } from "../../estado/comunicacao";
import { useAgentes, AGENTES } from "../../estado/agentes";
import { useConfig } from "../../estado/configuracoes";
import { comandoDisponivel } from "../../utilitarios/funcoes";
import { useInterface } from "../../estado/interface";
import { useConversando, enviarAoTime, pararResposta, tentarDeNovo, usarSugestao } from "../../estado/conversando";
import { T } from "../../textos/textos";
import { formatar } from "../../utilitarios/datas";
import { baixarArquivo, contem, normalizarTexto } from "../../utilitarios/basicos";
import { provedoresEmOrdem, escolherAgente, type ProvedorEmUso } from "../../utilitarios/assistente";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import type { AgenteId, Conversa, Mensagem } from "../../tipos";
import type { AcaoAnexo } from "../../utilitarios/recursosChat";

const ICONES_ACAO_ANEXO: Record<AcaoAnexo, LucideIcon> = { resumir: Sparkles, explicar: Lightbulb, perguntas: ListChecks, extrair: ScanText };

function grupoDaData(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return T.chat.hoje;
  const ontem = new Date(hoje.getTime() - 86400000);
  if (d.toDateString() === ontem.toDateString()) return T.chat.ontem;
  return T.chat.antes;
}

const COMANDO_SUGERIDO = /(?:^|[\s`"'(])(\/(?:tarefa|gasto|receita|lembrete|compra|dividir|pomodoro|link|lembrar)\s[^`"'\n)]{2,160})/gi;

function comandosSugeridos(texto: string): string[] {
  return [...new Set([...texto.matchAll(COMANDO_SUGERIDO)].map((m) => m[1].trim().replace(/[.,;:]+$/, "")))].slice(0, 4);
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="chat-acao"
      aria-label={copiado ? T.chat.copiado : T.chat.copiar}
      title={copiado ? T.chat.copiado : T.chat.copiar}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1400);
        } catch {
          return;
        }
      }}
    >
      {copiado ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

const MensagemChat = memo(function MensagemChat({ conversaId, m, nome, cargo, ultima }: { conversaId: string; m: Mensagem; nome: string; cargo: string; ultima: boolean }) {
  const ocupado = useConversando((s) => s.fase !== null);
  const sugeridos = m.autor === "agente" ? comandosSugeridos(m.texto) : [];
  return (
    <motion.div className={`chat-mensagem chat-${m.autor}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {m.autor === "agente" && <Personagem agente={m.agenteId} estado="ocioso" tamanho={34} interativo={false} halo={false} olhar={false} />}
      <div className="chat-bolha">
        {m.autor === "agente" && (
          <span className="chat-autor">
            {nome} <span className="texto-3">{cargo}</span>
          </span>
        )}
        {m.texto && (
          <div className={`chat-texto privado${m.erro ? " chat-texto-erro" : ""}`}>
            {m.erro && <AlertTriangle size={14} className="chat-erro-icone" />}
            {m.autor === "agente" ? <TextoRico texto={m.texto} /> : m.texto}
          </div>
        )}
        {m.autor === "usuario" && <AnexosDaMensagem anexos={m.anexos} />}
        {m.detalhe && (
          <details className="chat-detalhe">
            <summary>{T.chat.detalheTecnico}</summary>
            <code>{m.detalhe}</code>
          </details>
        )}
        {m.acoes && m.acoes.length > 0 && (
          <div className="chat-feitas">
            {m.acoes.map((a) => (
              <span key={a} className="etiqueta etiqueta-sucesso"><Zap size={11} />{a}</span>
            ))}
          </div>
        )}
        <CartoesDaMensagem conversaId={conversaId} mensagem={m} atalhos={ultima} />
        {sugeridos.length > 0 && (
          <div className="chat-sugeridos">
            {sugeridos.map((cmd) => (
              <button key={cmd} type="button" className="chat-sugerido" disabled={ocupado} onClick={() => void usarSugestao(conversaId, cmd)} title={T.chat.usarComando}>
                <Play size={11} />
                <code className="cortar">{cmd}</code>
              </button>
            ))}
          </div>
        )}
        {m.incompleta && <span className="etiqueta etiqueta-alerta" style={{ alignSelf: "flex-start" }}>{T.chat.incompleta}</span>}
        {m.repetir && (
          <Botao pequeno icone={<RotateCcw size={13} />} disabled={ocupado} onClick={() => void tentarDeNovo(conversaId, m)} style={{ alignSelf: "flex-start" }}>
            {T.chat.tentarDeNovo}
          </Botao>
        )}
        <div className="chat-acoes">
          <BotaoCopiar texto={m.texto} />
          <span className="texto-3" style={{ fontSize: 10 }}>{formatar(m.criadaEm, "HH:mm")}</span>
          {m.origem && <span className="texto-3 cortar" style={{ fontSize: 10 }} title={m.origem}>{m.origem}</span>}
        </div>
      </div>
    </motion.div>
  );
});

function RespostaAoVivo({ conversaId }: { conversaId: string }) {
  const doChat = useConversando((s) => s.conversaId === conversaId);
  const parcial = useConversando((s) => s.parcial);
  const agente = useConversando((s) => s.agente);
  const fase = useConversando((s) => s.fase);
  if (!doChat || !agente) return null;
  if (!parcial || fase !== "respondendo") return <EscolhaDoAgente />;
  return (
    <div className="chat-mensagem chat-agente">
      <Personagem agente={agente} estado="escrevendo" tamanho={34} interativo={false} halo={false} />
      <div className="chat-bolha">
        <div className="chat-texto"><TextoRico texto={parcial} /></div>
      </div>
    </div>
  );
}

function RolarParaFim({ alvo, conversaId, quantidade }: { alvo: React.RefObject<HTMLDivElement | null>; conversaId?: string; quantidade: number }) {
  const parcial = useConversando((s) => s.parcial.length);
  const fase = useConversando((s) => s.fase);
  useEffect(() => {
    const el = alvo.current;
    const caixa = el?.closest(".chat-mensagens");
    if (!el || !caixa) return;
    const perto = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 220;
    if (perto || parcial === 0) el.scrollIntoView({ block: "end" });
  }, [alvo, conversaId, quantidade, parcial, fase]);
  return null;
}

export default function Chat() {
  const parametros = useInterface((s) => s.parametros);
  const avisar = useInterface((s) => s.avisar);
  const irPara = useInterface((s) => s.irPara);
  const conversas = useComunicacao((s) => s.conversas);
  const criar = useComunicacao((s) => s.criarConversa);
  const excluir = useComunicacao((s) => s.excluirConversa);
  const restaurar = useComunicacao((s) => s.restaurarConversa);
  const nomes = useConfig((s) => s.agentes.nomes);
  const cargos = useConfig((s) => s.agentes.cargos);
  const ia = useConfig((s) => s.ia);
  const ouvir = useAgentes((s) => s.ouvir);
  const fase = useConversando((s) => s.fase);
  const [atualId, setAtualId] = useState<string | undefined>(parametros.conversa || conversas[0]?.id);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [historicoEnvio, setHistoricoEnvio] = useState<string[]>([]);
  const [fila, setFila] = useState<ProvedorEmUso[]>([]);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const atual = conversas.find((c) => c.id === atualId);
  const provedor = fila[0];
  const favorito = useConfig((s) => s.agentes.favorito);
  const principal = useRef<HTMLElement>(null);
  const seletorArquivo = useRef<HTMLInputElement>(null);
  const anexos = useAnexos(avisar);
  const arrastando = useArrastarArquivos(principal, anexos.adicionar);
  const mascote = texto.trim() ? escolherAgente(texto) : favorito;

  useEffect(() => {
    void provedoresEmOrdem().then(setFila);
  }, [ia]);

  useEffect(() => {
    if (parametros.conversa) setAtualId(parametros.conversa);
    if (parametros.agente) {
      setAtualId(undefined);
      setTexto(`@${nomes[parametros.agente as AgenteId] ?? ""} `);
      campo.current?.focus();
    }
  }, [parametros, nomes]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "chat") {
        setAtualId(undefined);
        campo.current?.focus();
      }
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const digitandoAlgo = texto.length > 0;
  useEffect(() => {
    AGENTES.forEach((a) => ouvir(a, digitandoAlgo));
    return () => AGENTES.forEach((a) => ouvir(a, false));
  }, [digitandoAlgo, ouvir]);

  const [ativoMencao, setAtivoMencao] = useState(0);
  const mencoes = useMemo(() => {
    const m = /(^|\s)@([\p{L}\d]*)$/u.exec(texto);
    if (!m) return [];
    const alvo = normalizarTexto(m[2]);
    return AGENTES.filter((a) => normalizarTexto(nomes[a]).startsWith(alvo) || normalizarTexto(cargos[a]).includes(alvo));
  }, [texto, nomes, cargos]);

  useEffect(() => setAtivoMencao(0), [mencoes.length]);

  const escolherMencao = (a: AgenteId) => {
    setTexto((t) => t.replace(/@([\p{L}\d]*)$/u, `@${nomes[a]} `));
    campo.current?.focus();
  };

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const sugestoes = useMemo(() => {
    if (!texto.startsWith("/") || texto.includes(" ")) return [];
    return T.chat.ajuda.filter((c) => c.startsWith(texto.split(" ")[0]) && comandoDisponivel(c, desligadas)).slice(0, 6);
  }, [texto, desligadas]);

  const enviar = (acaoAnexo?: AcaoAnexo) => {
    const limpo = texto.trim();
    if ((!limpo && anexos.lista.length === 0) || fase || anexos.carregando) return;
    const prontos = anexos.prontos();
    let conversa = atual;
    if (!conversa) {
      conversa = criar("organizador");
      setAtualId(conversa.id);
    }
    setHistoricoEnvio((h) => [limpo, ...h].slice(0, 20));
    setTexto("");
    anexos.limpar();
    void enviarAoTime(conversa.id, limpo, prontos, { acaoAnexo });
  };

  const consultar = (pedido: string) => {
    if (fase) return;
    const conversa = atual ?? criar("organizador");
    setAtualId(conversa.id);
    void enviarAoTime(conversa.id, pedido);
  };

  const exportar = () => {
    if (!atual) return;
    const md = [`# ${atual.titulo || T.chat.novaConversa}`, "", ...atual.mensagens.map((m) => `**${m.autor === "usuario" ? T.barraLateral.perfil : nomes[m.agenteId]}** (${formatar(m.criadaEm, "dd/MM HH:mm")})\n\n${m.texto}\n`)].join("\n");
    baixarArquivo(`conversa-${atual.id.slice(0, 8)}.md`, md, "text/markdown");
  };

  const filtradas = conversas.filter((c) => !busca || contem(c.titulo, busca) || c.mensagens.some((m) => contem(m.texto, busca)));
  const grupos = filtradas.reduce<Record<string, Conversa[]>>((acc, c) => {
    (acc[grupoDaData(c.atualizadaEm)] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="chat">
      <aside className="chat-historico">
        <Botao variante="primario" icone={<Plus size={14} />} onClick={() => { setAtualId(undefined); campo.current?.focus(); }}>{T.chat.novaConversa}</Botao>
        <label className="campo-busca" style={{ maxWidth: "none" }}>
          <Search size={14} />
          <input className="campo" value={busca} maxLength={80} placeholder={T.chat.buscar} aria-label={T.chat.buscar} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <div className="chat-historico-lista">
          {filtradas.length === 0 ? (
            <span className="texto-3" style={{ fontSize: 12, padding: 8 }}>{T.chat.semConversas}</span>
          ) : (
            [T.chat.hoje, T.chat.ontem, T.chat.antes].filter((g) => grupos[g]).map((g) => (
              <div key={g} className="coluna" style={{ gap: 2 }}>
                <span className="rotulo-secao" style={{ padding: "12px 8px 4px" }}>{g}</span>
                {grupos[g].map((c) => (
                  <button key={c.id} type="button" className="lista-lateral-item" aria-current={c.id === atualId} onClick={() => setAtualId(c.id)}>
                    <span className="cortar">{c.titulo || T.chat.novaConversa}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
      <section className="chat-principal" ref={principal}>
        <ZonaDeSoltar ativo={arrastando} agente={mascote} />
        <header className="chat-topo">
          <div className="chat-time">
            {AGENTES.map((a) => <Personagem key={a} agente={a} tamanho={30} halo={false} rotulo={nomes[a]} />)}
          </div>
          <div className="chat-topo-titulo">
            <b className="cortar">{atual?.titulo || T.chat.tituloTime}</b>
            <span className="texto-3 cortar" style={{ fontSize: 11 }}>{AGENTES.map((a) => `${nomes[a]} (${cargos[a]})`).join(", ")}</span>
          </div>
          <button type="button" className={`etiqueta chat-topo-ia ${provedor ? "etiqueta-sucesso" : ""}`} onClick={() => irPara("ia")} title={provedor ? fila.map((p) => `${p.provedor.nome} . ${p.modelo}`).join("\n") : T.chat.configurarIa}>
            {provedor ? <Sparkles size={11} /> : <Terminal size={11} />}
            <span className="cortar">{provedor ? `${provedor.provedor.nome} . ${provedor.modelo}` : T.chat.modoComandos}</span>
            {fila.length > 1 && <span className="chat-topo-reservas">+{fila.length - 1}</span>}
          </button>
          <span className="linha" style={{ flex: "none" }}>
            {atual && <Botao pequeno soIcone variante="fantasma" icone={<Download size={14} />} aria-label={T.chat.exportar} title={T.chat.exportar} onClick={exportar} />}
            {atual && (
              <Botao
                pequeno
                soIcone
                variante="fantasma"
                icone={<Trash2 size={14} />}
                aria-label={T.chat.excluirConversa}
                title={T.chat.excluirConversa}
                onClick={() => {
                  const r = excluir(atual.id);
                  setAtualId(undefined);
                  if (r) avisar(T.geral.excluido, () => { restaurar(r); setAtualId(r.id); });
                }}
              />
            )}
          </span>
        </header>
        <div className="chat-mensagens">
          <div className="chat-coluna">
            {!atual || atual.mensagens.length === 0 ? (
              <div className="chat-boas-vindas">
                <div className="linha" style={{ gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
                  {AGENTES.map((a, i) => (
                    <motion.div key={a} className="coluna" style={{ alignItems: "center", gap: 6 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08 } }}>
                      <Personagem agente={a} tamanho={84} rotulo={nomes[a]} />
                      <b>{nomes[a]}</b>
                      <span className="texto-3" style={{ fontSize: 11 }}>{cargos[a]}</span>
                    </motion.div>
                  ))}
                </div>
                <p className="texto-2" style={{ textAlign: "center" }}>{provedor ? T.chat.boasVindasIa : T.chat.boasVindasSemIa}</p>
                {!provedor && (
                  <Botao pequeno icone={<Settings2 size={13} />} onClick={() => irPara("ia")}>{T.chat.configurarIa}</Botao>
                )}
                <div className="pilulas" style={{ justifyContent: "center" }}>
                  {T.chat.exemplosNaturais.map((c) => (
                    <button key={c} type="button" className="pilula" onClick={() => { setTexto(c); campo.current?.focus(); }}>{c}</button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {atual.mensagens.map((m, i) => (
                  <MensagemChat key={m.id} conversaId={atual.id} m={m} nome={nomes[m.agenteId]} cargo={cargos[m.agenteId]} ultima={i === atual.mensagens.length - 1} />
                ))}
              </AnimatePresence>
            )}
            {atual && <RespostaAoVivo conversaId={atual.id} />}
            <div ref={fim} />
            <RolarParaFim alvo={fim} conversaId={atualId} quantidade={atual?.mensagens.length ?? 0} />
          </div>
        </div>
        <div className="chat-entrada">
          <div className="chat-coluna">
            {mencoes.length > 0 && (
              <div className="chat-sugestoes" role="listbox" aria-label={T.chat.mencionar}>
                {mencoes.map((a, i) => (
                  <button key={a} type="button" role="option" aria-selected={i === ativoMencao} className="paleta-item" onPointerMove={() => setAtivoMencao(i)} onClick={() => escolherMencao(a)}>
                    <Personagem agente={a} tamanho={26} interativo={false} halo={false} olhar={false} />
                    <b>{nomes[a]}</b>
                    <span className="texto-3 cortar">{cargos[a]}: {T.agentes.areas[a]}</span>
                  </button>
                ))}
              </div>
            )}
            {sugestoes.length > 0 && (
              <div className="chat-sugestoes" role="listbox" aria-label={T.chat.comandos}>
                {sugestoes.map((s) => (
                  <button key={s} type="button" role="option" aria-selected="false" className="paleta-item" onClick={() => { setTexto(`${s.split(" ")[0]} `); campo.current?.focus(); }}>
                    <Sparkles size={13} />
                    <code>{s.split(" ")[0]}</code>
                    <span className="texto-3 cortar">{s.split(" ").slice(1).join(" ")}</span>
                  </button>
                ))}
              </div>
            )}
            {anexos.lista.length > 0 ? (
              <div className="painel-anexos">
                <div className="painel-anexos-topo">
                  <Paperclip size={13} />
                  <span>{T.chat.anexos.painelTitulo(anexos.lista.length)}</span>
                </div>
                <ChipsAnexos lista={anexos.lista} agente={mascote} aoRemover={anexos.remover} />
                {anexos.lista.every((a) => a.tipo === "texto" || a.tipo === "imagem") && (
                  <div className="painel-anexos-acoes" role="group" aria-label={T.chat.anexos.acoesRotulo}>
                    <span className="painel-anexos-pergunta">{T.chat.anexos.oQueFazer}</span>
                    <div className="painel-anexos-botoes">
                      {(Object.keys(T.chat.anexos.acoes) as AcaoAnexo[]).map((acao) => {
                        const Icone = ICONES_ACAO_ANEXO[acao];
                        return (
                          <button
                            key={acao}
                            type="button"
                            className="acao-anexo"
                            data-local={acao === "extrair" || undefined}
                            disabled={fase !== null || anexos.carregando || !anexos.prontos().some((a) => a.anexo.texto?.trim() || a.imagemCompleta)}
                            onClick={() => enviar(acao)}
                          >
                            <Icone size={15} />
                            {T.chat.anexos.acoes[acao]}
                          </button>
                        );
                      })}
                    </div>
                    <span className="texto-3 painel-anexos-dica">{T.chat.anexos.ouPergunte} {T.chat.anexos.dicaAcoes}</span>
                  </div>
                )}
              </div>
            ) : (
              !atual?.mensagens.length && (
                <div className="chat-recursos" aria-label={T.chat.recursos.capacidades}>
                  {([["/capacidades", T.chat.recursos.capacidades], ["/relatorio", T.chat.recursos.relatorio], ["/pomodoro status", T.chat.recursos.timer]] as const).map(([pedido, rotulo]) => (
                    <Botao key={pedido} pequeno variante="fantasma" disabled={fase !== null} onClick={() => consultar(pedido)}>{rotulo}</Botao>
                  ))}
                </div>
              )
            )}
            <div className="chat-mascote">
            <div className="chat-caixa">
              <textarea
                ref={campo}
                value={texto}
                rows={1}
                maxLength={4000}
                placeholder={atual?.mensagens.length ? T.chat.continuar : T.chat.mensagemTime}
                aria-label={T.chat.mensagemTime}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (mencoes.length > 0 && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
                    e.preventDefault();
                    if (e.key === "ArrowDown") setAtivoMencao((i) => (i + 1) % mencoes.length);
                    else if (e.key === "ArrowUp") setAtivoMencao((i) => (i - 1 + mencoes.length) % mencoes.length);
                    else if (e.key === "Escape") setTexto((t) => t.replace(/@([\p{L}\d]*)$/u, ""));
                    else escolherMencao(mencoes[ativoMencao] ?? mencoes[0]);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                  if (e.key === "ArrowUp" && !texto && historicoEnvio[0]) {
                    e.preventDefault();
                    setTexto(historicoEnvio[0]);
                  }
                  if (e.ctrlKey && e.key === ".") pararResposta();
                }}
              />
              <div className="linha-entre">
                <span className="texto-3 linha" style={{ fontSize: 11 }}>
                  <input
                    ref={seletorArquivo}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      anexos.adicionar(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                  <Botao pequeno soIcone variante="fantasma" icone={<Paperclip size={14} />} aria-label={T.chat.anexos.anexar} title={T.chat.anexos.anexar} onClick={() => seletorArquivo.current?.click()} />
                  <Info size={12} />
                  <Tecla>/</Tecla>
                  {T.chat.dicaComandos}
                  <Tecla>@</Tecla>
                  {T.chat.dicaMencao}
                </span>
                {fase === "respondendo" ? (
                  <Botao variante="secundario" soIcone icone={<Square size={14} />} aria-label={T.chat.parar} onClick={pararResposta} />
                ) : (
                  <Botao variante="primario" soIcone icone={<Send size={15} />} aria-label={T.chat.enviar} disabled={(!texto.trim() && anexos.lista.length === 0) || anexos.carregando || fase !== null} onClick={() => enviar()} />
                )}
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
