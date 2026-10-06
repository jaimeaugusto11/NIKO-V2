import { useEffect, useRef, useState } from "react";
import { Search, Sun, Moon, PanelLeftClose, PanelLeftOpen, Circle, CheckCircle2, Settings, ChevronDown } from "lucide-react";
import { useConfig, GRUPO_DA_ROTA } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { useRotina, tarefasDoDia } from "../../estado/rotina";
import { useEstudos, revisoesParaHoje } from "../../estado/estudos";
import { useAgentes } from "../../estado/agentes";
import { useOrganizacao } from "../../estado/organizacao";
import { T } from "../../textos/textos";
import { ICONE_ROTA } from "./rotas";
import { LogoNiko } from "../../componentes/LogoNiko";
import { Avatar } from "../../componentes/FotoPerfil";
import { hojeISO } from "../../utilitarios/datas";
import { Tecla } from "../../componentes/basicos";
import type { Rota } from "../../tipos";
import { funcaoLigada, rotaLigada } from "../../utilitarios/funcoes";

function useContadores(): Partial<Record<Rota, { n: number; alerta?: boolean }>> {
  const hoje = hojeISO();
  const tarefas = useRotina((s) => tarefasDoDia(s.tarefas, hoje).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length);
  const revisoes = useEstudos((s) => revisoesParaHoje(s));
  const falhas = useAgentes((s) => s.alertas.filter((a) => a.servico).length);
  const eventos = useOrganizacao((s) => s.eventos.filter((e) => e.data === hoje).length);
  return {
    journal: { n: tarefas },
    estudos: { n: revisoes },
    conexoes: { n: falhas, alerta: true },
    calendario: { n: eventos },
  };
}

