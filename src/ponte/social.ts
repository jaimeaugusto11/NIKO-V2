import { T } from "../textos/textos";

export interface PessoaSocial {
  id: string;
  nome: string;
  email: string;
}

export interface MensagemSocial {
  id: string;
  conversaId: string;
  autorId: string;
  texto: string;
  criadaEm: string;
}

export interface ConversaSocial {
  id: string;
  tipo: "direta" | "grupo";
  nome: string | null;
  atualizadaEm: string;
  participantes: PessoaSocial[];
  ultima: { texto: string; autorId: string; criadaEm: string } | null;
  naoLidas: number;
}

export type EventoSocial = { tipo: "mensagem"; mensagem: MensagemSocial } | { tipo: "conversas" } | { tipo: "sessao" } | { tipo: "conectado" } | { tipo: "dados" };

const CABECALHOS = { "x-niko": "1", "content-type": "application/json" };

async function pedir<R>(caminho: string, corpo?: unknown): Promise<R> {
  const r = await fetch(`/ponte/social/${caminho}`, corpo === undefined ? { headers: CABECALHOS } : { method: "POST", headers: CABECALHOS, body: JSON.stringify(corpo) });
  const json = (await r.json().catch(() => ({}))) as R & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export const social = {
  estado: () => pedir<{ configurado: boolean; usuario: PessoaSocial | null }>("estado"),
  registar: (nome: string, email: string, senha: string) => pedir<{ ok: boolean; confirmarEmail: boolean }>("registar", { nome, email, senha }),
  entrar: (email: string, senha: string) => pedir<{ ok: boolean; usuario: PessoaSocial | null }>("entrar", { email, senha }),
  sair: () => pedir<{ ok: boolean }>("sair", {}),
  conversas: () => pedir<{ conversas: ConversaSocial[] }>("conversas"),
  mensagens: (conversa: string, antes?: string) => pedir<{ mensagens: MensagemSocial[]; temMais: boolean }>(`mensagens?conversa=${encodeURIComponent(conversa)}${antes ? `&antes=${encodeURIComponent(antes)}` : ""}`),
  enviar: (conversa: string, texto: string) => pedir<{ mensagem: MensagemSocial }>("enviar", { conversa, texto }),
  abrirDireta: (email: string) => pedir<{ conversa: string }>("direta", { email }),
  criarGrupo: (nome: string, emails: string[]) => pedir<{ conversa: string }>("grupo", { nome, emails }),
  adicionar: (conversa: string, email: string) => pedir<{ ok: boolean }>("adicionar", { conversa, email }),
  sairDaConversa: (conversa: string) => pedir<{ ok: boolean }>("sair-da-conversa", { conversa }),
  marcarLida: (conversa: string) => pedir<{ ok: boolean }>("lida", { conversa }),
};

/** Recebe as mensagens novas em tempo real pela ponte e volta a ligar sozinho quando a ligação cai. */
export function ouvirSocial(aoReceber: (e: EventoSocial) => void): () => void {
  let vivo = true;
  let controle: AbortController | null = null;
  let espera = 1000;
  let temporizador = 0;
  const conectar = async () => {
    if (!vivo) return;
    controle = new AbortController();
    try {
      const r = await fetch("/ponte/social/eventos", { headers: { "x-niko": "1" }, signal: controle.signal });
      if (!r.ok || !r.body) throw new Error(`http_${r.status}`);
      espera = 1000;
      const leitor = r.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          try {
            aoReceber(JSON.parse(linha) as EventoSocial);
          } catch {
            continue;
          }
        }
      }
    } catch {
      if (!vivo) return;
    }
    if (!vivo) return;
    temporizador = window.setTimeout(() => void conectar(), espera);
    espera = Math.min(espera * 2, 30000);
  };
  void conectar();
  return () => {
    vivo = false;
    window.clearTimeout(temporizador);
    controle?.abort();
  };
}

export function tituloDaConversa(c: ConversaSocial, eu: string | undefined): string {
  if (c.tipo === "grupo") return c.nome || T.social.grupo;
  const outro = c.participantes.find((p) => p.id !== eu);
  return outro?.nome || outro?.email || T.social.conversa;
}
