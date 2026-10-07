/** Uma ponta de uma chave: o valor e o instante em que foi escrito, em milissegundos. */
export interface Ponta {
  valor: string;
  em: number;
}

export interface Escolha {
  valor: string;
  em: number;
  escreverLocal: boolean;
  escreverRemoto: boolean;
}

/**
 * O mais recente ganha. Se os dois mudaram no mesmo instante, fica o local.
 * Valores iguais não precisam de ser escritos outra vez.
 */
export function escolher(local: Ponta | null, remoto: Ponta | null): Escolha | null {
  if (!local && !remoto) return null;
  if (!remoto) return { valor: local!.valor, em: local!.em, escreverLocal: false, escreverRemoto: true };
  if (!local) return { valor: remoto.valor, em: remoto.em, escreverLocal: true, escreverRemoto: false };
  if (local.valor === remoto.valor) return { valor: local.valor, em: Math.max(local.em, remoto.em), escreverLocal: false, escreverRemoto: false };
  if (local.em >= remoto.em) return { valor: local.valor, em: local.em, escreverLocal: false, escreverRemoto: true };
  return { valor: remoto.valor, em: remoto.em, escreverLocal: true, escreverRemoto: false };
}

export const CHAVE_DE_DADOS = /^niko:[a-z0-9_-]{1,60}$/i;
export const CHAVE_DA_SINCRONIA = "niko:sincronia";
export const LIMITE_DO_VALOR = 900_000;

/** Ficam neste aparelho: marcas internas, histórico de busca e caches. */
const SO_NESTE_APARELHO = new Set(["niko:sincronia", "niko:migrado", "niko:busca-recentes", "niko:commits"]);

export function chaveSincronizavel(chave: string, valor: string): boolean {
  return !SO_NESTE_APARELHO.has(chave) && CHAVE_DE_DADOS.test(chave) && valor.length <= LIMITE_DO_VALOR;
}
