import { useIlha } from "../estado/ilha";
import { useConfig } from "../estado/configuracoes";
import { ouvirSocial, social, tituloDaConversa, type ConversaSocial, type EventoSocial } from "../ponte/social";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";

let eu: string | undefined;
let conversas: ConversaSocial[] = [];

async function atualizar() {
  try {
    const estado = await social.estado();
    eu = estado.usuario?.id;
    conversas = eu ? (await social.conversas()).conversas : [];
  } catch {
    eu = undefined;
  }
}

async function aoReceber(e: EventoSocial) {
  if (e.tipo === "sessao" || e.tipo === "conversas") return void atualizar();
  if (e.tipo !== "mensagem" || !eu || e.mensagem.autorId === eu || useConfig.getState().naoPerturbe) return;
  if (!conversas.some((c) => c.id === e.mensagem.conversaId)) await atualizar();
  const conversa = conversas.find((c) => c.id === e.mensagem.conversaId);
  const autor = conversa?.participantes.find((p) => p.id === e.mensagem.autorId)?.nome ?? "";
  const origem = conversa?.tipo === "grupo" ? `${autor} . ${tituloDaConversa(conversa, eu)}` : autor;
  const texto = e.mensagem.texto.length > 80 ? `${e.mensagem.texto.slice(0, 77)}...` : e.mensagem.texto;
  useIlha.getState().revelar({ texto: `${T.social.novaMensagem(origem)}: ${texto}`, tipo: "sucesso", aba: "chat" }, 4500, "alta");
  void tocarSom("pop", "avisos");
}

/** Avisa na ilha principal quando chega uma mensagem de outra pessoa, mesmo com o Chat fechado. */
export function avisarMensagensSociais(): () => void {
  void atualizar();
  return ouvirSocial((e) => void aoReceber(e));
}
