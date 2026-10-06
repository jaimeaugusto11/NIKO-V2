const BASE = "https://api.todoist.com/api/v1";
const DIAS_A_FRENTE = 7;

interface TarefaTodoist {
  id: string;
  content: string;
  description?: string;
  project_id?: string;
  priority?: number;
  checked?: boolean;
  due?: { date?: string; datetime?: string | null; string?: string; is_recurring?: boolean } | null;
}

async function api<T>(token: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { "content-type": "application/json" }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`http_${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return (r.status === 204 ? {} : await r.json()) as T;
}

// A API v1 pagina com { results, next_cursor }; versões antigas devolviam a lista direto.
function itens<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const objeto = r as { results?: T[]; items?: T[] } | null;
  return objeto?.results ?? objeto?.items ?? [];
}

async function todasAsPaginas<T>(token: string, caminho: string): Promise<T[]> {
  const lista: T[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < 5; pagina++) {
    const separador = caminho.includes("?") ? "&" : "?";
    const r: unknown = await api(token, `${caminho}${cursor ? `${separador}cursor=${encodeURIComponent(cursor)}` : ""}`);
    lista.push(...itens<T>(r));
    cursor = (r as { next_cursor?: string | null })?.next_cursor ?? null;
    if (!cursor) break;
  }
  return lista;
}

const hojeLocal = () => new Date().toLocaleDateString("sv-SE");

export async function lerTodoist(token: string) {
  const [tarefas, projetos] = await Promise.all([todasAsPaginas<TarefaTodoist>(token, "/tasks?limit=200"), todasAsPaginas<{ id: string; name: string }>(token, "/projects?limit=200")]);
  const hoje = hojeLocal();
  const limite = new Date(Date.now() + DIAS_A_FRENTE * 86400000).toLocaleDateString("sv-SE");
  const nomeDoProjeto = new Map(projetos.map((p) => [p.id, p.name]));
  const lista = tarefas
    .filter((t) => !t.checked)
    .map((t) => {
      const data = t.due?.date?.slice(0, 10) ?? "";
      return {
        id: t.id,
        conteudo: t.content,
        projeto: nomeDoProjeto.get(t.project_id ?? "") ?? "",
        // A Todoist usa 4 para a prioridade mais alta (P1) e 1 para a normal (P4).
        prioridade: 5 - (t.priority ?? 1),
        data,
        hora: t.due?.datetime ? new Date(t.due.datetime).toTimeString().slice(0, 5) : "",
        recorrente: Boolean(t.due?.is_recurring),
        atrasada: Boolean(data && data < hoje),
      };
    });
  const comData = lista.filter((t) => t.data && t.data <= limite).sort((a, b) => `${a.data}${a.hora || "99"}`.localeCompare(`${b.data}${b.hora || "99"}`) || a.prioridade - b.prioridade);
  return {
    hoje: comData.filter((t) => t.data <= hoje),
    proximas: comData.filter((t) => t.data > hoje),
    semData: lista.filter((t) => !t.data).length,
    total: lista.length,
    projetos: projetos.map((p) => ({ nome: p.name, tarefas: lista.filter((t) => t.projeto === p.name).length })),
  };
}

function idValido(id: unknown): string {
  const texto = String(id ?? "");
  if (!/^[\w-]{1,64}$/.test(texto)) throw new Error("tarefa_invalida");
  return texto;
}

export async function concluirTodoist(token: string, dados: { id?: unknown }) {
  await api(token, `/tasks/${idValido(dados.id)}/close`, {});
  return { ok: true };
}

export async function criarTodoist(token: string, dados: { conteudo?: unknown; quando?: unknown }) {
  const conteudo = String(dados.conteudo ?? "").trim().slice(0, 500);
  if (!conteudo) throw new Error("tarefa_vazia");
  const quando = String(dados.quando ?? "").trim().slice(0, 100);
  const r = await api<{ id: string }>(token, "/tasks", { content: conteudo, ...(quando ? { due_string: quando, due_lang: "pt" } : {}) });
  return { ok: true, id: r.id };
}
