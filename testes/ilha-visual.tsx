import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/estilos/tokens.css";
import "../src/estilos/base.css";
import "../src/estilos/componentes.css";
import "../src/estilos/modulos.css";

const memoria = new Map<string, string>();
Object.defineProperty(window, "localStorage", { value: { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => memoria.set(k, v), removeItem: (k: string) => memoria.delete(k) } });
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (entrada, opcoes) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url, location.href);
  if (url.pathname.startsWith("/ponte/") || url.origin !== location.origin) return new Response("{}", { status: 503 });
  return fetchOriginal(entrada, opcoes);
};
const erros: string[] = [];
window.addEventListener("error", (e) => erros.push(e.message));
window.addEventListener("unhandledrejection", (e) => erros.push(String(e.reason)));
const [{ Ilha }, { useIlha }, { useConfig }, { EtapasAnimadas }, { TrajetoDoArquivo }, { ZonaDeSoltar, useAnexos }] = await Promise.all([
  import("../src/janelas/ilha/Ilha"), import("../src/estado/ilha"), import("../src/estado/configuracoes"),
  import("../src/janelas/ilha/animacoes/EtapasAnimadas"), import("../src/janelas/ilha/animacoes/TrajetoDoArquivo"),
  import("../src/componentes/AnexosChat"),
]);
useConfig.setState((s) => ({ sons: { ...s.sons, ligado: false }, ilha: { ...s.ilha, modo: "fixo", laterais: false, fechamentoSeg: 0 } }));
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
function Tela() {
  const zona = useRef<HTMLDivElement>(null);
  const [etapas, definirEtapas] = useState([{ id: "0", texto: "Etapa inicial" }]);
  const [contexto, definirContexto] = useState("sessao-a");
  const [resultado, definirResultado] = useState("Pronto para testar");
  const [rodando, definirRodando] = useState(false);
  const [erroAnexo, definirErroAnexo] = useState("");
  const anexos = useAnexos(definirErroAnexo);
  const recebimento = useRef<HTMLDivElement>(null);
  const conferir = (condicao: boolean, mensagem: string) => { if (!condicao) throw new Error(mensagem); };
  const alinhado = () => {
    const alvo = document.querySelector<HTMLElement>(`[data-personagem-posicao="${useIlha.getState().estado}"]`);
    const personagem = document.querySelector<HTMLElement>(".ilha-personagem-continuo");
    if (!alvo || !personagem) return false;
    const a = alvo.getBoundingClientRect(), b = personagem.getBoundingClientRect();
    return Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2 && Math.abs(a.width - b.width) < 2;
  };
  const soltar = (comArquivo: boolean) => {
    const el = zona.current!;
    const r = el.getBoundingClientRect();
    const dados = new DataTransfer();
    if (comArquivo) dados.items.add(new File(["Teste local"], "teste.txt", { type: "text/plain" }));
    el.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dados, clientX: r.left + 30, clientY: r.top + 30 }));
  };
  const executar = async () => {
    definirRodando(true);
    let total = 0;
    const ok = (condicao: boolean, mensagem: string) => { conferir(condicao, mensagem); total++; definirResultado(`${total} verificacoes passaram`); };
    try {
      useIlha.getState().recolher(); await esperar(1100);
      const original = document.querySelector(".ilha-personagem-continuo > .personagem");
      ok(Boolean(original) && alinhado(), "Personagem compacto desalinhado");
      useIlha.getState().abrir("calendario"); await esperar(1250);
      ok(document.querySelector(".ilha-personagem-continuo > .personagem") === original, "Personagem remontado ao expandir");
      ok(alinhado(), "Personagem expandido desalinhado");
      for (const tamanho of ["pequena", "grande", "media"] as const) {
        useConfig.getState().definirIlha({ tamanho }); await esperar(1000);
        ok(alinhado(), `Desalinhamento na escala ${tamanho}`);
      }
      for (let i = 0; i < 6; i++) { useIlha.getState().definirEstado(i % 2 ? "expandida" : "compacta"); await esperar(70); }
      await esperar(1300); ok(alinhado(), "Trocas rapidas desalinhadas");
      useIlha.getState().abrir("chat"); await esperar(750);
      ok(document.querySelector<HTMLElement>(".ilha-personagem-continuo")?.style.visibility === "hidden", "Personagem flutuando sobre chat");
      useIlha.getState().abrir("calendario"); await esperar(1100); ok(alinhado(), "Retorno da aba chat desalinhado");
      definirEtapas(Array.from({ length: 30 }, (_, i) => ({ id: String(i), texto: `Etapa ${i}` }))); await esperar(2000);
      ok(document.querySelector("#etapas .ilha-etapas")?.textContent?.includes("Etapa 29") === true, "Fila nao terminou na etapa mais recente");
      definirContexto("sessao-b"); definirEtapas([{ id: "outro", texto: "Novo projeto" }]); await esperar(50);
      ok(!document.querySelector("#etapas")?.textContent?.includes("Etapa 29"), "Mistura de sessoes");
      soltar(false); await esperar(30); ok(!document.querySelector(".ilha-arquivo-em-voo"), "Efeito sem arquivo");
      soltar(true); await esperar(30); ok(Boolean(document.querySelector(".ilha-arquivo-em-voo")), "Arquivo nao iniciou trajeto");
      await esperar(550); ok(!document.querySelector(".ilha-arquivo-em-voo"), "Arquivo fantasma nao foi removido");
      useConfig.setState({ reduzirAnimacoes: true }); await esperar(50); soltar(true); await esperar(40);
      ok(!document.querySelector(".ilha-arquivo-em-voo"), "Movimento reduzido ignorado");
      useIlha.getState().recolher(); await esperar(1000); ok(alinhado(), "Movimento reduzido desalinhado");
      useConfig.setState({ reduzirAnimacoes: false });
      ok(erros.length === 0, erros.join("; "));
      definirResultado(`${total} verificacoes passaram. Nenhum erro de execucao.`);
    } catch (e) { definirResultado(`FALHA: ${String(e)}`); }
    finally { definirRodando(false); }
  };
  const verificarCorrecoes = async () => {
    definirRodando(true);
    const falhas: string[] = [];
    let total = 0;
    const ok = (condicao: boolean, mensagem: string) => { total++; if (!condicao) falhas.push(mensagem); };
    const agentesOriginais = useConfig.getState().agentes;
    try {
      useConfig.setState({ reduzirAnimacoes: false, privacidade: false });
      await esperar(30); soltar(true); await esperar(30);
      ok(Boolean(document.querySelector(".ilha-arquivo-em-voo")), "Arquivo nao iniciou trajeto");
      useConfig.setState({ privacidade: true }); await esperar(30);
      ok(!document.querySelector(".ilha-arquivo-em-voo")?.textContent?.includes("teste.txt"), "Nome do arquivo exposto na privacidade");
      ok(!document.querySelector("#etapas [title]") && !document.querySelector("#etapas .ilha-etapas")?.hasAttribute("aria-label"), "Etapa privada exposta por tooltip ou rotulo");
      useConfig.setState({ reduzirAnimacoes: true }); await esperar(30);
      useConfig.setState({ reduzirAnimacoes: false }); await esperar(30);
      ok(!document.querySelector(".ilha-arquivo-em-voo"), "Arquivo antigo reapareceu ao reativar movimentos");
      useConfig.setState({ privacidade: false }); await esperar(30);
      ok(Boolean(document.querySelector("#etapas [title]")), "Tooltip nao retornou sem privacidade");
      useIlha.getState().abrir("calendario"); await esperar(1200);
      useConfig.setState({ agentes: { ...agentesOriginais, cargos: { ...agentesOriginais.cargos, organizador: "Guia" } } }); await esperar(900);
      ok(alinhado(), "Cargo curto desalinhou personagem");
      useConfig.setState({ agentes: { ...agentesOriginais, cargos: { ...agentesOriginais.cargos, organizador: "Gerente de projetos e planejamento pessoal" } } }); await esperar(900);
      ok(alinhado(), "Cargo com duas linhas desalinhou personagem");
      const el = recebimento.current!;
      const r = el.getBoundingClientRect();
      const dados = new DataTransfer();
      const invalido = new File(["Arquivo invalido"], "teste.exe", { type: "application/octet-stream" });
      dados.items.add(invalido);
      anexos.adicionar([invalido]);
      el.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dados, clientX: r.left + 40, clientY: r.top + 40 }));
      await esperar(150);
      ok(!el.querySelector(".personagem-imagem")?.getAttribute("src")?.includes("/sucesso.svg"), "Arquivo invalido recebeu estado de sucesso");
      ok(Boolean(document.querySelector("#erro-anexo")?.textContent), "Leitura invalida nao informou erro");
      ok(erros.length === 0, erros.join("; "));
      definirResultado(falhas.length ? `FALHA: ${falhas.join("; ")}` : `${total} correcoes verificadas. Nenhum erro de execucao.`);
    } catch (e) { definirResultado(`FALHA: ${String(e)}`); }
    finally { useConfig.setState({ agentes: agentesOriginais, privacidade: false, reduzirAnimacoes: false }); definirRodando(false); }
  };
  return <><Ilha /><main style={{ margin: "370px auto 0", width: 650, color: "#eee" }}>
    <h1>Verificacao isolada das animacoes</h1><p>Sem banco, provedores ou dados pessoais.</p>
    <button onClick={executar} disabled={rodando}>Executar verificacoes</button>
    <button onClick={verificarCorrecoes} disabled={rodando}>Verificar correcoes</button>
    <button onClick={() => useIlha.getState().abrir("calendario")}>Expandir</button>
    <button onClick={() => useIlha.getState().recolher()}>Recolher</button>
    <p role="status">{resultado}</p><div id="etapas"><EtapasAnimadas contexto={contexto} etapas={etapas} /></div>
    <div style={{ position: "relative", marginTop: 20 }}><div ref={zona} style={{ height: 140, position: "relative", border: "1px solid #666", borderRadius: 20 }}>
      <div className="zona-soltar-boneco" style={{ position: "absolute", width: 54, height: 54, left: 280, top: 30, borderRadius: 27, background: "#f55" }} />
      <TrajetoDoArquivo zona={zona} /></div></div>
    <button onClick={() => soltar(true)}>Testar arquivo local</button>
    <div ref={recebimento} style={{ position: "relative", height: 120, marginTop: 20 }}><ZonaDeSoltar ativo agente="organizador" compacta /></div>
    <p id="erro-anexo">{erroAnexo}</p>
  </main></>;
}
document.body.style.background = "#16171b";
createRoot(document.getElementById("root")!).render(<Tela />);
