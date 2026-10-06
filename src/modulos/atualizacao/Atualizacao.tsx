import { useEffect } from "react";
import { CheckCircle2, Download, ExternalLink, History, RefreshCw } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { AvisoFaixa, Botao, Cartao, Progresso } from "../../componentes/basicos";
import { LogoNiko } from "../../componentes/LogoNiko";
import { Marca } from "../../marcas/Marca";
import { useAtualizacao } from "../../estado/atualizacao";
import { NATIVO } from "../../desktop/desktop";
import { T } from "../../textos/textos";

const REPOSITORIO = "https://github.com/jaimeaugusto11/NIKO-V2";
const VERSOES = `${REPOSITORIO}/releases`;

export default function Atualizacao() {
  const atualizacao = useAtualizacao();
  const ocupada = atualizacao.verificacao === "verificando" || atualizacao.fase === "baixando" || atualizacao.fase === "instalando";
  const disponivel = atualizacao.verificacao === "disponivel";
  const tituloEstado = atualizacao.fase === "baixando" ? T.atualizacao.baixando(Math.round(atualizacao.progresso * 100))
    : atualizacao.fase === "instalando" ? T.atualizacao.instalando
    : atualizacao.verificacao === "verificando" ? T.atualizacao.verificando
    : atualizacao.verificacao === "atualizado" ? T.atualizacao.atualizado
    : atualizacao.verificacao === "sem_versoes" ? T.atualizacao.semVersoes
    : disponivel ? T.atualizacao.disponivel(atualizacao.versao)
    : T.atualizacao.pronto;

  useEffect(() => {
    void useAtualizacao.getState().carregarVersao();
  }, []);

  return (
    <>
      <CabecalhoAba titulo={T.atualizacao.titulo} subtitulo={T.atualizacao.subtitulo} />
      <div className="atualizacao-layout">
        <div className="atualizacao-principal">
        <Cartao>
          <div className="atualizacao-produto">
            <div className="atualizacao-logo"><LogoNiko tamanho={56} /></div>
            <div className="coluna" style={{ gap: 4 }}>
              <h2 className="titulo-secao">{T.app.nome}</h2>
              <span className="texto-2">{T.atualizacao.plataforma}</span>
            </div>
            <div className="atualizacao-versao">
              <span className="rotulo-pequeno">{T.atualizacao.versaoAtual}</span>
              <strong className="numero">{atualizacao.versaoAtual ? `v${atualizacao.versaoAtual}` : T.geral.carregando}</strong>
            </div>
          </div>
          <div className="atualizacao-estado" role="status" aria-live="polite" aria-busy={ocupada}>
            {atualizacao.verificacao === "atualizado" ? <CheckCircle2 size={22} className="atualizacao-ok" /> : disponivel ? <Download size={22} /> : <RefreshCw size={22} className={ocupada ? "atualizacao-girando" : ""} />}
            <span>{tituloEstado}</span>
          </div>
          {atualizacao.erro && <AvisoFaixa tipo="erro">{atualizacao.erro}</AvisoFaixa>}
          {(atualizacao.fase === "baixando" || atualizacao.fase === "instalando") && <Progresso valor={atualizacao.progresso} rotulo={tituloEstado} />}
          <div className="atualizacao-acoes">
            <Botao variante={disponivel ? "secundario" : "primario"} icone={<RefreshCw size={15} />} disabled={ocupada} onClick={() => void atualizacao.verificar(true)}>{atualizacao.verificacao === "verificando" ? T.atualizacao.verificando : T.atualizacao.verificar}</Botao>
            {disponivel && (atualizacao.automatica ? (
              <Botao variante="primario" icone={<Download size={15} />} disabled={ocupada} onClick={() => void atualizacao.instalar()}>{T.atualizacao.instalar}</Botao>
            ) : (
              <a className="botao botao-primario" href={`${VERSOES}/latest`} target="_blank" rel="noopener noreferrer"><Download size={15} />{T.atualizacao.baixarGithub}</a>
            ))}
          </div>
          {disponivel && <p className="texto-3">{atualizacao.automatica ? T.atualizacao.instalacaoDica : NATIVO ? T.atualizacao.baixarManual : T.atualizacao.baixarNavegador}</p>}
          {atualizacao.ultimaVerificacao && <p className="texto-3">{T.atualizacao.ultimaVerificacao}: <time dateTime={atualizacao.ultimaVerificacao}>{new Date(atualizacao.ultimaVerificacao).toLocaleString("pt-BR")}</time></p>}
        </Cartao>
        <div className="atualizacao-links">
          <a href={REPOSITORIO} target="_blank" rel="noopener noreferrer"><Marca marca="github" tamanho={20} monocromatica /><span>{T.atualizacao.github}<small>github.com/jaimeaugusto11/NIKO-V2</small></span><ExternalLink size={14} /></a>
          <a href={VERSOES} target="_blank" rel="noopener noreferrer"><History size={20} /><span>{T.atualizacao.versoes}<small>{T.app.nome}</small></span><ExternalLink size={14} /></a>
        </div>
        </div>
        <Cartao>
          <div className="atualizacao-criador">
            <img className="atualizacao-foto" src="/criador-vitor.jpg" width={88} height={88} alt={T.atualizacao.fotoCriador} />
            <span className="rotulo-pequeno">{T.atualizacao.criador}</span>
            <h2 className="titulo-secao">{T.atualizacao.nomeCriador}</h2>
            <p className="texto-2">{T.atualizacao.descricaoCriador}</p>
          </div>
          <div className="atualizacao-criador atualizacao-contribuidor">
            <span className="atualizacao-foto atualizacao-iniciais" aria-hidden="true">{T.atualizacao.iniciaisContribuidor}</span>
            <span className="rotulo-pequeno">{T.atualizacao.contribuidor}</span>
            <h2 className="titulo-secao">{T.atualizacao.nomeContribuidor}</h2>
            <span className="texto-3">{T.atualizacao.usuarioContribuidor}</span>
            <a className="botao botao-secundario" href="https://github.com/jaimeaugusto11" target="_blank" rel="noopener noreferrer"><Marca marca="github" tamanho={16} monocromatica />{T.atualizacao.githubContribuidor}<ExternalLink size={13} /></a>
          </div>
        </Cartao>
        {disponivel && atualizacao.notas && <div className="atualizacao-notas"><Cartao titulo={T.atualizacao.novidades}><p>{atualizacao.notas}</p></Cartao></div>}
      </div>
    </>
  );
}
