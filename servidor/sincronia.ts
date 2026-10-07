import { backupManual, gravar, lerLinhas } from "./banco";
import { clienteAutenticado } from "./social";
import { CHAVE_DA_SINCRONIA, chaveSincronizavel, escolher, type Ponta } from "../src/sincronia/escolher";

interface Meta {
  backup: boolean;
  em: Record<string, number>;
}

interface LinhaRemota {
  chave: string;
  valor: string;
  atualizado_em: string;
}

const FOLGA_MS = 1500;

function lerMeta(linhas: { chave: string; valor: string }[]): Meta {
  const bruto = linhas.find((l) => l.chave === CHAVE_DA_SINCRONIA)?.valor;
  if (!bruto) return { backup: false, em: {} };
  try {
    const lido = JSON.parse(bruto) as Partial<Meta>;
    return { backup: lido.backup === true, em: lido.em && typeof lido.em === "object" ? lido.em : {} };
  } catch {
    return { backup: false, em: {} };
  }
}

export async function sincronizarDados(banco = "") {
  const sessao = await clienteAutenticado();
  if (!sessao) return { precisaEntrar: true as const };
  const linhas = lerLinhas(banco);
  const meta = lerMeta(linhas);
  const locais = new Map<string, Ponta>();
  for (const linha of linhas) {
    if (!chaveSincronizavel(linha.chave, linha.valor)) continue;
    const conhecido = meta.em[linha.chave] ?? 0;
    const em = linha.atualizado > conhecido + FOLGA_MS ? linha.atualizado : conhecido || linha.atualizado;
    locais.set(linha.chave, { valor: linha.valor, em });
  }

  const { data, error } = await sessao.supabase.from("dados_utilizador").select("chave, valor, atualizado_em").eq("user_id", sessao.usuarioId);
  if (error) throw new Error(error.message);
  const remotos = new Map<string, Ponta>();
  for (const linha of (data ?? []) as LinhaRemota[]) {
    if (!chaveSincronizavel(linha.chave, linha.valor)) continue;
    remotos.set(linha.chave, { valor: linha.valor, em: Date.parse(linha.atualizado_em) });
  }

  if (!meta.backup && remotos.size === 0 && locais.size > 0) {
    backupManual(banco);
    meta.backup = true;
  }

  const escritos: Record<string, string> = {};
  const envios: { user_id: string; chave: string; valor: string; atualizado_em: string; dispositivo: string; apagado: boolean }[] = [];
  for (const chave of new Set([...locais.keys(), ...remotos.keys()])) {
    const escolha = escolher(locais.get(chave) ?? null, remotos.get(chave) ?? null);
    if (!escolha) continue;
    meta.em[chave] = escolha.em;
    if (escolha.escreverLocal) escritos[chave] = escolha.valor;
    if (escolha.escreverRemoto) {
      envios.push({
        user_id: sessao.usuarioId,
        chave,
        valor: escolha.valor,
        atualizado_em: new Date(escolha.em).toISOString(),
        dispositivo: "pc",
        apagado: false,
      });
    }
  }

  if (envios.length > 0) {
    const { error: falha } = await sessao.supabase.from("dados_utilizador").upsert(envios, { onConflict: "user_id,chave" });
    if (falha) throw new Error(falha.message);
  }
  gravar({ ...escritos, [CHAVE_DA_SINCRONIA]: JSON.stringify(meta) }, banco);
  return { precisaEntrar: false as const, recebidas: escritos, enviadas: envios.length };
}
