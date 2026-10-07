import { useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { Ilha } from "../janelas/ilha/Ilha";
import { Dock } from "../janelas/dock/Dock";
import { JanelaSistema } from "../janelas/sistema/JanelaSistema";
import { JanelaConexao } from "../modulos/conexoes/JanelaConexao";
import { BuscaGlobal } from "../modulos/busca/BuscaGlobal";
import { CapturaRapida } from "../modulos/busca/CapturaRapida";
import { PrimeiraExecucao } from "../modulos/configuracoes/PrimeiraExecucao";
import { useInterface } from "../estado/interface";
import { useConfig } from "../estado/configuracoes";
import { usarTema } from "../janelas/area-de-trabalho/usarTema";
import { usarAtalhos } from "../janelas/area-de-trabalho/usarAtalhos";
import { useServicos } from "../servicos/servicos";
import { PRINCIPAL, janelaAtual, ouvirComandos, ouvirEvento, sincronizarInicioComWindows } from "./desktop";
import { usarSincronia } from "./sincronia";
import { usarSincroniaNuvem } from "../sincronia/sincronizar";

export function AppSistema() {
  usarTema();
  usarAtalhos();
  usarSincronia();
  usarSincroniaNuvem();
  const janelas = useInterface((s) => s.janelasConexao);
  const primeira = useConfig((s) => s.primeiraExecucaoFeita);
  const iniciarComWindows = useConfig((s) => s.iniciarComWindows);

  useEffect(() => {
    void sincronizarInicioComWindows(iniciarComWindows);
  }, [iniciarComWindows]);

  useEffect(
    () =>
      ouvirComandos((c) => {
        const ui = useInterface.getState();
        if (c.tipo === "irPara") ui.irParaLocal(c.rota, c.parametros);
        if (c.tipo === "abrirConexao") ui.abrirJanelaConexaoLocal(c.id);
        if (c.tipo === "abrirBusca") ui.abrirBusca(true);
        if (c.tipo === "abrirCaptura") ui.abrirCaptura(true);
      }),
    [],
  );

  useEffect(() => {
    let desligar = () => undefined as void;
    void ouvirEvento("niko://captura", () => useInterface.getState().abrirCaptura(true)).then((f) => (desligar = f));
    return () => desligar();
  }, []);

  return (
    <div className="area-trabalho area-nativa">
      <JanelaSistema />
      <AnimatePresence>
        {janelas.filter((j) => !j.minimizada).map((j) => (
          <JanelaConexao key={j.id} janela={j} />
        ))}
      </AnimatePresence>
      <BuscaGlobal />
      <CapturaRapida />
      {!primeira && <PrimeiraExecucao />}
    </div>
  );
}

function usarMostrarAoMontar() {
  useEffect(() => {
    const t = window.setTimeout(() => void janelaAtual().then((j) => j.show()), 120);
    return () => window.clearTimeout(t);
  }, []);
}

function Servicos() {
  useServicos();
  return null;
}

export function AppIlha() {
  usarMostrarAoMontar();
  usarTema();
  usarSincronia();
  return (
    <div className="area-sobreposta">
      {PRINCIPAL && <Servicos />}
      <Ilha />
    </div>
  );
}

export function AppDock() {
  usarMostrarAoMontar();
  usarTema();
  usarSincronia();
  return (
    <div className="area-sobreposta">
      <Dock />
    </div>
  );
}
