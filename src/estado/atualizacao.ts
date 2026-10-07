import { create } from "zustand";
import { MOVEL, NATIVO } from "../desktop/desktop";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";
import { versaoMaisNova } from "../utilitarios/versoes";
import manifesto from "../../package.json";
import type { Update } from "@tauri-apps/plugin-updater";

type Fase = "nada" | "disponivel" | "baixando" | "instalando" | "erro";
type Verificacao = "nada" | "verificando" | "atualizado" | "sem_versoes" | "disponivel" | "erro";

interface EstadoAtualizacao {
  fase: Fase;
  verificacao: Verificacao;
  versaoAtual: string;
  ultimaVerificacao: string;
  automatica: boolean;
  versao: string;
  notas: string;
  progresso: number;
  erro: string;
  carregarVersao: () => Promise<void>;
  verificar: (manual?: boolean) => Promise<void>;
  instalar: () => Promise<void>;
  dispensar: () => void;
}

let pendente: Update | null = null;
let pacoteMovel = "";
let ouvinteInstalacao: ((evento: Event) => void) | null = null;

const RELEASE = "https://api.github.com/repos/jaimeaugusto11/NIKO-V2/releases/latest";

interface ReleasePublica {
  versao: string | null;
  notas: string;
  apk: string;
}

async function lerReleasePonte(): Promise<ReleasePublica> {
  const resposta = await fetch("/ponte/atualizacao", { headers: { "x-niko": "1" }, signal: AbortSignal.timeout(20000) });
  if (!resposta.ok) throw new Error(`http_${resposta.status}`);
  const dados = await resposta.json() as { versao: string | null; notas: string };
  if (dados.versao !== null && typeof dados.versao !== "string") throw new Error("versao_invalida");
  return { versao: dados.versao, notas: dados.notas, apk: "" };
}

async function lerReleaseGithub(): Promise<ReleasePublica> {
  const resposta = await fetch(RELEASE, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(20000) });
  if (!resposta.ok) throw new Error(`http_${resposta.status}`);
  const dados = await resposta.json() as { tag_name?: string; body?: string | null; assets?: { name?: string; browser_download_url?: string }[] };
  const etiqueta = typeof dados.tag_name === "string" ? dados.tag_name.replace(/^v/, "") : "";
  const apk = (dados.assets ?? []).find((item) => typeof item.name === "string" && /arm64\.apk$/i.test(item.name));
  return { versao: etiqueta || null, notas: dados.body ?? "", apk: apk?.browser_download_url ?? "" };
}

function ouvirInstalacaoMovel(set: (parcial: Partial<EstadoAtualizacao>) => void) {
  if (ouvinteInstalacao) window.removeEventListener("niko-atualizacao", ouvinteInstalacao);
  ouvinteInstalacao = (evento: Event) => {
    const valor = Number((evento as CustomEvent<number>).detail);
    if (valor === -2) set({ fase: "erro", erro: T.atualizacao.permissaoInstalar });
    else if (valor < 0 || Number.isNaN(valor)) set({ fase: "erro", erro: T.atualizacao.erroInstalacao });
    else if (valor >= 1) set({ fase: "instalando", progresso: 1 });
    else set({ progresso: valor });
  };
  window.addEventListener("niko-atualizacao", ouvinteInstalacao);
}

export const useAtualizacao = create<EstadoAtualizacao>()((set, get) => ({
  fase: "nada",
  verificacao: "nada",
  versaoAtual: manifesto.version,
  ultimaVerificacao: "",
  automatica: false,
  versao: "",
  notas: "",
  progresso: 0,
  erro: "",
  carregarVersao: async () => {
    if (!NATIVO) return;
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      set({ versaoAtual: await getVersion() });
    } catch {
      set({ versaoAtual: "", erro: T.atualizacao.versaoFalhou });
    }
  },
  verificar: async (manual = false) => {
    if ((!NATIVO && !manual) || get().verificacao === "verificando" || get().fase === "baixando" || get().fase === "instalando") return;
    set({ verificacao: "verificando", erro: "" });
    try {
      await get().carregarVersao();
      if (!get().versaoAtual) throw new Error("versao_indisponivel");
      const dados = MOVEL ? await lerReleaseGithub() : await lerReleasePonte();
      const anterior = pendente;
      pendente = null;
      pacoteMovel = "";
      await anterior?.close().catch(() => undefined);
      const ultimaVerificacao = new Date().toISOString();
      if (!dados.versao || !versaoMaisNova(dados.versao, get().versaoAtual)) {
        set({ fase: "nada", verificacao: dados.versao ? "atualizado" : "sem_versoes", automatica: false, versao: dados.versao ?? "", notas: dados.notas, ultimaVerificacao });
        return;
      }
      if (MOVEL) {
        pacoteMovel = dados.apk;
        if (dados.apk && get().fase !== "disponivel") void tocarSom("peek", "avisos");
        set({ fase: dados.apk ? "disponivel" : "nada", verificacao: "disponivel", automatica: Boolean(dados.apk), versao: dados.versao, notas: dados.notas, ultimaVerificacao });
        return;
      }
      if (NATIVO) {
        try {
          const { check } = await import("@tauri-apps/plugin-updater");
          pendente = await check({ timeout: 15000 });
        } catch {
          pendente = null;
        }
      }
      if (pendente && get().fase !== "disponivel") void tocarSom("peek", "avisos");
      set({ fase: pendente ? "disponivel" : "nada", verificacao: "disponivel", automatica: Boolean(pendente), versao: pendente?.version ?? dados.versao, notas: pendente?.body ?? dados.notas, ultimaVerificacao });
    } catch {
      set({ verificacao: "erro", erro: get().versaoAtual ? T.atualizacao.erroVerificacao : T.atualizacao.versaoFalhou });
    }
  },
  instalar: async () => {
    if (get().verificacao === "verificando" || get().fase === "baixando" || get().fase === "instalando") return;
    if (MOVEL) {
      const ponte = (window as Window & { NikoAndroid?: { instalarApk?: (url: string) => void } }).NikoAndroid;
      if (!pacoteMovel || !ponte?.instalarApk) {
        set({ fase: "erro", erro: T.atualizacao.erroInstalacao });
        return;
      }
      ouvirInstalacaoMovel(set);
      set({ fase: "baixando", progresso: 0, erro: "" });
      ponte.instalarApk(pacoteMovel);
      return;
    }
    if (!pendente) return;
    set({ fase: "baixando", progresso: 0, erro: "" });
    let total = 0;
    let baixado = 0;
    try {
      await pendente.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        if (e.event === "Progress") {
          baixado += e.data?.chunkLength ?? 0;
          set({ progresso: total > 0 ? Math.min(0.99, baixado / total) : 0.5 });
        }
        if (e.event === "Finished") set({ fase: "instalando", progresso: 1 });
      });
      void tocarSom("approve", "avisos");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      set({ fase: "erro", erro: T.atualizacao.erroInstalacao });
      void tocarSom("error", "avisos");
    }
  },
  dispensar: () => set({ fase: "nada" }),
}));
