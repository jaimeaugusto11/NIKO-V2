import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { garantirScript } from "./scriptsTemporarios";

interface Espera {
  resolver: (v: unknown) => void;
  rejeitar: (e: Error) => void;
  limiteMs: number;
  relogio?: NodeJS.Timeout;
}

interface Ativo {
  p: ChildProcessWithoutNullStreams;
  esperando: Map<number, Espera>;
}

const ESPERA_APOS_MORTE_MS = 5000;

/** O stdin do PowerShell 5.1 é lido no codepage OEM: tudo o que não é ASCII vai escapado como \uXXXX. */
export function jsonAscii(valor: unknown): string {
  return JSON.stringify(valor).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function criarProcessoPowerShell(prefixo: string, script: string, erroAoEncerrar: string, argumentos: string[] = []) {
  let ativo: Ativo | null = null;
  let contador = 0;
  let morreuEm = 0;

  const rejeitarTodos = (a: Ativo, motivo: string) => {
    for (const [id, e] of a.esperando) {
      clearTimeout(e.relogio);
      e.rejeitar(new Error(motivo));
      a.esperando.delete(id);
    }
  };

  // O script responde em série: só o pedido da frente tem o prazo a contar.
  const armarProximo = (a: Ativo) => {
    const primeiro = a.esperando.entries().next();
    if (primeiro.done) return;
    const [id, e] = primeiro.value;
    if (e.relogio) return;
    e.relogio = setTimeout(() => {
      a.esperando.delete(id);
      e.rejeitar(new Error("tempo_esgotado"));
      if (ativo === a) {
        ativo = null;
        morreuEm = Date.now();
        a.p.kill();
      }
    }, e.limiteMs);
  };

  const encerrar = () => {
    const atual = ativo;
    ativo = null;
    atual?.p.kill();
  };

  const iniciar = (): Ativo => {
    if (ativo) return ativo;
    if (process.platform !== "win32") throw new Error("somente_windows");
    if (Date.now() - morreuEm < ESPERA_APOS_MORTE_MS) throw new Error(erroAoEncerrar);
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", garantirScript(prefixo, script), ...argumentos], { windowsHide: true });
    const a: Ativo = { p, esperando: new Map() };
    let erros = "";
    p.stderr.setEncoding("utf8");
    p.stderr.on("data", (d: string) => (erros = (erros + d).slice(-2000)));
    createInterface({ input: p.stdout }).on("line", (linha) => {
      try {
        const r = JSON.parse(linha) as { id?: number; erro?: string };
        const pendente = r.id ? a.esperando.get(r.id) : undefined;
        if (!pendente) return;
        a.esperando.delete(r.id!);
        clearTimeout(pendente.relogio);
        if (r.erro) pendente.rejeitar(new Error(r.erro));
        else pendente.resolver(r);
      } catch {
        return;
      } finally {
        armarProximo(a);
      }
    });
    let terminou = false;
    const morreu = (motivo: string) => {
      if (terminou) return;
      terminou = true;
      if (ativo === a) {
        ativo = null;
        morreuEm = Date.now();
      }
      process.stderr.write(`${new Date().toISOString()} ${prefixo} terminou (${motivo})${erros.trim() ? `: ${erros.trim()}` : ""}\n`);
      rejeitarTodos(a, erroAoEncerrar);
    };
    p.stdin.on("error", () => undefined);
    p.on("error", (e) => morreu(e.message));
    p.on("exit", (codigo, sinal) => morreu(`código ${codigo ?? "-"}${sinal ? `, sinal ${sinal}` : ""}`));
    ativo = a;
    return a;
  };

  const pedir = (pedido: Record<string, unknown>, limiteMs = 15000): Promise<unknown> => {
    let a: Ativo;
    try {
      a = iniciar();
    } catch (e) {
      return Promise.reject(e);
    }
    const id = ++contador;
    return new Promise((resolver, rejeitar) => {
      a.esperando.set(id, { resolver, rejeitar, limiteMs });
      armarProximo(a);
      a.p.stdin.write(`${jsonAscii({ ...pedido, id })}\n`);
    });
  };

  return { pedir, encerrar };
}
