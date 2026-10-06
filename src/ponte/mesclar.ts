type Valor = unknown;
type Objeto = Record<string, unknown>;

const AUSENTE = Symbol("ausente");

function objeto(v: Valor): v is Objeto {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function igual(a: Valor, b: Valor): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as Valor[]).length && a.every((x, i) => igual(x, (b as Valor[])[i]));
  const ka = Object.keys(a as Objeto);
  const kb = Object.keys(b as Objeto);
  return ka.length === kb.length && ka.every((k) => k in (b as Objeto) && igual((a as Objeto)[k], (b as Objeto)[k]));
}

function idDe(v: Valor): string | null {
  return objeto(v) && typeof v.id === "string" ? v.id : null;
}

function listaComIds(v: Valor): v is Objeto[] {
  return Array.isArray(v) && v.every((x) => idDe(x) !== null);
}

function porId(lista: Objeto[]): Map<string, Objeto> {
  return new Map(lista.map((x) => [x.id as string, x]));
}

function mesclarListas(base: Valor, local: Objeto[], remoto: Objeto[]): Objeto[] {
  const anteriores = listaComIds(base) ? porId(base) : new Map<string, Objeto>();
  const locais = porId(local);
  const remotos = porId(remoto);
  const resultado: Objeto[] = [];
  for (const item of remoto) {
    const id = item.id as string;
    const daqui = locais.get(id);
    if (daqui) resultado.push(mesclar(anteriores.get(id), daqui, item) as Objeto);
    else if (!(anteriores.has(id) && igual(anteriores.get(id), item))) resultado.push(item);
  }
  local.forEach((item, posicao) => {
    const id = item.id as string;
    if (remotos.has(id)) return;
    if (anteriores.has(id) && igual(anteriores.get(id), item)) return;
    resultado.splice(Math.min(posicao, resultado.length), 0, item);
  });
  return resultado;
}

function mesclarObjetos(base: Valor, local: Objeto, remoto: Objeto): Objeto {
  const anterior = objeto(base) ? base : {};
  const resultado: Objeto = {};
  for (const chave of new Set([...Object.keys(local), ...Object.keys(remoto)])) {
    const b = chave in anterior ? anterior[chave] : AUSENTE;
    const l = chave in local ? local[chave] : AUSENTE;
    const r = chave in remoto ? remoto[chave] : AUSENTE;
    const valor = l === AUSENTE ? (igual(b, r) ? AUSENTE : r) : r === AUSENTE ? (igual(b, l) ? AUSENTE : l) : mesclar(b === AUSENTE ? undefined : b, l, r);
    if (valor !== AUSENTE) resultado[chave] = valor;
  }
  return resultado;
}

/**
 * Fusão a três vias entre duas versões que partiram da mesma base. Listas de itens com `id`
 * são fundidas item a item; quando as duas versões mudam o mesmo valor simples, vence a local.
 */
export function mesclar(base: Valor, local: Valor, remoto: Valor): Valor {
  if (igual(local, remoto)) return local;
  if (igual(base, local)) return remoto;
  if (igual(base, remoto)) return local;
  if (listaComIds(local) && listaComIds(remoto)) return mesclarListas(base, local, remoto);
  if (objeto(local) && objeto(remoto)) return mesclarObjetos(base, local, remoto);
  return local;
}

export function mesclarTexto(base: string | null | undefined, local: string | null | undefined, remoto: string | null): string | null {
  if (local == null || remoto == null) return local ?? remoto;
  try {
    return JSON.stringify(mesclar(base == null ? undefined : JSON.parse(base), JSON.parse(local), JSON.parse(remoto)));
  } catch {
    return local;
  }
}
