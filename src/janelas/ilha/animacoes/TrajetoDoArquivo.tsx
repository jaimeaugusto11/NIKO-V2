import { useEffect, useState, type RefObject } from "react";
import { motion } from "motion/react";
import { FileText } from "lucide-react";
import { calcularTrajetoArquivo } from "./regras";
import { usarMovimentoReduzido } from "./usarMovimentoReduzido";
import { useConfig } from "../../../estado/configuracoes";
import { T } from "../../../textos/textos";
import "./animacoes.css";

type Trajeto = NonNullable<ReturnType<typeof calcularTrajetoArquivo>> & { id: number; nome: string };

export function TrajetoDoArquivo({ zona }: { zona: RefObject<HTMLDivElement | null> }) {
  const reduzir = usarMovimentoReduzido();
  const privacidade = useConfig((s) => s.privacidade);
  const [trajeto, setTrajeto] = useState<Trajeto | null>(null);
  useEffect(() => {
    if (reduzir) {
      setTrajeto(null);
      return;
    }
    const el = zona.current;
    const pai = el?.parentElement;
    if (!el || !pai) return;
    let relogio: number | undefined;
    const soltar = (evento: DragEvent) => {
      if (document.hidden) return;
      const arquivos = Array.from(evento.dataTransfer?.files ?? []);
      const personagem = el.querySelector<HTMLElement>(".zona-soltar-boneco");
      if (!arquivos.length || !personagem || !pai.contains(evento.target as Node)) return;
      const retangulo = el.getBoundingClientRect();
      const escala = retangulo.width / el.offsetWidth;
      const destino = calcularTrajetoArquivo(retangulo, personagem.getBoundingClientRect(), { x: evento.clientX, y: evento.clientY }, escala);
      if (!destino) return;
      window.clearTimeout(relogio);
      setTrajeto({ ...destino, id: performance.now(), nome: arquivos[0].name });
      relogio = window.setTimeout(() => setTrajeto(null), 470);
    };
    const esconder = () => {
      if (document.hidden) {
        window.clearTimeout(relogio);
        setTrajeto(null);
      }
    };
    pai.addEventListener("drop", soltar, true);
    document.addEventListener("visibilitychange", esconder);
    return () => {
      window.clearTimeout(relogio);
      pai.removeEventListener("drop", soltar, true);
      document.removeEventListener("visibilitychange", esconder);
    };
  }, [zona, reduzir]);

  if (!trajeto || reduzir) return null;
  return (
    <motion.span key={trajeto.id} className="ilha-arquivo-em-voo" aria-hidden="true"
      initial={{ x: trajeto.origem.x, y: trajeto.origem.y, scale: 1, opacity: 1, rotate: -8 }}
      animate={{ x: [trajeto.origem.x, (trajeto.origem.x + trajeto.destino.x) / 2, trajeto.destino.x], y: [trajeto.origem.y, Math.min(trajeto.origem.y, trajeto.destino.y) - 16, trajeto.destino.y], scale: [1, 0.85, 0.08], opacity: [1, 1, 0], rotate: [-8, 5, 0] }}
      transition={{ duration: 0.38, ease: [0.4, 0, 0.8, 1], times: [0, 0.45, 1] }}>
      <span><FileText size={15} /><span className="cortar">{privacidade ? T.chat.anexos.arquivo : trajeto.nome}</span></span>
    </motion.span>
  );
}
