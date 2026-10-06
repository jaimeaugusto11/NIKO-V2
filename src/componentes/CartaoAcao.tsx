import { useEffect } from "react";
import { motion } from "motion/react";
import { Check, ShieldCheck, X } from "lucide-react";
import type { CartaoConfirmacao, Mensagem } from "../tipos";
import { linhasDaConfirmacao } from "../utilitarios/comandos";
import { decidirCartao } from "../estado/conversando";
import { useConfig } from "../estado/configuracoes";
import { T } from "../textos/textos";

function digitandoEmCampo(e: KeyboardEvent): boolean {
  const alvo = e.target as HTMLElement | null;
  return !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
}

function Cartao({ cartao, aoDecidir, aoSempre, compacto, atalhos, agenteNome }: { cartao: CartaoConfirmacao; aoDecidir: (aceitar: boolean) => void; aoSempre: () => void; compacto?: boolean; atalhos: boolean; agenteNome: string }) {
  const pendente = cartao.situacao === "pendente";
  const linhas = linhasDaConfirmacao(cartao);

  useEffect(() => {
    if (!pendente || !atalhos) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (digitandoEmCampo(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "y" || e.key === "Y" || e.key === "s" || e.key === "S") aoDecidir(true);
      if (e.key === "n" || e.key === "N") aoDecidir(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pendente, atalhos, aoDecidir]);

  return (
    <motion.div
      className={`chat-confirmacao cartao-permissao${compacto ? " chat-confirmacao-compacta" : ""}`}
      data-situacao={cartao.situacao}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", visualDuration: 0.3, bounce: 0.3 }}
    >
      <span className="permissao-lavagem" aria-hidden="true" />
      <div className="permissao-quem">
        <span className="permissao-ponto" />
        <b>{agenteNome}</b>
        <span>{pendente ? T.chat.permissao.precisa : cartao.situacao === "confirmado" ? T.chat.confirmado : T.chat.cancelado}</span>
      </div>
      <code className="permissao-codigo">{T.chat.permissao.acoes[cartao.tipo]} · {linhas[0]?.[1] ?? ""}</code>
      {linhas.length > 1 && (
        <dl>
          {linhas.slice(1).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="privado">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {pendente && (
        <div className="permissao-botoes">
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => aoDecidir(false)}>
            <X size={13} />
            {T.chat.permissao.recusar}
            {atalhos && <kbd>N</kbd>}
          </button>
          <button type="button" className="botao botao-primario botao-pequeno" onClick={() => aoDecidir(true)}>
            <Check size={13} />
            {T.chat.permissao.permitir}
            {atalhos && <kbd>Y</kbd>}
          </button>
          <button type="button" className="botao botao-fantasma botao-pequeno" title={T.chat.permissao.sempreDica} onClick={aoSempre}>
            <ShieldCheck size={13} />
            {T.chat.permissao.sempre}
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function CartoesDaMensagem({ conversaId, mensagem, compacto, atalhos = false }: { conversaId: string; mensagem: Mensagem; compacto?: boolean; atalhos?: boolean }) {
  const nome = useConfig((s) => s.agentes.nomes[mensagem.agenteId]);
  const sempre = (cartao: CartaoConfirmacao, indice: number | null) => {
    const ia = useConfig.getState().ia;
    if (!ia.autoAprovar.includes(cartao.tipo)) useConfig.getState().definir({ ia: { ...ia, autoAprovar: [...ia.autoAprovar, cartao.tipo] } });
    decidirCartao(conversaId, mensagem, indice, true);
  };
  const primeiroPendente = mensagem.confirmacao?.situacao === "pendente" ? -1 : mensagem.confirmacoes?.findIndex((c) => c.situacao === "pendente") ?? -2;
  return (
    <>
      {mensagem.confirmacao && <Cartao cartao={mensagem.confirmacao} agenteNome={nome} compacto={compacto} atalhos={atalhos && primeiroPendente === -1} aoSempre={() => sempre(mensagem.confirmacao!, null)} aoDecidir={(a) => decidirCartao(conversaId, mensagem, null, a)} />}
      {mensagem.confirmacoes?.map((c, i) => (
        <Cartao key={i} cartao={c} agenteNome={nome} compacto={compacto} atalhos={atalhos && primeiroPendente === i} aoSempre={() => sempre(c, i)} aoDecidir={(a) => decidirCartao(conversaId, mensagem, i, a)} />
      ))}
    </>
  );
}
