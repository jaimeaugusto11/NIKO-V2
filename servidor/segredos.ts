import { spawn } from "node:child_process";
import { garantirScript } from "./scriptsTemporarios";
import { jsonAscii } from "./processoPowerShell";

const CODIGO = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NikoCredencial {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENCIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWrite(ref CREDENCIAL c, int f);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredRead(string alvo, int tipo, int f, out IntPtr c);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDelete(string alvo, int tipo, int f);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static bool Gravar(string alvo, string segredo) {
    byte[] bytes = Encoding.UTF8.GetBytes(segredo);
    CREDENCIAL c = new CREDENCIAL();
    c.Type = 1; c.TargetName = alvo; c.Persist = 2; c.UserName = "niko";
    c.CredentialBlobSize = bytes.Length; c.CredentialBlob = Marshal.AllocHGlobal(bytes.Length);
    Marshal.Copy(bytes, 0, c.CredentialBlob, bytes.Length);
    try { return CredWrite(ref c, 0); } finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }
  public static string Ler(string alvo) {
    IntPtr p;
    if (!CredRead(alvo, 1, 0, out p)) return null;
    try {
      CREDENCIAL c = (CREDENCIAL)Marshal.PtrToStructure(p, typeof(CREDENCIAL));
      if (c.CredentialBlobSize == 0) return "";
      byte[] bytes = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, bytes, 0, bytes.Length);
      // Segredos antigos foram gravados em UTF-16, que sempre tem bytes zero em texto ASCII; UTF-8 nunca tem.
      return Array.IndexOf(bytes, (byte)0) >= 0 ? Encoding.Unicode.GetString(bytes) : Encoding.UTF8.GetString(bytes);
    } finally { CredFree(p); }
  }
  public static bool Apagar(string alvo) { return CredDelete(alvo, 1, 0); }
}
`;

const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${CODIGO}
'@
$entrada = [Console]::In.ReadToEnd() | ConvertFrom-Json
$resultado = @{ ok = $true }
switch ($entrada.acao) {
  'gravar' { $resultado.ok = [NikoCredencial]::Gravar($entrada.alvo, $entrada.segredo) }
  'ler' { $resultado.valor = [NikoCredencial]::Ler($entrada.alvo) }
  'apagar' { $resultado.ok = [NikoCredencial]::Apagar($entrada.alvo) }
}
$resultado | ConvertTo-Json -Compress
`;

const PREFIXO = "Niko/";
const TEMPO_LIMITE_MS = 20000;
// CRED_MAX_CREDENTIAL_BLOB_SIZE do Windows para credenciais genéricas.
export const LIMITE_BYTES = 2560;

const cache = new Map<string, string | null>();
const leiturasEmAndamento = new Map<string, Promise<string | null>>();

function executar(entrada: Record<string, string>): Promise<{ ok?: boolean; valor?: string | null }> {
  return new Promise((resolver, rejeitar) => {
    const processo = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", garantirScript("niko-credencial", SCRIPT)], { windowsHide: true });
    let saida = "";
    let erro = "";
    const relogio = setTimeout(() => {
      processo.kill();
      rejeitar(new Error("tempo_credencial"));
    }, TEMPO_LIMITE_MS);
    processo.stdout.setEncoding("utf8");
    processo.stderr.setEncoding("utf8");
    processo.stdout.on("data", (d: string) => (saida += d));
    processo.stderr.on("data", (d: string) => (erro += d));
    processo.on("error", (e) => {
      clearTimeout(relogio);
      rejeitar(e);
    });
    processo.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0) return rejeitar(new Error(erro.trim().split("\n")[0] || "falha_credencial"));
      try {
        resolver(JSON.parse(saida.trim().split("\n").pop() ?? "{}"));
      } catch {
        rejeitar(new Error("resposta_invalida"));
      }
    });
    processo.stdin.end(jsonAscii(entrada));
  });
}

function validarId(id: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error("id_invalido");
}

export async function gravarSegredo(id: string, segredo: string) {
  validarId(id);
  if (!segredo || segredo.includes("\0")) throw new Error("segredo_invalido");
  if (Buffer.byteLength(segredo, "utf8") > LIMITE_BYTES) throw new Error("segredo_grande");
  if (process.platform !== "win32") throw new Error("somente_windows");
  const r = await executar({ acao: "gravar", alvo: PREFIXO + id, segredo });
  if (!r.ok) throw new Error("falha_ao_gravar");
  leiturasEmAndamento.delete(id);
  cache.set(id, segredo);
}

export async function lerSegredo(id: string): Promise<string | null> {
  validarId(id);
  if (cache.has(id)) return cache.get(id) ?? null;
  if (process.platform !== "win32") return null;
  const emAndamento = leiturasEmAndamento.get(id);
  if (emAndamento) return emAndamento;
  const leitura = executar({ acao: "ler", alvo: PREFIXO + id })
    .then((r) => {
      const valor = r.valor ?? null;
      if (leiturasEmAndamento.get(id) === leitura) cache.set(id, valor);
      return valor;
    })
    .finally(() => {
      if (leiturasEmAndamento.get(id) === leitura) leiturasEmAndamento.delete(id);
    });
  leiturasEmAndamento.set(id, leitura);
  return leitura;
}

export async function apagarSegredo(id: string) {
  validarId(id);
  cache.delete(id);
  leiturasEmAndamento.delete(id);
  if (process.platform !== "win32") return;
  await executar({ acao: "apagar", alvo: PREFIXO + id });
}
