import { backupManual, gravar, lerLinhas } from "./banco";
import { estadoConexoes } from "./conexoes";
import { listarProvedores } from "./ia";
import { clienteAutenticado } from "./social";
import { CHAVE_DA_SINCRONIA, chaveSincronizavel, type Ponta } from "../src/sincronia/escolher";
import { instanteReal, reconciliar } from "../src/sincronia/reconciliar";

interface Meta {
  backup: boolean;
  em: Record<string, number>;
  base: Record<string, string>;
}

interface LinhaRemota {
  chave: string;
  valor: string;
  atualizado_em: string;
}

const FOLGA_MS = 1500;

type LinhaLocal = { chave: string; valor: string; atualizado: number };

function lerMeta(linhas: { chave: string; valor: string }[]): Meta {
  const bruto = linhas.find((l) => l.chave === CHAVE_DA_SINCRONIA)?.valor;
  const vazio = { backup: false, em: {}, base: {} };
  if (!bruto) return vazio;
  try {
    const lido = JSON.parse(bruto) as Partial<Meta>;
    return {
      backup: lido.backup === true,
      em: lido.em && typeof lido.em === "object" ? lido.em : {},
      base: lido.base && typeof lido.base === "object" ? lido.base : {},
    };
  } catch {
    return vazio;
  }
}

/** Nomes, endereços e se há chave. A chave em si fica no cofre deste computador. */
function publicarConfiguracao(banco: string, linhas: LinhaLocal[]) {
  const atual = (chave: string) => linhas.find((l) => l.chave === chave)?.valor;
  const conexoes = JSON.stringify(estadoConexoes());
  const provedores = JSON.stringify(listarProvedores().map((p) => ({
    id: p.id,
    tipo: p.tipo,
    nome: p.nome,
    urlBase: p.urlBase,
    modelo: p.modelo,
    temChave: Boolean(p.temChave),
  })));
  const escritos: Record<string, string> = {};
  if (atual("niko:conexoes-config") !== conexoes) escritos["niko:conexoes-config"] = conexoes;
  if (atual("niko:provedores-ia") !== provedores) escritos["niko:provedores-ia"] = provedores;
  if (Object.keys(escritos).length === 0) return linhas;
  gravar(escritos, banco);
  return lerLinhas(banco);
}

export async function sincronizarDados(banco = "") {
  const sessao = await clienteAutenticado();
  if (!sessao) return { precisaEntrar: true as const };
  const { error: semPerfil } = await sessao.supabase.rpc("garantir_perfil");
  if (semPerfil) throw new Error(semPerfil.message);
  const linhas = publicarConfiguracao(banco, lerLinhas(banco));
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
    const escolha = reconciliar(locais.get(chave) ?? null, remotos.get(chave) ?? null, meta.base[chave]);
    if (!escolha) continue;
    const em = instanteReal(escolha.em) ? escolha.em : Date.now();
    meta.base[chave] = escolha.valor;
    meta.em[chave] = em;
    if (escolha.escreverLocal) escritos[chave] = escolha.valor;
    if (escolha.escreverRemoto) {
      envios.push({
        user_id: sessao.usuarioId,
        chave,
        valor: escolha.valor,
        atualizado_em: new Date(em).toISOString(),
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
