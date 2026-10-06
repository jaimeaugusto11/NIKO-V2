import { create } from "zustand";
import { social, type ConversaSocial, type EventoSocial, type MensagemSocial, type PessoaSocial } from "../ponte/social";

export type SituacaoSocial = "carregando" | "desconfigurado" | "fora" | "dentro" | "sem_ponte";

interface EstadoSocial {
  situacao: SituacaoSocial;
  usuario: PessoaSocial | null;
  conversas: ConversaSocial[];
  mensagens: Record<string, MensagemSocial[]>;
  temMais: Record<string, boolean>;
  aberta: string | null;
  iniciar: () => Promise<void>;
  entrar: (email: string, senha: string) => Promise<void>;
  registar: (nome: string, email: string, senha: string) => Promise<{ confirmarEmail: boolean }>;
  sair: () => Promise<void>;
  carregarConversas: () => Promise<void>;
  abrir: (id: string | null) => Promise<void>;
  carregarAnteriores: (id: string) => Promise<void>;
  enviar: (id: string, texto: string) => Promise<void>;
  receber: (e: EventoSocial) => void;
}

function juntar(lista: MensagemSocial[], novas: MensagemSocial[]): MensagemSocial[] {
  const vistas = new Set(lista.map((m) => m.id));
  return [...lista, ...novas.filter((m) => !vistas.has(m.id))].sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
}

export const useSocial = create<EstadoSocial>()((set, get) => ({
  situacao: "carregando",
  usuario: null,
  conversas: [],
  mensagens: {},
  temMais: {},
  aberta: null,

  iniciar: async () => {
    try {
      const r = await social.estado();
      if (!r.configurado) return set({ situacao: "desconfigurado", usuario: null });
      set({ situacao: r.usuario ? "dentro" : "fora", usuario: r.usuario });
      if (r.usuario) await get().carregarConversas();
    } catch {
      set({ situacao: "sem_ponte" });
    }
  },

  entrar: async (email, senha) => {
    const r = await social.entrar(email, senha);
    set({ situacao: "dentro", usuario: r.usuario, mensagens: {}, temMais: {}, aberta: null });
    await get().carregarConversas();
  },

  registar: async (nome, email, senha) => {
    const r = await social.registar(nome, email, senha);
    if (!r.confirmarEmail) await get().iniciar();
    return { confirmarEmail: r.confirmarEmail };
  },

  sair: async () => {
    await social.sair();
    set({ situacao: "fora", usuario: null, conversas: [], mensagens: {}, temMais: {}, aberta: null });
  },

  carregarConversas: async () => {
    const { conversas } = await social.conversas();
    const aberta = get().aberta;
    set({ conversas: conversas.map((c) => (c.id === aberta ? { ...c, naoLidas: 0 } : c)) });
  },

  abrir: async (id) => {
    set({ aberta: id });
    if (!id) return;
    set((s) => ({ conversas: s.conversas.map((c) => (c.id === id ? { ...c, naoLidas: 0 } : c)) }));
    const { mensagens, temMais } = await social.mensagens(id);
    set((s) => ({ mensagens: { ...s.mensagens, [id]: juntar(s.mensagens[id] ?? [], mensagens) }, temMais: { ...s.temMais, [id]: temMais } }));
    void social.marcarLida(id).catch(() => undefined);
  },

  carregarAnteriores: async (id) => {
    const primeira = get().mensagens[id]?.[0];
    if (!primeira) return;
    const { mensagens, temMais } = await social.mensagens(id, primeira.criadaEm);
    set((s) => ({ mensagens: { ...s.mensagens, [id]: juntar(s.mensagens[id] ?? [], mensagens) }, temMais: { ...s.temMais, [id]: temMais } }));
  },

  enviar: async (id, texto) => {
    const { mensagem } = await social.enviar(id, texto);
    get().receber({ tipo: "mensagem", mensagem });
  },

  receber: (e) => {
    if (e.tipo === "sessao") {
      void get().iniciar();
      return;
    }
    if (e.tipo === "conversas") {
      if (get().situacao === "dentro") void get().carregarConversas().catch(() => undefined);
      return;
    }
    if (e.tipo !== "mensagem") return;
    const m = e.mensagem;
    const { aberta, conversas, usuario } = get();
    const conhecida = conversas.some((c) => c.id === m.conversaId);
    const minha = m.autorId === usuario?.id;
    set((s) => ({
      mensagens: s.mensagens[m.conversaId] ? { ...s.mensagens, [m.conversaId]: juntar(s.mensagens[m.conversaId], [m]) } : s.mensagens,
      conversas: s.conversas
        .map((c) => (c.id === m.conversaId ? { ...c, ultima: { texto: m.texto, autorId: m.autorId, criadaEm: m.criadaEm }, atualizadaEm: m.criadaEm, naoLidas: minha || aberta === c.id ? 0 : c.naoLidas + 1 } : c))
        .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm)),
    }));
    if (!conhecida) void get().carregarConversas().catch(() => undefined);
    if (aberta === m.conversaId && !minha) void social.marcarLida(m.conversaId).catch(() => undefined);
  },
}));

export function naoLidasSociais(conversas: ConversaSocial[]): number {
  return conversas.reduce((total, c) => total + c.naoLidas, 0);
}
