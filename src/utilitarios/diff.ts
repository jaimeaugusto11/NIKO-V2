export interface TrechoAlterado {
  antes: string;
  depois: string;
}

export interface AlteracaoDeArquivo {
  arquivo: string;
  trechos: TrechoAlterado[];
  novo: boolean;
}

export interface LinhaDoDiff {
  tipo: "mais" | "menos" | "igual";
  texto: string;
}

const MAXIMO_LINHAS = 400;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

export function alteracaoDaFerramenta(ferramenta: string, entrada: Record<string, unknown>): AlteracaoDeArquivo | undefined {
  const arquivo = texto(entrada.file_path) || texto(entrada.notebook_path);
  if (!arquivo) return undefined;
  if (ferramenta === "Edit") return { arquivo, novo: false, trechos: [{ antes: texto(entrada.old_string), depois: texto(entrada.new_string) }] };
  if (ferramenta === "MultiEdit" && Array.isArray(entrada.edits)) {
    const trechos = entrada.edits.flatMap((e) => (e && typeof e === "object" ? [{ antes: texto((e as Record<string, unknown>).old_string), depois: texto((e as Record<string, unknown>).new_string) }] : []));
    return trechos.length ? { arquivo, novo: false, trechos } : undefined;
  }
  if (ferramenta === "Write") return { arquivo, novo: true, trechos: [{ antes: "", depois: texto(entrada.content) }] };
  if (ferramenta === "NotebookEdit" && texto(entrada.new_source)) return { arquivo, novo: false, trechos: [{ antes: "", depois: texto(entrada.new_source) }] };
  return undefined;
}

export function linhasDoDiff(antes: string, depois: string): LinhaDoDiff[] {
  const a = antes ? antes.split("\n").slice(0, MAXIMO_LINHAS) : [];
  const b = depois ? depois.split("\n").slice(0, MAXIMO_LINHAS) : [];
  const n = a.length;
  const m = b.length;
  const tabela: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) tabela[i][j] = a[i] === b[j] ? tabela[i + 1][j + 1] + 1 : Math.max(tabela[i + 1][j], tabela[i][j + 1]);
  const saida: LinhaDoDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      saida.push({ tipo: "igual", texto: a[i] });
      i++;
      j++;
    } else if (tabela[i + 1][j] >= tabela[i][j + 1]) saida.push({ tipo: "menos", texto: a[i++] });
    else saida.push({ tipo: "mais", texto: b[j++] });
  }
  while (i < n) saida.push({ tipo: "menos", texto: a[i++] });
  while (j < m) saida.push({ tipo: "mais", texto: b[j++] });
  return saida;
}

const contagensCalculadas = new WeakMap<AlteracaoDeArquivo, { mais: number; menos: number }>();

export function contarMudancas(alteracao: AlteracaoDeArquivo): { mais: number; menos: number } {
  const pronta = contagensCalculadas.get(alteracao);
  if (pronta) return pronta;
  let mais = 0;
  let menos = 0;
  for (const t of alteracao.trechos) for (const l of linhasDoDiff(t.antes, t.depois)) {
    if (l.tipo === "mais") mais++;
    else if (l.tipo === "menos") menos++;
  }
  const contagem = { mais, menos };
  contagensCalculadas.set(alteracao, contagem);
  return contagem;
}
