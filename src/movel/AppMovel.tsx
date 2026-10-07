import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, LayoutGrid, MessagesSquare, Plus, Sun, type LucideIcon } from "lucide-react";
import { useInterface } from "../estado/interface";
import { useIlha } from "../estado/ilha";
import { useAtualizacao } from "../estado/atualizacao";
import { NATIVO } from "../desktop/desktop";
import { usarTema } from "../janelas/area-de-trabalho/usarTema";
import { useServicos } from "../servicos/servicos";
import { usarSincronia } from "../desktop/sincronia";
import { usarSincroniaNuvem } from "../sincronia/sincronizar";
import { PAGINA_ROTA } from "../janelas/sistema/rotas";
import { CapturaRapida } from "../modulos/busca/CapturaRapida";
import { AvisosRodape } from "../componentes/basicos";
import { T } from "../textos/textos";
import type { Rota } from "../tipos";
import { Hoje } from "./Hoje";
import { Agentes } from "./Agentes";
import { Mais } from "./Mais";
import { IlhaMovel } from "./IlhaMovel";
import { usarNotificacoesMoveis } from "./notificacoes";
import { usarComportamentoMovel } from "./comportamento";
import { PainelMovel } from "./painel";
import type { Revelacao } from "../estado/ilha";
import "./movel.css";

type Aba = "hoje" | "agentes" | "agenda" | "mais";

const ICONE_ABA: Record<Aba, LucideIcon> = { hoje: Sun, agentes: MessagesSquare, agenda: CalendarDays, mais: LayoutGrid };

/** O botão voltar do Android anda pelo histórico da WebView, por isso cada nível aberto ganha uma entrada. */
function usarVoltar(nivel: number, fechar: () => void) {
  const fecharAtual = useRef(fechar);
  fecharAtual.current = fechar;
  const empilhados = useRef(0);
  const ignorar = useRef(false);

  useEffect(() => {
    const aoVoltar = () => {
      if (ignorar.current) {
        ignorar.current = false;
        return;
      }
      empilhados.current = Math.max(0, empilhados.current - 1);
      fecharAtual.current();
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  useEffect(() => {
    while (empilhados.current < nivel) {
      empilhados.current++;
      window.history.pushState({ nivelMovel: empilhados.current }, "");
    }
    if (empilhados.current > nivel) {
      const voltar = empilhados.current - nivel;
      empilhados.current = nivel;
      ignorar.current = true;
      window.history.go(-voltar);
    }
  }, [nivel]);
}

function Carregando() {
  return <div className="movel-carregando" aria-busy="true" />;
}

function Tela({ aoVoltar }: { aoVoltar: () => void }) {
  const rota = useInterface((s) => s.rota);
  const Pagina = PAGINA_ROTA[rota];
  return (
    <div className="movel-tela">
      <header className="movel-tela-topo">
        <button type="button" className="movel-botao-icone" aria-label={T.movel.voltar} onClick={aoVoltar}>
          <ArrowLeft size={20} />
        </button>
        <b className="cortar">{T.rotas[rota]}</b>
      </header>
      <div className="movel-tela-conteudo">
        <Suspense fallback={<Carregando />}>
          <div className="pagina" key={rota}>
            <Pagina />
          </div>
        </Suspense>
      </div>
    </div>
  );
}

export function AppMovel() {
  usarTema();
  usarSincronia();
  usarSincroniaNuvem();
  useServicos();
  usarNotificacoesMoveis();
  usarComportamentoMovel();
  const [aba, setAba] = useState<Aba>("hoje");
  const [telaAberta, setTelaAberta] = useState(false);
  const capturaAberta = useInterface((s) => s.capturaAberta);
  const abrirCaptura = useInterface((s) => s.abrirCaptura);
  const Calendario = PAGINA_ROTA.calendario;
  const faseAtualizacao = useAtualizacao((s) => s.fase);
  const versaoNova = useAtualizacao((s) => s.versao);

  useEffect(() => {
    if (!NATIVO) return;
    const primeira = window.setTimeout(() => void useAtualizacao.getState().verificar(), 15000);
    const sempre = window.setInterval(() => void useAtualizacao.getState().verificar(), 6 * 3600000);
    return () => {
      window.clearTimeout(primeira);
      window.clearInterval(sempre);
    };
  }, []);

  useEffect(() => {
    if (!NATIVO || faseAtualizacao !== "disponivel") return;
    useIlha.getState().revelar({ texto: T.ilha.atualizacao.disponivel(versaoNova), tipo: "info" }, 8000, "alta");
  }, [faseAtualizacao, versaoNova]);

  usarVoltar((aba !== "hoje" ? 1 : 0) + (telaAberta ? 1 : 0) + (capturaAberta ? 1 : 0), () => {
    if (useInterface.getState().capturaAberta) abrirCaptura(false);
    else if (telaAberta) setTelaAberta(false);
    else setAba("hoje");
  });

  const abrir = (rota: Rota, parametros: Record<string, string> = {}) => {
    useInterface.getState().irParaLocal(rota, parametros);
    setTelaAberta(true);
  };

  const irParaAba = (a: Aba) => {
    setTelaAberta(false);
    setAba(a);
  };

  const abrirAviso = (r: Revelacao) => {
    if (r.aba === "chat") return abrir("chat");
    if (r.aba === "conexoes") return abrir("conexoes");
    if (r.aba === "calendario") return irParaAba("agenda");
    if (r.aba === "captura") return abrirCaptura(true);
    if (r.texto === T.ilha.atualizacao.disponivel(useAtualizacao.getState().versao)) return abrir("atualizacao");
    irParaAba("hoje");
  };

  return (
    <div className="app-movel">
      <PainelMovel />
      <IlhaMovel aoAbrir={abrirAviso} />
      <main className="movel-conteudo" hidden={telaAberta}>
        {aba === "hoje" && <Hoje abrirAgentes={() => setAba("agentes")} />}
        {aba === "agentes" && <Agentes abrirConversa={(p) => abrir("chat", p)} />}
        {aba === "agenda" && (
          <Suspense fallback={<Carregando />}>
            <div className="pagina movel-pagina-modulo">
              <Calendario />
            </div>
          </Suspense>
        )}
        {aba === "mais" && <Mais abrir={abrir} />}
      </main>

      {telaAberta && <Tela aoVoltar={() => setTelaAberta(false)} />}

      {!telaAberta && (
        <nav className="movel-navegacao" aria-label={T.movel.navegacao}>
          {(["hoje", "agentes"] as const).map((a) => <BotaoAba key={a} aba={a} atual={aba} aoEscolher={setAba} />)}
          <button type="button" className="movel-capturar" aria-label={T.movel.capturar} onClick={() => abrirCaptura(true)}>
            <Plus size={26} />
          </button>
          {(["agenda", "mais"] as const).map((a) => <BotaoAba key={a} aba={a} atual={aba} aoEscolher={setAba} />)}
        </nav>
      )}

      <CapturaRapida />
      <AvisosRodape />
    </div>
  );
}

function BotaoAba({ aba, atual, aoEscolher }: { aba: Aba; atual: Aba; aoEscolher: (a: Aba) => void }) {
  const Icone = ICONE_ABA[aba];
  return (
    <button type="button" className="movel-aba" aria-current={aba === atual ? "page" : undefined} onClick={() => aoEscolher(aba)}>
      <Icone size={22} />
      <span>{T.movel.abas[aba]}</span>
    </button>
  );
}