export function BarraLateral({ recolhida }: { recolhida: boolean }) {
  const barra = useConfig((s) => s.barraLateral);
  const tema = useConfig((s) => s.tema);
  const nome = useConfig((s) => s.nome);
  const fechados = useConfig((s) => s.gruposFechados);
  const definir = useConfig((s) => s.definir);
  const recolhidaManual = useConfig((s) => s.barraRecolhida);
  const rota = useInterface((s) => s.rota);
  const irPara = useInterface((s) => s.irPara);
  const abrirBusca = useInterface((s) => s.abrirBusca);
  const tarefas = useRotina((s) => s.tarefas);
  const mudarStatus = useRotina((s) => s.mudarStatus);
  const contadores = useContadores();
  const rolagem = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ topo: false, base: false });
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const hoje = tarefasDoDia(tarefas, hojeISO()).filter((t) => t.status !== "cancelada").slice(0, 5);
  const visiveis = barra.filter((i) => i.visivel && rotaLigada(i.rota, desligadas));
  const mostrarHoje = funcaoLigada("journal", desligadas);

  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const medir = () => setFade({ topo: el.scrollTop > 4, base: el.scrollTop + el.clientHeight < el.scrollHeight - 4 });
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      obs.disconnect();
    };
  }, [recolhida, fechados.length]);

  const grupos = (["principal", "organizacao", "ferramentas"] as const).map((g) => ({
    grupo: g,
    itens: visiveis.filter((i) => GRUPO_DA_ROTA[i.rota] === g && i.rota !== "configuracoes"),
  }));

  const alternarGrupo = (g: string) => definir({ gruposFechados: fechados.includes(g) ? fechados.filter((x) => x !== g) : [...fechados, g] });

  const item = (r: Rota, nomeItem?: string) => {
    const Icone = ICONE_ROTA[r];
    const ativo = rota === r;
    const rotulo = nomeItem || T.rotas[r];
    const posicao = visiveis.findIndex((v) => v.rota === r) + 1;
    const contador = contadores[r];
    const atalho = posicao > 0 && posicao <= 9 ? ` (Ctrl + ${posicao})` : "";
    return (
      <button key={r} type="button" className="barra-item" aria-current={ativo ? "page" : undefined} title={`${rotulo}${atalho}`} onClick={() => irPara(r)}>
        <Icone size={16} />
        {!recolhida && <span className="cortar">{rotulo}</span>}
        {contador && contador.n > 0 && <span className={`barra-contador ${contador.alerta ? "barra-contador-alerta" : ""}`} aria-label={String(contador.n)}>{recolhida ? "" : contador.n}</span>}
      </button>
    );
  };

  const sistemaEscuro = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const escuroAgora = tema === "escuro" || (tema === "sistema" && sistemaEscuro);
  const hojeFechado = fechados.includes("hoje");

  return (
    <nav className={`barra-lateral ${recolhida ? "barra-recolhida" : ""}`} aria-label={T.barraLateral.navegacao}>
      <div className="barra-topo">
        <LogoNiko tamanho={26} />
        {!recolhida && <span className="barra-marca">{T.app.nome}</span>}
        {!recolhida && (
          <button type="button" className="botao botao-fantasma botao-pequeno botao-icone empurrar" aria-label={T.barraLateral.recolher} title={`${T.barraLateral.recolher} (Ctrl + B)`} onClick={() => definir({ barraRecolhida: !recolhidaManual })}>
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>
      {recolhida && (
        <button type="button" className="barra-item" aria-label={T.barraLateral.expandir} title={`${T.barraLateral.expandir} (Ctrl + B)`} onClick={() => definir({ barraRecolhida: false })}>
          <PanelLeftOpen size={16} />
        </button>
      )}
      <button type="button" className="barra-busca" onClick={() => abrirBusca(true)} aria-label={T.barraLateral.buscar}>
        <Search size={14} />
        {!recolhida && (
          <>
            <span>{T.barraLateral.buscar}</span>
            <Tecla>Ctrl K</Tecla>
          </>
        )}
      </button>
      <div ref={rolagem} className="barra-rolagem" data-fade-topo={fade.topo ? "sim" : "nao"} data-fade-base={fade.base ? "sim" : "nao"}>
        {grupos.map(({ grupo, itens }) => {
          if (itens.length === 0) return null;
          const fechado = !recolhida && fechados.includes(grupo) && !itens.some((i) => i.rota === rota);
          return (
            <div key={grupo} className="barra-grupo">
              {!recolhida && (
                <button type="button" className="barra-rotulo" aria-expanded={!fechado} onClick={() => alternarGrupo(grupo)}>
                  <span className="rotulo-secao">{T.gruposBarra[grupo]}</span>
                  <ChevronDown size={12} className="barra-rotulo-seta" />
                </button>
              )}
              {!fechado && itens.map((i) => item(i.rota, i.nome))}
            </div>
          );
        })}
        {!recolhida && mostrarHoje && (
          <div className="barra-grupo">
            <button type="button" className="barra-rotulo" aria-expanded={!hojeFechado} onClick={() => alternarGrupo("hoje")}>
              <span className="rotulo-secao">{T.gruposBarra.hoje}</span>
              <ChevronDown size={12} className="barra-rotulo-seta" />
            </button>
            {!hojeFechado &&
              (hoje.length === 0 ? (
                <span className="barra-hoje-vazio">{T.barraLateral.semTarefasHoje}</span>
              ) : (
                hoje.map((t) => (
                  <div key={t.id} className="barra-hoje">
                    <button type="button" aria-label={t.status === "concluida" ? T.geral.reabrir : T.geral.concluir} onClick={() => mudarStatus(t.id, t.status === "concluida" ? "a_fazer" : "concluida")} className="barra-hoje-marca">
                      {t.status === "concluida" ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    </button>
                    <span className={`cortar ${t.status === "concluida" ? "riscado" : ""}`}>{t.titulo}</span>
                    {t.hora && <span className="texto-3 numero">{t.hora}</span>}
                  </div>
                ))
              ))}
          </div>
        )}
      </div>
      <div className="barra-base">
        <div className="barra-base-linha">
          <button type="button" className="barra-perfil" title={T.perfil.abrirPerfil} onClick={() => irPara("configuracoes", { secao: "geral" })}>
            <Avatar tamanho={28} />
            {!recolhida && <span className="cortar">{nome || T.barraLateral.perfil}</span>}
          </button>
          {!recolhida && (
            <>
              <button type="button" className="barra-icone" role="switch" aria-checked={escuroAgora} aria-label={escuroAgora ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro} title={escuroAgora ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro} onClick={() => definir({ tema: escuroAgora ? "claro" : "escuro" })}>
                {escuroAgora ? <Moon size={15} /> : <Sun size={15} />}
              </button>
              <button type="button" className="barra-icone" aria-current={rota === "configuracoes" ? "page" : undefined} aria-label={T.rotas.configuracoes} title={T.rotas.configuracoes} onClick={() => irPara("configuracoes")}>
                <Settings size={15} />
              </button>
            </>
          )}
        </div>
        {recolhida && (
          <>
            <button type="button" className="barra-item" aria-label={escuroAgora ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro} title={escuroAgora ? T.barraLateral.temaClaro : T.barraLateral.temaEscuro} onClick={() => definir({ tema: escuroAgora ? "claro" : "escuro" })}>
              {escuroAgora ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            {item("configuracoes")}
          </>
        )}
      </div>
    </nav>
  );
}
