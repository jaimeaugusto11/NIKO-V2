import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, MessageSquarePlus, Send, UserPlus, Users } from "lucide-react";
import { AvisoFaixa, Botao, Campo, Modal, Segmentado, Vazio } from "../../componentes/basicos";
import { useSocial } from "../../estado/social";
import { useInterface } from "../../estado/interface";
import { ouvirSocial, social, tituloDaConversa, type ConversaSocial } from "../../ponte/social";
import { tocarSom } from "../../ponte/sons";
import { horarioRelativo } from "../../utilitarios/datas";
import { T } from "../../textos/textos";

const S = T.social;

export type ModoDoChat = "time" | "pessoas";

export function SeletorDoChat({ valor, aoMudar }: { valor: ModoDoChat; aoMudar: (m: ModoDoChat) => void }) {
  const naoLidas = useSocial((s) => s.conversas.reduce((total, c) => total + c.naoLidas, 0));
  return (
    <Segmentado<ModoDoChat>
      rotulo={S.pessoas}
      valor={valor}
      aoMudar={aoMudar}
      opcoes={[
        { valor: "time", rotulo: S.time },
        { valor: "pessoas", rotulo: naoLidas ? `${S.pessoas} (${naoLidas})` : S.pessoas },
      ]}
    />
  );
}

const separarEmails = (texto: string) => texto.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

