import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, ArrowUp } from "lucide-react";
import { avancarEtapa, criarEstadoEtapas, receberEtapas, type EtapaVisual } from "./regras";
import { usarMovimentoReduzido } from "./usarMovimentoReduzido";
import { useConfig } from "../../../estado/configuracoes";
import "./animacoes.css";

export function EtapasAnimadas({ contexto, etapas, compacta = false }: { contexto: string; etapas: readonly EtapaVisual[]; compacta?: boolean }) {
  const reduzir = usarMovimentoReduzido();
  const privacidade = useConfig((s) => s.privacidade);
  const [estado, setEstado] = useState(() => criarEstadoEtapas(contexto, etapas));
  const mostrado = reduzir || estado.contexto !== contexto ? criarEstadoEtapas(contexto, etapas) : estado;
  const proxima = mostrado.fila[0];
  const altura = compacta ? 12 : 20;

  useEffect(() => {
    setEstado((atual) => reduzir ? criarEstadoEtapas(contexto, etapas) : receberEtapas(atual, contexto, etapas));
  }, [contexto, etapas, reduzir]);

  useEffect(() => {
    if (!proxima || reduzir) return;
    if (document.hidden) {
      setEstado((atual) => criarEstadoEtapas(atual.contexto, [atual.atual, ...atual.fila].filter((etapa): etapa is EtapaVisual => etapa !== null)));
      return;
    }
    const relogio = window.setTimeout(() => setEstado((atual) => avancarEtapa(atual)), 380);
    const aoEsconder = () => {
      if (document.hidden) {
        window.clearTimeout(relogio);
        setEstado((atual) => criarEstadoEtapas(atual.contexto, [atual.atual, ...atual.fila].filter((etapa): etapa is EtapaVisual => etapa !== null)));
      }
    };
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.clearTimeout(relogio);
      document.removeEventListener("visibilitychange", aoEsconder);
    };
  }, [proxima?.id, contexto, reduzir]);

  if (!mostrado.atual) return null;
  const linhas = [mostrado.anterior, mostrado.atual, proxima];
  return (
    <span className={`ilha-etapas${compacta ? " ilha-etapas-compacta" : ""}`} aria-label={privacidade ? undefined : etapas.at(-1)?.texto}>
      {linhas.map((etapa, indice) => etapa && (
        <motion.span key={`${etapa.id}-${indice}`} className={`ilha-etapa${indice === 0 ? " ilha-etapa-anterior" : ""}`} aria-hidden="true"
          initial={indice === 2 && !reduzir ? { y: altura * 2, opacity: 0 } : false}
          animate={{ y: altura * (indice - (proxima ? 1 : 0)), opacity: indice === 0 ? proxima ? 0 : 0.5 : indice === 2 ? proxima ? 1 : 0 : proxima ? 0.5 : 1, scale: indice === 0 || indice === 1 && proxima ? 0.94 : 1 }}
          transition={{ duration: reduzir ? 0 : 0.38, ease: [0.4, 0, 0.2, 1] }}>
          {indice === 0 ? <ArrowUp size={compacta ? 8 : 11} /> : <ChevronRight size={compacta ? 9 : 12} />}
          <span className="cortar privado" title={privacidade ? undefined : etapa.texto}>{etapa.texto}</span>
        </motion.span>
      ))}
    </span>
  );
}

export function EtapaDeTrabalho({ contexto, texto }: { contexto: string; texto: string }) {
  const [historico, setHistorico] = useState(() => ({ contexto, etapas: [{ id: "0", texto }], numero: 0 }));
  useEffect(() => {
    setHistorico((atual) => {
      if (atual.contexto !== contexto) return { contexto, etapas: [{ id: "0", texto }], numero: 0 };
      if (atual.etapas.at(-1)?.texto === texto) return atual;
      const numero = atual.numero + 1;
      return { contexto, etapas: [...atual.etapas, { id: String(numero), texto }].slice(-12), numero };
    });
  }, [contexto, texto]);
  return <EtapasAnimadas contexto={contexto} etapas={historico.contexto === contexto ? historico.etapas : [{ id: "0", texto }]} compacta />;
}
