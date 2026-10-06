import {
  siStripe, siGithub, siVercel, siResend, siNotion, siCaldotcom, siN8n, siAnthropic, siOllama,
  siNvidia, siOpencode, siQwen, siGooglegemini, siOpenrouter, siMistralai, siHuggingface, siDeepseek, siLmstudio, siGmail, siSupabase, siCloudflare, siClaudecode,
  siGooglecalendar, siTodoist, siTelegram,
  siSpotify, siGooglechrome, siFirefoxbrowser, siZenbrowser, siYoutube, siYoutubemusic, siDeezer, siApplemusic, siTidal, siSoundcloud,
} from "simple-icons";
import type { ServicoId } from "../tipos";

interface IconeMarca {
  title: string;
  path: string;
  hex: string;
}

export type MarcaId = ServicoId | "anthropic" | "ollama" | "nvidia" | "opencode" | "qwen" | "gemini" | "openrouter" | "mistral" | "huggingface" | "deepseek" | "lmstudio" | "claudecode" | MarcaDeMidia;

export type MarcaDeMidia = "spotify" | "chrome" | "firefox" | "zen" | "youtube" | "youtubemusic" | "deezer" | "applemusic" | "tidal" | "soundcloud";

const PADROES_DE_MIDIA: [RegExp, MarcaDeMidia][] = [
  [/youtube music/i, "youtubemusic"],
  [/youtube/i, "youtube"],
  [/spotify/i, "spotify"],
  [/deezer/i, "deezer"],
  [/apple ?music|itunes/i, "applemusic"],
  [/tidal/i, "tidal"],
  [/soundcloud/i, "soundcloud"],
  [/chrome/i, "chrome"],
  [/firefox/i, "firefox"],
  [/^zen$/i, "zen"],
];

export function marcaDoApp(app: string): MarcaDeMidia | null {
  return PADROES_DE_MIDIA.find(([padrao]) => padrao.test(app))?.[1] ?? null;
}

// A simple-icons deixou de ter as marcas da Microsoft; uma pasta de trabalho neutra representa o Microsoft 365.
const MICROSOFT_365: IconeMarca = {
  title: "Microsoft 365",
  hex: "0078D4",
  path: "M10 3h4a2 2 0 0 1 2 2v1h4a2 2 0 0 1 2 2v4H2V8a2 2 0 0 1 2-2h4V5a2 2 0 0 1 2-2zm0 3h4V5h-4zM2 14h8v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1h8v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z",
};

export const MARCAS: Record<MarcaId, IconeMarca> = {
  stripe: siStripe,
  github: siGithub,
  vercel: siVercel,
  resend: siResend,
  notion: siNotion,
  calcom: siCaldotcom,
  n8n: siN8n,
  gmail: siGmail,
  supabase: siSupabase,
  cloudflare: siCloudflare,
  gcalendar: siGooglecalendar,
  microsoft: MICROSOFT_365,
  todoist: siTodoist,
  telegram: siTelegram,
  anthropic: siAnthropic,
  ollama: siOllama,
  nvidia: siNvidia,
  opencode: siOpencode,
  qwen: siQwen,
  gemini: siGooglegemini,
  openrouter: siOpenrouter,
  mistral: siMistralai,
  huggingface: siHuggingface,
  deepseek: siDeepseek,
  lmstudio: siLmstudio,
  claudecode: siClaudecode,
  spotify: siSpotify,
  chrome: siGooglechrome,
  firefox: siFirefoxbrowser,
  zen: siZenbrowser,
  youtube: siYoutube,
  youtubemusic: siYoutubemusic,
  deezer: siDeezer,
  applemusic: siApplemusic,
  tidal: siTidal,
  soundcloud: siSoundcloud,
};

function escura(hex: string): boolean {
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.22;
}

interface Props {
  marca: MarcaId;
  tamanho?: number;
  monocromatica?: boolean;
}

export function Marca({ marca, tamanho = 18, monocromatica = false }: Props) {
  const icone = MARCAS[marca];
  const cor = monocromatica || escura(icone.hex) ? "currentColor" : `#${icone.hex}`;
  return (
    <svg role="img" aria-label={icone.title} viewBox="0 0 24 24" width={tamanho} height={tamanho} fill={cor} style={{ flex: "0 0 auto" }}>
      <path d={icone.path} />
    </svg>
  );
}