function Autenticacao() {
  const entrar = useSocial((s) => s.entrar);
  const registar = useSocial((s) => s.registar);
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const enviar = async () => {
    setErro("");
    setAviso("");
    setOcupado(true);
    try {
      if (modo === "entrar") await entrar(email.trim(), senha);
      else {
        const r = await registar(nome.trim(), email.trim(), senha);
        if (r.confirmarEmail) {
          setAviso(S.confirmeEmail);
          setModo("entrar");
        }
      }
      setSenha("");
    } catch (e) {
      setErro(S.erro((e as Error).message));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="chat-pessoas-auth">
      <h2 className="titulo-secao">{S.tituloAuth}</h2>
      <p className="texto-2">{S.dicaAuth}</p>
      <Segmentado<"entrar" | "criar"> rotulo={S.entrar} valor={modo} aoMudar={(m) => { setModo(m); setErro(""); }} opcoes={[{ valor: "entrar", rotulo: S.entrar }, { valor: "criar", rotulo: S.criarConta }]} />
      {aviso && <AvisoFaixa>{aviso}</AvisoFaixa>}
      <form className="formulario" noValidate onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        {modo === "criar" && (
          <Campo id="sc-nome" rotulo={S.nome}>
            <input id="sc-nome" className="campo" autoComplete="name" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
        )}
        <Campo id="sc-email" rotulo={S.email}>
          <input id="sc-email" className="campo" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo id="sc-senha" rotulo={S.senha} dica={modo === "criar" ? S.senhaDica : undefined} erro={erro}>
          <input id="sc-senha" className="campo" type="password" autoComplete={modo === "criar" ? "new-password" : "current-password"} maxLength={72} value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Botao type="submit" variante="primario" disabled={ocupado || !email.trim() || !senha || (modo === "criar" && !nome.trim())}>
          {ocupado ? (modo === "entrar" ? S.entrando : S.criando) : modo === "entrar" ? S.entrar : S.criarConta}
        </Botao>
      </form>
      <span className="texto-3" style={{ fontSize: 12 }}>{S.privacidade}</span>
    </div>
  );
}

function NovaConversa({ tipo, aoFechar, aoCriar }: { tipo: "direta" | "grupo" | null; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const [nome, setNome] = useState("");
  const [emails, setEmails] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    setNome("");
    setEmails("");
    setErro("");
  }, [tipo]);
  const criar = async () => {
    setOcupado(true);
    setErro("");
    try {
      const r = tipo === "grupo" ? await social.criarGrupo(nome.trim(), separarEmails(emails)) : await social.abrirDireta(emails.trim());
      await useSocial.getState().carregarConversas();
      aoCriar(r.conversa);
    } catch (e) {
      setErro(S.erro((e as Error).message));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal aberto={tipo !== null} titulo={tipo === "grupo" ? S.novoGrupo : S.novaConversa} aoFechar={aoFechar}>
      <form className="formulario" noValidate onSubmit={(e) => { e.preventDefault(); void criar(); }}>
        {tipo === "grupo" && (
          <Campo id="sc-grupo" rotulo={S.nomeDoGrupo}>
            <input id="sc-grupo" className="campo" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
        )}
        <Campo id="sc-emails" rotulo={tipo === "grupo" ? S.membros : S.emailDaPessoa} dica={tipo === "grupo" ? S.membrosDica : S.emailDaPessoaDica} erro={erro}>
          {tipo === "grupo" ? (
            <textarea id="sc-emails" className="campo" rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} />
          ) : (
            <input id="sc-emails" className="campo" type="email" maxLength={254} value={emails} onChange={(e) => setEmails(e.target.value)} />
          )}
        </Campo>
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario" disabled={ocupado || !emails.trim() || (tipo === "grupo" && !nome.trim())}>{tipo === "grupo" ? S.criarGrupo : S.abrirConversa}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function Conversa({ conversa }: { conversa: ConversaSocial }) {
  const usuario = useSocial((s) => s.usuario);
  const mensagens = useSocial((s) => s.mensagens[conversa.id]);
  const temMais = useSocial((s) => s.temMais[conversa.id]);
  const enviar = useSocial((s) => s.enviar);
  const carregarAnteriores = useSocial((s) => s.carregarAnteriores);
  const abrir = useSocial((s) => s.abrir);
  const avisar = useInterface((s) => s.avisar);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [emailNovo, setEmailNovo] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const titulo = tituloDaConversa(conversa, usuario?.id);
  const grupo = conversa.tipo === "grupo";
  const nomeDe = (id: string) => (id === usuario?.id ? S.voce : conversa.participantes.find((p) => p.id === id)?.nome ?? "");

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens?.length, conversa.id]);

  const mandar = async () => {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setEnviando(true);
    try {
      await enviar(conversa.id, limpo);
      setTexto("");
      void tocarSom("send");
    } catch (e) {
      avisar(S.erro((e as Error).message));
    } finally {
      setEnviando(false);
    }
  };

  const adicionar = async () => {
    try {
      await social.adicionar(conversa.id, emailNovo.trim());
      await useSocial.getState().carregarConversas();
      avisar(S.pessoaAdicionada);
      setAdicionando(false);
      setEmailNovo("");
    } catch (e) {
      avisar(S.erro((e as Error).message));
    }
  };

  const sairDoGrupo = async () => {
    if (!window.confirm(S.confirmarSaida(titulo))) return;
    try {
      await social.sairDaConversa(conversa.id);
      await abrir(null);
      await useSocial.getState().carregarConversas();
    } catch (e) {
      avisar(S.erro((e as Error).message));
    }
  };

  return (
    <>
      <header className="chat-topo">
        <div className="chat-topo-titulo">
          <b className="cortar">{titulo}</b>
          <span className="texto-3 cortar" style={{ fontSize: 11 }}>{grupo ? `${S.participantes(conversa.participantes.length)}: ${conversa.participantes.map((p) => (p.id === usuario?.id ? S.voce : p.nome)).join(", ")}` : conversa.participantes.find((p) => p.id !== usuario?.id)?.email}</span>
        </div>
        {grupo && (
          <div className="linha empurrar">
            <Botao pequeno icone={<UserPlus size={13} />} onClick={() => setAdicionando(true)}>{S.adicionarPessoa}</Botao>
            <Botao pequeno variante="fantasma" icone={<LogOut size={13} />} onClick={() => void sairDoGrupo()}>{S.sairDoGrupo}</Botao>
          </div>
        )}
      </header>
      <div className="chat-mensagens">
        <div className="chat-coluna">
          {temMais && <Botao pequeno variante="fantasma" onClick={() => void carregarAnteriores(conversa.id)}>{S.anteriores}</Botao>}
          {(mensagens ?? []).map((m) => {
            const minha = m.autorId === usuario?.id;
            return (
              <div key={m.id} className={`chat-mensagem ${minha ? "chat-usuario" : "chat-agente"}`}>
                <div className="chat-bolha">
                  {grupo && !minha && <span className="chat-autor">{nomeDe(m.autorId)}</span>}
                  <div className="chat-texto chat-pessoas-texto">{m.texto}</div>
                  <span className="texto-3" style={{ fontSize: 11 }}>{horarioRelativo(m.criadaEm)}</span>
                </div>
              </div>
            );
          })}
          <div ref={fim} />
        </div>
      </div>
      <form className="chat-entrada" onSubmit={(e) => { e.preventDefault(); void mandar(); }}>
        <div className="chat-caixa">
          <textarea
            className="campo"
            rows={1}
            maxLength={4000}
            value={texto}
            placeholder={S.escrever}
            aria-label={S.escrever}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void mandar();
              }
            }}
          />
          <Botao type="submit" variante="primario" soIcone icone={<Send size={15} />} aria-label={S.enviar} title={S.enviar} disabled={enviando || !texto.trim()} />
        </div>
      </form>
      <Modal aberto={adicionando} titulo={S.adicionarPessoa} aoFechar={() => setAdicionando(false)}>
        <form className="formulario" noValidate onSubmit={(e) => { e.preventDefault(); void adicionar(); }}>
          <Campo id="sc-adicionar" rotulo={S.emailDaPessoa} dica={S.emailDaPessoaDica}>
            <input id="sc-adicionar" className="campo" type="email" maxLength={254} value={emailNovo} onChange={(e) => setEmailNovo(e.target.value)} />
          </Campo>
          <div className="formulario-acoes">
            <Botao onClick={() => setAdicionando(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario" disabled={!emailNovo.trim()}>{S.adicionar}</Botao>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ChatPessoas({ seletor }: { seletor: ReactNode }) {
  const situacao = useSocial((s) => s.situacao);
  const usuario = useSocial((s) => s.usuario);
  const conversas = useSocial((s) => s.conversas);
  const aberta = useSocial((s) => s.aberta);
  const abrir = useSocial((s) => s.abrir);
  const sair = useSocial((s) => s.sair);
  const [nova, setNova] = useState<"direta" | "grupo" | null>(null);

  useEffect(() => {
    void useSocial.getState().iniciar();
    return ouvirSocial((e) => useSocial.getState().receber(e));
  }, []);

  const atual = conversas.find((c) => c.id === aberta);
  const dentro = situacao === "dentro";

  return (
    <div className="chat">
      <aside className="chat-historico">
        {seletor}
        {dentro && (
          <>
            <div className="linha">
              <Botao variante="primario" icone={<MessageSquarePlus size={14} />} onClick={() => setNova("direta")}>{S.novaConversa}</Botao>
              <Botao soIcone icone={<Users size={14} />} aria-label={S.novoGrupo} title={S.novoGrupo} onClick={() => setNova("grupo")} />
            </div>
            <div className="chat-historico-lista">
              {conversas.length === 0 ? (
                <span className="texto-3" style={{ fontSize: 12, padding: 8 }}>{S.semConversas}</span>
              ) : (
                conversas.map((c) => (
                  <button key={c.id} type="button" className="lista-lateral-item chat-pessoas-item" aria-current={c.id === aberta} onClick={() => void abrir(c.id)}>
                    <span className="coluna" style={{ gap: 0, minWidth: 0, flex: 1, alignItems: "flex-start" }}>
                      <span className="linha cortar" style={{ fontWeight: c.naoLidas ? 600 : 400 }}>
                        {c.tipo === "grupo" && <Users size={12} />}
                        {tituloDaConversa(c, usuario?.id)}
                      </span>
                      {c.ultima && <span className="texto-3 cortar" style={{ fontSize: 11, maxWidth: "100%" }}>{c.ultima.texto}</span>}
                    </span>
                    {c.naoLidas > 0 && <span className="etiqueta etiqueta-alerta">{c.naoLidas}</span>}
                  </button>
                ))
              )}
            </div>
            <div className="chat-pessoas-conta">
              <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
                <b className="cortar">{usuario?.nome}</b>
                <span className="texto-3 cortar" style={{ fontSize: 11 }}>{usuario?.email}</span>
              </span>
              <Botao pequeno soIcone variante="fantasma" icone={<LogOut size={13} />} aria-label={S.sair} title={S.sair} onClick={() => void sair()} />
            </div>
          </>
        )}
      </aside>
      <section className="chat-principal">
        {situacao === "carregando" ? (
          <Vazio titulo={S.carregando} />
        ) : situacao === "sem_ponte" ? (
          <Vazio titulo={S.semPonte} />
        ) : situacao === "desconfigurado" ? (
          <Vazio titulo={S.desconfigurado} texto={S.desconfiguradoDica} />
        ) : situacao === "fora" ? (
          <Autenticacao />
        ) : atual ? (
          <Conversa key={atual.id} conversa={atual} />
        ) : (
          <Vazio icone={<MessageSquarePlus size={28} />} titulo={S.escolha} texto={S.escolhaDica} acao={<Botao variante="primario" onClick={() => setNova("direta")}>{S.novaConversa}</Botao>} />
        )}
      </section>
      <NovaConversa
        tipo={nova}
        aoFechar={() => setNova(null)}
        aoCriar={(id) => {
          setNova(null);
          void abrir(id);
        }}
      />
    </div>
  );
}
