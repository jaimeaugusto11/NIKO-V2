import { mesclarTexto } from "../ponte/mesclar";
import { escolher, type Escolha, type Ponta } from "./escolher";

/** Instantes anteriores a 2024 são marcas de arranque, não edições de uma pessoa. */
export const INSTANTE_REAL = Date.UTC(2024, 0, 1);

export function instanteReal(em: number): boolean {
  return Number.isFinite(em) && em >= INSTANTE_REAL;
}

/**
 * Decide o que fica numa chave.
 * Sem uma base comum, as duas versões juntam-se: um instante anterior a 2024 não apaga dados reais,
 * e um valor simples em conflito fica com o lado que tem data real.
 * Com base, as duas edições fundem-se item a item, e um apagado num lado sai do outro.
 */
export function reconciliar(local: Ponta | null, remoto: Ponta | null, base: string | undefined): Escolha | null {
  if (!local && !remoto) return null;
  if (base === undefined && local && remoto && local.valor !== remoto.valor && (instanteReal(local.em) || instanteReal(remoto.em))) {
    const localPrefere = instanteReal(local.em) || !instanteReal(remoto.em);
    const preferido = localPrefere ? local.valor : remoto.valor;
    const outro = localPrefere ? remoto.valor : local.valor;
    const junto = mesclarTexto(undefined, preferido, outro) ?? preferido;
    const em = Math.max(instanteReal(local.em) ? local.em : 0, instanteReal(remoto.em) ? remoto.em : 0) || Date.now();
    return { valor: junto, em, escreverLocal: junto !== local.valor, escreverRemoto: junto !== remoto.valor };
  }
  if (base !== undefined && local && remoto && local.valor !== remoto.valor) {
    if (local.valor === base) return { valor: remoto.valor, em: remoto.em, escreverLocal: true, escreverRemoto: false };
    if (remoto.valor === base) return { valor: local.valor, em: local.em, escreverLocal: false, escreverRemoto: true };
    const junto = mesclarTexto(base, local.valor, remoto.valor) ?? local.valor;
    const em = Math.max(local.em, remoto.em);
    return { valor: junto, em, escreverLocal: junto !== local.valor, escreverRemoto: junto !== remoto.valor };
  }
  return escolher(local, remoto);
}
