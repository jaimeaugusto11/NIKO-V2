import { useEffect, useState } from "react";
import { Maximize2, KeyRound, Pin, PinOff, RefreshCw, TriangleAlert, ShieldCheck, ExternalLink, Plug } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Pilulas, AvisoFaixa, Modal, Campo, LinhaAlternador } from "../../componentes/basicos";
import { Marca } from "../../marcas/Marca";
import { useComunicacao, SERVICOS, CATEGORIA_SERVICO } from "../../estado/comunicacao";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { T } from "../../textos/textos";
import { horarioRelativo } from "../../utilitarios/datas";
import { lerChave } from "../../ponte/armazenamento";
import { conexoesPonte, resumoDe, LINKS_DO_GUIA } from "../../ponte/conexoesReais";
import { sincronizaPeloTelefone, useSincronia } from "../../sincronia/sincronizar";
import { atualizarConexaoAgora } from "../../servicos/servicos";
import { tocarSom } from "../../ponte/sons";
import type { ServicoId } from "../../tipos";

type Filtro = keyof typeof T.conexoes.filtros;

const INTERVALOS = [30, 60, 120, 300, 600];

const REGIOES_AWS: [string, string][] = [
  ["eu-west-1", "Europa (Irlanda)"],
  ["eu-west-2", "Europa (Londres)"],
  ["eu-west-3", "Europa (Paris)"],
  ["eu-central-1", "Europa (Frankfurt)"],
  ["eu-south-2", "Europa (Espanha)"],
  ["eu-north-1", "Europa (Estocolmo)"],
  ["us-east-1", "EUA (Virgínia)"],
  ["us-east-2", "EUA (Ohio)"],
  ["us-west-2", "EUA (Oregon)"],
  ["sa-east-1", "América do Sul (São Paulo)"],
];

