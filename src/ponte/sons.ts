export type NomeSom =
  | "annoyed" | "approval" | "approve" | "attach" | "blip" | "close" | "dizzy"
  | "error" | "finish" | "greet" | "gulp" | "hover" | "love" | "open"
  | "peek" | "pop" | "proud" | "question" | "rate" | "search" | "send"
  | "slap" | "sleep" | "think" | "tick" | "wink" | "work" | "yawn";

export type CategoriaSom = "personagens" | "avisos" | "pomodoro" | "interface";

export const TODOS_OS_SONS: NomeSom[] = [
  "annoyed", "approval", "approve", "attach", "blip", "close", "dizzy",
  "error", "finish", "greet", "gulp", "hover", "love", "open",
  "peek", "pop", "proud", "question", "rate", "search", "send",
  "slap", "sleep", "think", "tick", "wink", "work", "yawn",
];

interface PreferenciasSom {
  ligado: boolean;
  volume: number;
  categorias: Record<CategoriaSom, boolean>;
  silencioFoco: boolean;
}

let preferencias: PreferenciasSom = {
  ligado: true,
  volume: 0.15,
  categorias: { personagens: true, avisos: true, pomodoro: true, interface: true },
  silencioFoco: false,
};

let contexto: AudioContext | null = null;
let ganho: GainNode | null = null;
let temporizadorFechar: number | undefined;
const buffers = new Map<NomeSom, AudioBuffer>();
const carregando = new Map<NomeSom, Promise<AudioBuffer | null>>();
const ultimoToque = new Map<NomeSom, number>();

export function definirPreferenciasSom(novas: PreferenciasSom) {
  preferencias = novas;
  if (ganho) ganho.gain.value = novas.volume;
}

function obterContexto(): AudioContext | null {
  if (contexto) return contexto;
  try {
    contexto = new AudioContext();
    ganho = contexto.createGain();
    ganho.gain.value = preferencias.volume;
    ganho.connect(contexto.destination);
    return contexto;
  } catch {
    return null;
  }
}

function agendarFechamento() {
  window.clearTimeout(temporizadorFechar);
  temporizadorFechar = window.setTimeout(() => {
    if (contexto && contexto.state === "running") void contexto.suspend();
  }, 30000);
}

async function carregar(nome: NomeSom): Promise<AudioBuffer | null> {
  const pronto = buffers.get(nome);
  if (pronto) return pronto;
  const emAndamento = carregando.get(nome);
  if (emAndamento) return emAndamento;
  const ctx = obterContexto();
  if (!ctx) return null;
  const promessa = fetch(`/sons/${nome}.wav`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("som"))))
    .then((dados) => ctx.decodeAudioData(dados))
    .then((buffer) => {
      buffers.set(nome, buffer);
      return buffer;
    })
    .catch(() => null)
    .finally(() => carregando.delete(nome));
  carregando.set(nome, promessa);
  return promessa;
}

export async function tocarSom(nome: NomeSom, categoria: CategoriaSom = "interface") {
  if (!preferencias.ligado || !preferencias.categorias[categoria]) return;
  if (preferencias.silencioFoco && categoria !== "pomodoro") return;
  if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const agora = performance.now();
  if (agora - (ultimoToque.get(nome) ?? 0) < 400) return;
  ultimoToque.set(nome, agora);
  const ctx = obterContexto();
  if (!ctx || !ganho) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const buffer = await carregar(nome);
    if (!buffer) return;
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    fonte.connect(ganho);
    fonte.start();
    agendarFechamento();
  } catch {
    return;
  }
}

export async function tocarSequencia(nomes: NomeSom[], categoria: CategoriaSom, intervaloMs = 260) {
  for (let i = 0; i < nomes.length; i++) {
    window.setTimeout(() => void tocarSom(nomes[i], categoria), i * intervaloMs);
  }
}
