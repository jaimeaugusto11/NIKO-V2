export function gerarId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function contem(texto: string, busca: string): boolean {
  return normalizarTexto(texto).includes(normalizarTexto(busca));
}

export function baixarArquivo(nome: string, conteudo: string, tipo = "application/json") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const ancora = document.createElement("a");
  ancora.href = url;
  ancora.download = nome;
  ancora.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function lerArquivoTexto(arquivo: File, limiteBytes = 5 * 1024 * 1024): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    if (arquivo.size > limiteBytes) {
      rejeitar(new Error("arquivo_grande"));
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result ?? ""));
    leitor.onerror = () => rejeitar(new Error("falha_leitura"));
    leitor.readAsText(arquivo);
  });
}

export function lerImagemComoDataUrl(arquivo: File, limiteBytes = 1.5 * 1024 * 1024): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) {
      rejeitar(new Error("tipo_invalido"));
      return;
    }
    if (arquivo.size > limiteBytes) {
      rejeitar(new Error("arquivo_grande"));
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result ?? ""));
    leitor.onerror = () => rejeitar(new Error("falha_leitura"));
    leitor.readAsDataURL(arquivo);
  });
}

export function urlSegura(texto: string): URL | null {
  try {
    const url = new URL(texto.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function agrupar<T, K extends string>(itens: T[], chave: (item: T) => K): Record<K, T[]> {
  const resultado = {} as Record<K, T[]>;
  for (const item of itens) {
    const k = chave(item);
    (resultado[k] ??= []).push(item);
  }
  return resultado;
}

export function somar<T>(itens: T[], valor: (item: T) => number): number {
  let total = 0;
  for (const item of itens) total += valor(item);
  return total;
}