function GuiaConexao({ servico }: { servico: ServicoId }) {
  const links = LINKS_DO_GUIA[servico];
  return (
    <section className="guia-conexao" aria-label={T.conexoes.comoConectar}>
      <h3 className="rotulo-secao">{T.conexoes.comoConectar}</h3>
      <ol className="guia-conexao-passos">
        {T.conexoes.guias[servico].map((passo, i) => (
          <li key={i}>
            <div className="guia-conexao-passo">
              <span>{passo}</span>
              {links[i] && (
                <a className="botao botao-secundario botao-pequeno" href={links[i]!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} />
                  {T.conexoes.abrirPasso}
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Configurar({ servico, aoFechar }: { servico: ServicoId | null; aoFechar: () => void }) {
  const conexao = useComunicacao((s) => s.conexoes.find((c) => c.id === servico));
  const atualizar = useComunicacao((s) => s.atualizarConexao);
  const conexoes = useComunicacao((s) => s.conexoes);
  const avisar = useInterface((s) => s.avisar);
  const [chave, setChave] = useState("");
  const [url, setUrl] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [inquilino, setInquilino] = useState("");
  const [idAcesso, setIdAcesso] = useState("");
  const [segredo, setSegredo] = useState("");
  const [sessao, setSessao] = useState("");
  const [regiao, setRegiao] = useState("eu-west-1");
  const [erro, setErro] = useState("");
  const [testando, setTestando] = useState(false);
  useEffect(() => {
    setChave("");
    setErro("");
    setUrl("");
    setClienteId("");
    setInquilino("");
    setIdAcesso("");
    setSegredo("");
    setSessao("");
    setRegiao("eu-west-1");
  }, [servico]);
  if (!servico || !conexao) return <Modal aberto={false} titulo="" aoFechar={aoFechar}>{null}</Modal>;
  const nome = T.conexoes.servicos[servico].nome;
  const fixadas = conexoes.filter((c) => c.fixadaNaIlha).length;
  const google = servico === "gmail" || servico === "gcalendar";
  const microsoft = servico === "microsoft";
  const porLogin = google || microsoft;
  const rotuloDaChave = google ? T.conexoes.segredoCliente : microsoft ? T.conexoes.clienteMicrosoft : servico === "telegram" ? T.conexoes.tokenTelegram : servico === "todoist" ? T.conexoes.tokenTodoist : T.conexoes.chave;
  const dicaDaChave = google ? T.conexoes.gmailDica : microsoft ? T.conexoes.clienteMicrosoftDica : servico === "telegram" ? T.conexoes.tokenTelegramDica : T.conexoes.chaveDica;

  const salvar = async () => {
    if (google && !/\.apps\.googleusercontent\.com$/.test(clienteId.trim())) {
      setErro(T.conexoes.clienteIdInvalido);
      return;
    }
    if (microsoft && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave.trim())) {
      setErro(T.conexoes.clienteMicrosoftInvalido);
      return;
    }
    if (servico === "telegram" && !/^\d{5,15}:[\w-]{30,60}$/.test(chave.trim())) {
      setErro(T.conexoes.tokenTelegramInvalido);
      return;
    }
    if (servico === "aws") {
      if (!/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(idAcesso.trim())) {
        setErro(T.conexoes.awsChaveInvalida);
        return;
      }
      if (segredo.trim().length < 30) {
        setErro(T.conexoes.awsSegredoInvalido);
        return;
      }
      if (idAcesso.trim().startsWith("ASIA") && sessao.trim().length < 16) {
        setErro(T.conexoes.awsSessaoInvalida);
        return;
      }
    } else if (chave.trim().length < 8) {
      setErro(T.conexoes.chaveCurta);
      return;
    }
    setTestando(true);
    setErro("");
    try {
      const extra = servico === "n8n" ? { url: url.trim() } : servico === "aws" ? { segredo: segredo.trim(), url: regiao, sessao: sessao.trim() } : google ? { clienteId: clienteId.trim(), segredo: chave.trim() } : microsoft ? { inquilino: inquilino.trim() } : {};
      await conexoesPonte.salvarChave(servico, servico === "aws" ? idAcesso.trim() : chave.trim(), extra);
      setChave("");
      const dados = await conexoesPonte.ler(servico, true);
      atualizar(servico, { chaveSalva: true, ligada: true, status: "conectado", ultimaAtualizacao: new Date().toISOString(), resumo: resumoDe(servico, dados) });
      avisar(T.conexoes.chaveSalva);
      void tocarSom("approve");
    } catch (e) {
      setErro(T.conexoes.falhaChave((e as Error).message));
      void tocarSom("error", "avisos");
    } finally {
      setTestando(false);
    }
  };

  return (
    <Modal aberto={!!servico} titulo={`${T.janelaConexao.configurar}: ${nome}`} aoFechar={aoFechar}>
      <form className="formulario" noValidate onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <AvisoFaixa>
          <span className="linha"><ShieldCheck size={13} />{T.conexoes.permissao}</span>
          <span>{T.conexoes.permissoes[servico]}</span>
        </AvisoFaixa>
        <GuiaConexao servico={servico} />
        {google && (
          <Campo id="cx-cliente" rotulo={T.conexoes.clienteId} dica={T.conexoes.clienteIdDica}>
            <input id="cx-cliente" className="campo" autoComplete="off" spellCheck={false} value={clienteId} onChange={(e) => setClienteId(e.target.value)} />
          </Campo>
        )}
        {servico === "n8n" && (
          <Campo id="cx-url" rotulo={T.conexoes.urlN8n} dica={T.conexoes.urlN8nDica}>
            <input id="cx-url" className="campo" type="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
          </Campo>
        )}
        {servico === "aws" && (
          <>
            <Campo id="cx-regiao" rotulo={T.conexoes.awsRegiao} dica={T.conexoes.awsRegiaoDica}>
              <select id="cx-regiao" className="seletor" value={regiao} onChange={(e) => setRegiao(e.target.value)}>
                {REGIOES_AWS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
              </select>
            </Campo>
            <Campo id="cx-id-acesso" rotulo={T.conexoes.awsChave} dica={T.conexoes.awsChaveDica}>
              <input id="cx-id-acesso" className="campo" autoComplete="off" spellCheck={false} value={idAcesso} onChange={(e) => { setIdAcesso(e.target.value.trim()); setErro(""); }} />
            </Campo>
            <Campo id="cx-segredo" rotulo={T.conexoes.awsSegredo} erro={erro} dica={T.conexoes.awsSegredoDica}>
              <input id="cx-segredo" className="campo" type="password" autoComplete="off" spellCheck={false} value={segredo} aria-invalid={!!erro} onChange={(e) => { setSegredo(e.target.value); setErro(""); }} />
            </Campo>
            <Campo id="cx-sessao" rotulo={T.conexoes.awsSessao} dica={T.conexoes.awsSessaoDica}>
              <input id="cx-sessao" className="campo" type="password" autoComplete="off" spellCheck={false} value={sessao} onChange={(e) => setSessao(e.target.value)} />
            </Campo>
          </>
        )}
        {servico !== "aws" && <Campo id="cx-chave" rotulo={rotuloDaChave} erro={erro} dica={dicaDaChave}>
          <input
            id="cx-chave"
            className="campo"
            type={microsoft ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={chave}
            placeholder={conexao.chaveSalva ? T.conexoes.chaveGuardada : ""}
            aria-invalid={!!erro}
            onChange={(e) => {
              setChave(e.target.value);
              setErro("");
            }}
          />
        </Campo>}
        {microsoft && (
          <Campo id="cx-inquilino" rotulo={T.conexoes.inquilino} dica={T.conexoes.inquilinoDica}>
            <input id="cx-inquilino" className="campo" autoComplete="off" spellCheck={false} maxLength={100} value={inquilino} onChange={(e) => setInquilino(e.target.value)} />
          </Campo>
        )}
        <div className="linha">
          <Botao type="submit" variante="primario" icone={<KeyRound size={14} />} disabled={testando || (servico === "aws" ? !idAcesso.trim() || !segredo.trim() : !chave.trim())}>
            {testando ? (porLogin ? T.conexoes.aguardandoGoogle : T.conexoes.testando) : google ? T.conexoes.conectarGoogle : microsoft ? T.conexoes.conectarMicrosoft : T.conexoes.salvarChave}
          </Botao>
          {conexao.chaveSalva && (
            <Botao
              variante="perigo"
              onClick={async () => {
                await conexoesPonte.removerChave(servico).catch(() => undefined);
                atualizar(servico, { chaveSalva: false, ligada: false, status: "sem_chave", resumo: "" });
              }}
            >
              {T.conexoes.removerChave}
            </Botao>
          )}
        </div>
        <LinhaAlternador
          rotulo={conexao.ligada ? T.conexoes.desligar : T.conexoes.ligar}
          ligado={conexao.ligada}
          desativado={!conexao.chaveSalva}
          aoMudar={(v) => atualizar(servico, { ligada: v, status: v ? "conectado" : "pausado" })}
        />
        <LinhaAlternador
          rotulo={T.conexoes.fixarNaIlha}
          dica={T.conexoes.limiteIlha}
          ligado={conexao.fixadaNaIlha}
          desativado={!conexao.fixadaNaIlha && fixadas >= 4}
          aoMudar={(v) => atualizar(servico, { fixadaNaIlha: v })}
        />
        <Campo id="cx-int" rotulo={T.conexoes.intervalo}>
          <select id="cx-int" className="seletor" value={conexao.intervalo} onChange={(e) => atualizar(servico, { intervalo: Number(e.target.value) })}>
            {INTERVALOS.map((s) => <option key={s} value={s}>{T.conexoes.segundos(s)}</option>)}
          </select>
        </Campo>
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.fechar}</Botao>
        </div>
      </form>
    </Modal>
  );
}
function configNoComputador(): Record<string, { temChave?: boolean }> {
  try {
    const lido = JSON.parse(lerChave("niko:conexoes-config") ?? "") as Record<string, { temChave?: boolean }>;
    return lido && typeof lido === "object" ? lido : {};
  } catch {
    return {};
  }
}

export default function Conexoes() {
  const parametros = useInterface((s) => s.parametros);
  useSincronia((s) => s.em);
  const peloTelefone = sincronizaPeloTelefone();
  const noComputador = configNoComputador();
  const conexoes = useComunicacao((s) => s.conexoes);
  const eventos = useComunicacao((s) => s.eventosConexao);
  const atualizar = useComunicacao((s) => s.atualizarConexao);
  const abrirJanela = useInterface((s) => s.abrirJanelaConexao);
  const pausadas = useConfig((s) => s.pausarConexoes);
  const definir = useConfig((s) => s.definir);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [configurando, setConfigurando] = useState<ServicoId | null>((parametros.servico as ServicoId) || null);

  useEffect(() => {
    if (peloTelefone) return;
    if (parametros.servico && SERVICOS.includes(parametros.servico as ServicoId)) setConfigurando(parametros.servico as ServicoId);
  }, [parametros, peloTelefone]);

  const lista = SERVICOS.filter((id) => filtro === "todas" || CATEGORIA_SERVICO[id] === filtro);

  return (
    <>
      <CabecalhoAba
        titulo={T.conexoes.titulo}
        subtitulo={T.conexoes.subtitulo}
        agente="java"
        acoes={
          <Botao pequeno variante={pausadas ? "primario" : "secundario"} onClick={() => definir({ pausarConexoes: !pausadas })}>
            {pausadas ? T.conexoes.retomarTudo : T.configuracoes.pausarConexoes}
          </Botao>
        }
      />
      <AvisoFaixa>{peloTelefone ? T.conexoes.soNoComputador : T.conexoes.avisoReal}</AvisoFaixa>
      <Pilulas<Filtro> rotulo={T.conexoes.titulo} valor={filtro} aoMudar={setFiltro} opcoes={(Object.keys(T.conexoes.filtros) as Filtro[]).map((f) => ({ valor: f, rotulo: T.conexoes.filtros[f] }))} />
      <div className="grade">
        {lista.map((id) => {
          const c = conexoes.find((x) => x.id === id)!;
          const salva = c.chaveSalva || Boolean(noComputador[id]?.temChave);
          const servico = T.conexoes.servicos[id];
          const ultimo = eventos.find((e) => e.servico === id);
          const status = pausadas && c.ligada ? "pausado" : c.status;
          return (
            <Cartao key={id} className="col-4 cartao-conexao">
              <div className="linha" style={{ gap: 12, marginBottom: 12 }}>
                <div className="janela-conexao-marca" style={{ width: 40, height: 40, flexBasis: 40 }}>
                  <Marca marca={id} tamanho={20} />
                </div>
                <div className="coluna" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                  <b>{servico.nome}</b>
                  <span className="texto-3 cortar" style={{ fontSize: 12 }}>{servico.descricao}</span>
                </div>
                <span className={`etiqueta ${status === "conectado" ? "etiqueta-sucesso" : status === "erro" ? "etiqueta-erro" : ""}`}>{T.conexoes.status[status]}</span>
              </div>
              <div className="coluna" style={{ gap: 4, minHeight: 52 }}>
                <span className="privado">{c.resumo || T.conexoes.semDados}</span>
                <span className="texto-3" style={{ fontSize: 11 }}>{c.ultimaAtualizacao ? T.conexoes.atualizado(horarioRelativo(c.ultimaAtualizacao)) : T.conexoes.nunca}</span>
                {ultimo && (
                  <span className="linha texto-2 cortar" style={{ fontSize: 12 }}>
                    {ultimo.tipo === "falha" && <TriangleAlert size={12} color="var(--erro)" />}
                    {ultimo.texto} . {horarioRelativo(ultimo.data)}
                  </span>
                )}
              </div>
              <div className="linha" style={{ marginTop: 12, flexWrap: "wrap" }}>
                {peloTelefone ? (
                  salva ? <LinhaAlternador rotulo={T.conexoes.ligada} ligado={c.ligada} aoMudar={(v) => atualizar(id, { ligada: v })} /> : null
                ) : c.chaveSalva ? (
                  <>
                    <Botao pequeno variante="primario" icone={<Maximize2 size={13} />} onClick={() => abrirJanela(id)}>{T.ilha.abrirConexao}</Botao>
                    <Botao pequeno icone={<KeyRound size={13} />} onClick={() => setConfigurando(id)}>{T.janelaConexao.configurar}</Botao>
                  </>
                ) : (
                  <Botao pequeno variante="primario" icone={<Plug size={13} />} onClick={() => setConfigurando(id)}>{T.conexoes.conectar}</Botao>
                )}
                {!peloTelefone && c.chaveSalva && (
                  <>
                    <Botao
                      pequeno
                      soIcone
                      variante="fantasma"
                      icone={<RefreshCw size={13} />}
                      aria-label={T.conexoes.atualizarAgora}
                      title={T.conexoes.atualizarAgora}
                      onClick={() => {
                        void tocarSom("search");
                        void atualizarConexaoAgora(id);
                      }}
                    />
                    <Botao
                      pequeno
                      soIcone
                      variante="fantasma"
                      icone={c.fixadaNaIlha ? <PinOff size={13} /> : <Pin size={13} />}
                      aria-label={T.conexoes.fixarNaIlha}
                      title={T.conexoes.fixarNaIlha}
                      disabled={!c.fixadaNaIlha && conexoes.filter((x) => x.fixadaNaIlha).length >= 4}
                      onClick={() => atualizar(id, { fixadaNaIlha: !c.fixadaNaIlha })}
                    />
                  </>
                )}
              </div>
            </Cartao>
          );
        })}
      </div>
      <Configurar servico={peloTelefone ? null : configurando} aoFechar={() => setConfigurando(null)} />
    </>
  );
}
