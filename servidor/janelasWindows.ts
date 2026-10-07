import { criarProcessoPowerShell } from "./processoPowerShell";

const CODIGO = String.raw`
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
public static class NikoJanelas {
  delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int t);
  public class Info { public long Id; public uint Pid; public string Titulo; public bool Minimizada; public bool Ativa; }
  static IntPtr ultimaFrente = IntPtr.Zero;
  static IntPtr FrenteForaDoNiko() {
    IntPtr frente = GetForegroundWindow();
    uint pid; GetWindowThreadProcessId(frente, out pid);
    string nome = "";
    try { nome = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    if (nome == "niko") return ultimaFrente;
    ultimaFrente = frente;
    return frente;
  }
  public static List<Info> Listar() {
    var lista = new List<Info>();
    IntPtr frente = FrenteForaDoNiko();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0 && (ex & 0x40000) == 0) return true;
      int oculta = 0;
      DwmGetWindowAttribute(h, 14, out oculta, 4);
      if (oculta != 0) return true;
      var sb = new StringBuilder(300);
      GetWindowText(h, sb, 300);
      if (sb.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      lista.Add(new Info { Id = h.ToInt64(), Pid = pid, Titulo = sb.ToString(), Minimizada = IsIconic(h), Ativa = h == frente && !IsIconic(h) });
      return true;
    }, IntPtr.Zero);
    return lista;
  }
  public static bool Focar(long id) {
    IntPtr h = new IntPtr(id);
    if (IsIconic(h)) ShowWindow(h, 9);
    uint pid;
    uint alvo = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint eu = GetCurrentThreadId();
    AttachThreadInput(eu, alvo, true);
    BringWindowToTop(h);
    bool ok = SetForegroundWindow(h);
    AttachThreadInput(eu, alvo, false);
    return ok;
  }
  public static bool Minimizar(long id) { return ShowWindow(new IntPtr(id), 6); }
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static bool Fechar(long id) { return PostMessage(new IntPtr(id), 0x0010, IntPtr.Zero, IntPtr.Zero); }

  const uint CONSULTA_LIMITADA = 0x1000;
  static readonly Guid AumidFormato = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");

  [StructLayout(LayoutKind.Sequential)] struct Tamanho { public int cx; public int cy; }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct ChaveDePropriedade { public Guid formato; public uint id; }
  [StructLayout(LayoutKind.Explicit)] struct Variante { [FieldOffset(0)] public ushort tipo; [FieldOffset(8)] public IntPtr texto; }

  [ComImport, Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFabricaDeIcone { [PreserveSig] int GetImage(Tamanho tamanho, int opcoes, out IntPtr bitmap); }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropriedades {
    [PreserveSig] int GetCount(out uint total);
    [PreserveSig] int GetAt(uint indice, out ChaveDePropriedade chave);
    [PreserveSig] int GetValue(ref ChaveDePropriedade chave, out Variante valor);
    [PreserveSig] int SetValue(ref ChaveDePropriedade chave, ref Variante valor);
    [PreserveSig] int Commit();
  }

  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint acesso, bool herdar, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr alca);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr processo, int bandeiras, StringBuilder nome, ref int tamanho);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr processo, ref uint tamanho, StringBuilder id);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string nome, IntPtr contexto, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IFabricaDeIcone item);
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr janela, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropriedades propriedades);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr objeto);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref Variante valor);

  static IntPtr AbrirConsulta(uint pid) {
    return OpenProcess(CONSULTA_LIMITADA, false, pid);
  }

  public static string CaminhoDoProcesso(uint pid) {
    IntPtr processo = AbrirConsulta(pid);
    if (processo == IntPtr.Zero) return null;
    try {
      int tamanho = 1024;
      var nome = new StringBuilder(tamanho);
      return QueryFullProcessImageName(processo, 0, nome, ref tamanho) ? nome.ToString() : null;
    } catch { return null; }
    finally { CloseHandle(processo); }
  }

  public static string AumidDoProcesso(uint pid) {
    IntPtr processo = AbrirConsulta(pid);
    if (processo == IntPtr.Zero) return null;
    try {
      uint tamanho = 1024;
      var id = new StringBuilder(1024);
      int codigo = GetApplicationUserModelId(processo, ref tamanho, id);
      if (codigo == 122) {
        id = new StringBuilder((int)tamanho);
        codigo = GetApplicationUserModelId(processo, ref tamanho, id);
      }
      return codigo == 0 ? id.ToString() : null;
    } catch { return null; }
    finally { CloseHandle(processo); }
  }

  public static string AumidDaJanela(long id) {
    Guid iid = typeof(IPropriedades).GUID;
    IPropriedades propriedades;
    if (SHGetPropertyStoreForWindow(new IntPtr(id), ref iid, out propriedades) != 0 || propriedades == null) return null;
    var chave = new ChaveDePropriedade { formato = AumidFormato, id = 5 };
    Variante valor = new Variante();
    try {
      if (propriedades.GetValue(ref chave, out valor) != 0 || valor.tipo != 31 || valor.texto == IntPtr.Zero) return null;
      return Marshal.PtrToStringUni(valor.texto);
    } catch { return null; }
    finally { PropVariantClear(ref valor); }
  }

  public static string IconeDe(string alvo, int lado) {
    if (string.IsNullOrEmpty(alvo)) return null;
    Guid iid = typeof(IFabricaDeIcone).GUID;
    IFabricaDeIcone fabrica;
    if (SHCreateItemFromParsingName(alvo, IntPtr.Zero, ref iid, out fabrica) != 0 || fabrica == null) return null;
    IntPtr bitmap;
    if (fabrica.GetImage(new Tamanho { cx = lado, cy = lado }, 4, out bitmap) != 0 || bitmap == IntPtr.Zero) return null;
    try {
      using (var semAlfa = Image.FromHbitmap(bitmap)) {
        var area = new Rectangle(0, 0, semAlfa.Width, semAlfa.Height);
        var dados = semAlfa.LockBits(area, ImageLockMode.ReadOnly, semAlfa.PixelFormat);
        try {
          using (var comAlfa = new Bitmap(dados.Width, dados.Height, dados.Stride, PixelFormat.Format32bppPArgb, dados.Scan0))
          using (var copia = new Bitmap(comAlfa))
          using (var memoria = new MemoryStream()) {
            copia.Save(memoria, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(memoria.ToArray());
          }
        } finally { semAlfa.UnlockBits(dados); }
      }
    } catch { return null; }
    finally { DeleteObject(bitmap); }
  }
}
`;

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
` + CODIGO + String.raw`
'@
$icones = @{}
$caminhos = @{}
$aplicacoes = @{}
try {
  foreach ($a in @(Get-StartApps -ErrorAction SilentlyContinue)) {
    $id = [string]$a.AppID
    if (-not $id -or $id.StartsWith('http')) { continue }
    $aplicacoes[$id.ToLowerInvariant()] = $id
    $nomeDaApp = ([string]$a.Name).ToLowerInvariant()
    if ($nomeDaApp -and -not $aplicacoes.ContainsKey($nomeDaApp)) { $aplicacoes[$nomeDaApp] = $id }
  }
} catch { }
$caixaDoWindows = @{
  'systemsettings' = 'windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel'
  'microsoft.notes' = 'Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe!App'
  'notepad' = 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'
  'calculatorapp' = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
  'windowsterminal' = 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App'
  'mspaint' = 'Microsoft.Paint_8wekyb3d8bbwe!App'
  'paintstudio.view' = 'Microsoft.Paint_8wekyb3d8bbwe!App'
  'microsoft.photos' = 'Microsoft.Windows.Photos_8wekyb3d8bbwe!App'
  'windowscamera' = 'Microsoft.WindowsCamera_8wekyb3d8bbwe!App'
  'screensketch' = 'Microsoft.ScreenSketch_8wekyb3d8bbwe!App'
  'snippingtool' = 'Microsoft.ScreenSketch_8wekyb3d8bbwe!App'
  'windowssoundrecorder' = 'Microsoft.WindowsSoundRecorder_8wekyb3d8bbwe!App'
  'video.ui' = 'Microsoft.ZuneVideo_8wekyb3d8bbwe!Microsoft.ZuneVideo'
  'music.ui' = 'Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'
  'olk' = 'Microsoft.OutlookForWindows_8wekyb3d8bbwe!Microsoft.OutlookforWindows'
  'ms-teams' = 'MSTeams_8wekyb3d8bbwe!MSTeams'
  'explorer' = 'Microsoft.Windows.Explorer'
  'microsoft.windows.shell.store' = 'Microsoft.WindowsStore_8wekyb3d8bbwe!App'
}
function Icone($alvo) {
  if (-not $alvo) { return $null }
  if ($icones.ContainsKey($alvo)) { return $icones[$alvo] }
  $valor = $null
  try { $valor = [NikoJanelas]::IconeDe([string]$alvo, 32) } catch { }
  $icones[$alvo] = $valor
  return $valor
}
function IconeDaJanela($processoId, $hwnd, $caminho, $processo, $descricao, $titulo) {
  $candidatos = New-Object System.Collections.Generic.List[string]
  if ($processo -eq 'ApplicationFrameHost' -and $titulo) {
    $hospedada = $aplicacoes[$titulo.ToLowerInvariant()]
    if ($hospedada) { $candidatos.Add($hospedada) }
  }
  foreach ($aumid in @([NikoJanelas]::AumidDaJanela([long]$hwnd), [NikoJanelas]::AumidDoProcesso([uint32]$processoId))) {
    if ($aumid) { $candidatos.Add($aumid) }
  }
  foreach ($texto in @($processo, $descricao)) {
    if (-not $texto) { continue }
    $id = $aplicacoes[$texto.ToLowerInvariant()]
    if ($id) { $candidatos.Add($id) }
  }
  if ($caminho -match '\\WindowsApps\\(.+?)_\d+(?:\.\d+)+_.*?_([^\\]+)\\') {
    $familia = ($Matches[1] + '_' + $Matches[2]).ToLowerInvariant()
    foreach ($id in $aplicacoes.Values) {
      if ($id.ToLowerInvariant().StartsWith($familia)) { $candidatos.Add($id); break }
    }
  }
  $conhecido = $(if ($processo) { $caixaDoWindows[$processo.ToLowerInvariant()] } else { $null })
  if ($conhecido) { $candidatos.Add($conhecido) }
  foreach ($id in $candidatos) {
    $icone = Icone ("shell:AppsFolder\$id")
    if ($icone) { return $icone }
  }
  return Icone $caminho
}
while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($null -eq $linha) { break }
  try {
    $pedido = $linha | ConvertFrom-Json
    if ($pedido.acao -eq 'focar') { $r = @{ ok = [NikoJanelas]::Focar([long]$pedido.janela) } }
    elseif ($pedido.acao -eq 'minimizar') { $r = @{ ok = [NikoJanelas]::Minimizar([long]$pedido.janela) } }
    elseif ($pedido.acao -eq 'fechar') { $r = @{ ok = [NikoJanelas]::Fechar([long]$pedido.janela) } }
    else {
      $lista = @()
      foreach ($j in [NikoJanelas]::Listar()) {
        if (-not $caminhos.ContainsKey($j.Pid)) {
          $p = Get-Process -Id $j.Pid -ErrorAction SilentlyContinue
          $caminho = [NikoJanelas]::CaminhoDoProcesso([uint32]$j.Pid)
          if (-not $caminho -and $p) { try { $caminho = $p.Path } catch { } }
          $descricao = $null
          if ($caminho) { try { $descricao = [Diagnostics.FileVersionInfo]::GetVersionInfo($caminho).FileDescription } catch { } }
          if (-not $descricao -and $p) { try { $descricao = $p.MainModule.FileVersionInfo.FileDescription } catch { } }
          $caminhos[$j.Pid] = @{ nome = $(if ($p) { $p.ProcessName } else { '' }); caminho = $caminho; descricao = $descricao }
        }
        $info = $caminhos[$j.Pid]
        if ($info.nome -eq 'niko' -or ($info.nome -eq 'ApplicationFrameHost' -and $j.Titulo -eq '')) { continue }
        $lista += @{ id = [string]$j.Id; pid = $j.Pid; titulo = $j.Titulo; minimizada = $j.Minimizada; ativa = $j.Ativa; app = $info.nome; nome = $(if ($info.descricao) { $info.descricao } else { $info.nome }); caminho = $info.caminho; icone = (IconeDaJanela $j.Pid $j.Id $info.caminho $info.nome $info.descricao $j.Titulo) }
      }
      $r = @{ janelas = $lista }
    }
    $r.id = $pedido.id
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress -Depth 4))
  } catch {
    [Console]::Out.WriteLine((@{ id = $pedido.id; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

const janelas = criarProcessoPowerShell("niko-janelas", SCRIPT, "janelas_encerrado");

export function pedirJanelas(acao: "listar" | "focar" | "minimizar" | "fechar", janela?: string): Promise<unknown> {
  if (janela !== undefined && !/^\d{1,20}$/.test(janela)) return Promise.reject(new Error("janela_invalida"));
  return janelas.pedir({ acao, janela }, 20000);
}

export function encerrarJanelas() {
  janelas.encerrar();
}
