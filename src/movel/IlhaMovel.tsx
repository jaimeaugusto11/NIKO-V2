import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useIlha, type Revelacao } from "../estado/ilha";
import { useConfig } from "../estado/configuracoes";
import { Personagem } from "../personagens/Personagem";
import { Marca } from "../marcas/Marca";
import { LogoNiko } from "../componentes/LogoNiko";
import { T } from "../textos/textos";

const ESTADO_DO_TIPO = { sucesso: "sucesso", alerta: "alerta", info: "ouvindo" } as const;

function Rosto({ r }: { r: Revelacao }) {
  if (r.agente) return <Personagem agente={r.agente} estado={ESTADO_DO_TIPO[r.tipo]} tamanho={40} interativo={false} halo={false} olhar={false} />;
  if (r.marca) return <span className="movel-ilha-marca"><Marca marca={r.marca} tamanho={22} /></span>;
  return <span className="movel-ilha-marca"><LogoNiko tamanho={22} /></span>;
}

/** No celular a ilha vira um aviso que desce do topo, com o agente que está falando. */
export function IlhaMovel({ aoAbrir }: { aoAbrir: (r: Revelacao) => void }) {
  const revelacao = useIlha((s) => s.revelacao);
  const dispensar = useIlha((s) => s.dispensarRevelacao);
  const nomes = useConfig((s) => s.agentes.nomes);

  return (
    <div className="movel-ilha-area" aria-live="polite">
      <AnimatePresence>
        {revelacao && (
          <motion.div
            key={revelacao.texto}
            className={`movel-ilha movel-ilha-${revelacao.tipo}`}
            initial={{ y: -90, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -90, opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", visualDuration: 0.38, bounce: 0.32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.6, bottom: 0.1 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -30 || info.velocity.y < -300) dispensar();
            }}
          >
            <button
              type="button"
              className="movel-ilha-corpo"
              onClick={() => {
                aoAbrir(revelacao);
                dispensar();
              }}
            >
              <Rosto r={revelacao} />
              <span className="movel-ilha-texto">
                <b className="cortar">{revelacao.agente ? nomes[revelacao.agente] : T.app.nome}</b>
                <span>{revelacao.texto}</span>
              </span>
            </button>
            <button type="button" className="movel-ilha-fechar" aria-label={T.movel.dispensar} onClick={dispensar}>
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
