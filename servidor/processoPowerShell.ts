import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { garantirScript } from "./scriptsTemporarios";

interface Espera {
  resolver: (v: unknown) => void;
  rejeitar: (e: Error) => void;
  relogio: NodeJS.Timeout;
}

export function criarProcessoPowerShell(prefixo: string, script: string, erroAoEncerrar: string, argumentos: string[] = []) {
  let processo: ChildProcessWithoutNullStreams | null = null;
  let contador = 0;
  const esperando = new Map<number, Espera>();

  const rejeitarTodos = (motivo: string) => {
    for (const [id, e] of esperando) {
      clearTimeout(e.relogio);
      e.rejeitar(new Error(motivo));
      esperando.delete(id);
    }
  };

  const encerrar = () => {
    const atual = processo;
    processo = null;
    atual?.kill();
  };

  const iniciar = () => {
    if (processo) return processo;
    if (process.platform !== "win32") throw new Error("somente_windows");
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", garantirScript(prefixo, script), ...argumentos], { windowsHide: true });
    createInterface({ input: p.stdout }).on("line", (linha) => {
      try {
        const r = JSON.parse(linha) as { id?: number; erro?: string };
        const pendente = r.id ? esperando.get(r.id) : undefined;
        if (!pendente) return;
        esperando.delete(r.id!);
        clearTimeout(pendente.relogio);
        if (r.erro) pendente.rejeitar(new Error(r.erro));
        else pendente.resolver(r);
      } catch {
        return;
      }
    });
    p.stdin.on("error", () => undefined);
    p.on("error", () => {
      if (processo === p) processo = null;
      rejeitarTodos(erroAoEncerrar);
    });
    p.on("exit", () => {
      if (processo === p) processo = null;
      rejeitarTodos(erroAoEncerrar);
    });
    processo = p;
    return p;
  };

  const pedir = (pedido: Record<string, unknown>, limiteMs = 15000): Promise<unknown> => {
    const p = iniciar();
    const id = ++contador;
    return new Promise((resolver, rejeitar) => {
      const relogio = setTimeout(() => {
        esperando.delete(id);
        rejeitar(new Error("tempo_esgotado"));
        if (processo === p) encerrar();
      }, limiteMs);
      esperando.set(id, { resolver, rejeitar, relogio });
      p.stdin.write(`${JSON.stringify({ ...pedido, id })}\n`);
    });
  };

  return { pedir, encerrar };
}
