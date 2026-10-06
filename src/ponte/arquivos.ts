import { cabecalhoDoBanco } from "./armazenamento";

export interface ArquivoDaMateria {
  id: string;
  nome: string;
  extensao: string;
  tamanho: number;
  criadoEm: string;
}

export type FormaDeVer = "pdf" | "imagem" | "texto" | "audio" | "video" | "programa";

export const LIMITE_ARQUIVO = 300 * 1024 * 1024;

export const EXTENSOES_ACEITAS = [
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "odp", "ods", "rtf", "txt", "md", "csv", "json",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "mp3", "wav", "ogg", "m4a", "mp4", "webm", "mov", "zip", "rar", "7z", "epub",
];

const FORMAS: Record<string, FormaDeVer> = {
  pdf: "pdf",
  png: "imagem", jpg: "imagem", jpeg: "imagem", gif: "imagem", webp: "imagem", bmp: "imagem", svg: "imagem",
  txt: "texto", md: "texto", csv: "texto", json: "texto",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio",
  mp4: "video", webm: "video", mov: "video",
};

export function formaDeVer(extensao: string): FormaDeVer {
  return FORMAS[extensao.toLowerCase()] ?? "programa";
}

export function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-niko": "1", ...cabecalhoDoBanco(), ...extra };
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const r = await fetch(`/ponte/arquivos/${caminho}`, { ...opcoes, headers: cabecalhos(opcoes.headers as Record<string, string> | undefined) });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export async function listarArquivos(materiaId: string): Promise<ArquivoDaMateria[]> {
  return (await pedir<{ arquivos: ArquivoDaMateria[] }>(materiaId)).arquivos;
}

export function enviarArquivo(materiaId: string, arquivo: File): Promise<ArquivoDaMateria> {
  return pedir<ArquivoDaMateria>(`${materiaId}?nome=${encodeURIComponent(arquivo.name)}`, {
    method: "POST",
    body: arquivo,
    headers: { "content-type": "application/octet-stream" },
  });
}

export async function lerConteudo(materiaId: string, id: string): Promise<Blob> {
  const r = await fetch(`/ponte/arquivos/${materiaId}/${id}`, { headers: cabecalhos() });
  if (!r.ok) throw new Error(`http_${r.status}`);
  return r.blob();
}

export function excluirArquivo(materiaId: string, id: string) {
  return pedir<{ ok: boolean }>(`${materiaId}/${id}`, { method: "DELETE" });
}

export function excluirArquivosDaMateria(materiaId: string) {
  return pedir<{ ok: boolean }>(materiaId, { method: "DELETE" });
}

export function baixarArquivo(materiaId: string, id: string) {
  return pedir<{ caminho: string }>(`${materiaId}/${id}/baixar`, { method: "POST" });
}

export function abrirNoPrograma(materiaId: string, id: string) {
  return pedir<{ ok: boolean }>(`${materiaId}/${id}/abrir`, { method: "POST" });
}
