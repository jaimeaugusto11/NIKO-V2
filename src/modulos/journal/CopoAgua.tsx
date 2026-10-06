import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GlassWater, Minus, Plus, Check, Settings2 } from "lucide-react";
import { Botao, Cartao, Campo } from "../../componentes/basicos";
import { useRotina, DIA_VAZIO } from "../../estado/rotina";
import { useConfig } from "../../estado/configuracoes";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";

const BASE = 168;
const TOPO = 36;
const CORPO = "M64 36 L156 36 L144 168 Q143 176 135 176 L85 176 Q77 176 76 168 Z";

function litros(ml: number) {
  return (ml / 1000).toLocaleString("pt-BR", { minimumFractionDigits: ml % 1000 === 0 ? 0 : 1, maximumFractionDigits: 2 });
}

export function CopoAgua({ data }: { data: string }) {
  const dia = useRotina((s) => s.dias[data] ?? DIA_VAZIO);
  const atualizarDia = useRotina((s) => s.atualizarDia);
  const agua = useConfig((s) => s.agua);
  const definir = useConfig((s) => s.definir);
  const [despejando, setDespejando] = useState(0);
  const [ajustando, setAjustando] = useState(false);
  const [meta, setMeta] = useState(String(agua.meta));
  const [copo, setCopo] = useState(String(agua.copo));
  const temporizador = useRef<number | undefined>(undefined);
  const ml = dia.agua ?? 0;
  const p = Math.min(1, ml / Math.max(1, agua.meta));
  const nivel = BASE - (BASE - TOPO - 8) * p;
  const completo = ml >= agua.meta;

  const pendente = useRef(0);

  const gravarPendente = () => {
    window.clearTimeout(temporizador.current);
    if (!pendente.current) return;
    const atual = useRotina.getState().dias[data]?.agua ?? 0;
    const novo = Math.min(10000, atual + pendente.current);
    pendente.current = 0;
    atualizarDia(data, { agua: novo });
    if (novo >= useConfig.getState().agua.meta && atual < useConfig.getState().agua.meta) void tocarSom("proud", "personagens");
  };

  useEffect(() => () => gravarPendente(), [data]);

  const adicionar = (quantidade: number) => {
    if (quantidade > 0) {
      setDespejando((n) => n + 1);
      void tocarSom("gulp", "interface");
      pendente.current += quantidade;
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(gravarPendente, 520);
      return;
    }
    gravarPendente();
    const atual = useRotina.getState().dias[data]?.agua ?? 0;
    atualizarDia(data, { agua: Math.max(0, atual + quantidade) });
  };

  const salvarAjuste = (e: React.FormEvent) => {
    e.preventDefault();
    const m = Math.round(Number(meta));
    const c = Math.round(Number(copo));
    if (!(m >= 250 && m <= 10000) || !(c >= 50 && c <= 2000)) return;
    definir({ agua: { meta: m, copo: c } });
    setAjustando(false);
  };

  const copos = Math.ceil(agua.meta / agua.copo);
  const bebidos = Math.floor(ml / agua.copo);

  return (
    <Cartao
      className="col-4 cartao-agua"
      titulo={T.journal.agua}
      icone={<GlassWater size={16} />}
      acoes={<Botao pequeno soIcone variante="fantasma" icone={<Settings2 size={13} />} aria-label={T.journal.aguaAjustar} title={T.journal.aguaAjustar} onClick={() => setAjustando((a) => !a)} />}
    >
      <div className="agua">
        <svg className="agua-cena" viewBox="0 0 220 186" role="img" aria-label={T.journal.aguaRotulo(litros(ml), litros(agua.meta))}>
          <defs>
            <clipPath id="agua-corpo">
              <path d={CORPO} />
            </clipPath>
            <linearGradient id="agua-liquido" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={completo ? "#5eead4" : "#7dd3fc"} />
              <stop offset="1" stopColor={completo ? "#14b8a6" : "#2563eb"} />
            </linearGradient>
          </defs>

          <AnimatePresence>
            {despejando > 0 && (
              <motion.g key={despejando} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.2, times: [0, 0.08, 0.78, 1] }} onAnimationComplete={() => setDespejando(0)}>
                <motion.rect
                  x={106.5}
                  width={7}
                  rx={3.5}
                  fill="url(#agua-liquido)"
                  initial={{ y: -4, height: 0 }}
                  animate={{ y: [-4, -4, -4, nivel - 6], height: [0, nivel + 2, nivel + 2, 4] }}
                  transition={{ duration: 1.2, times: [0, 0.28, 0.7, 1], ease: "easeIn" }}
                />
                {[0, 1, 2].map((i) => (
                  <motion.circle
                    key={i}
                    cx={104 + i * 6}
                    r={2.4}
                    fill="#93c5fd"
                    initial={{ cy: -4, opacity: 0 }}
                    animate={{ cy: [-4, nivel - 4], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.55, delay: 0.15 + i * 0.18, ease: "easeIn" }}
                  />
                ))}
                {[0, 1].map((i) => (
                  <motion.ellipse
                    key={`o-${i}`}
                    cx={110}
                    cy={nivel - 2}
                    fill="none"
                    stroke="#bae6fd"
                    strokeWidth={2}
                    initial={{ rx: 3, ry: 1.2, opacity: 0 }}
                    animate={{ rx: [3, 30], ry: [1.2, 5], opacity: [0.9, 0] }}
                    transition={{ duration: 0.7, delay: 0.3 + i * 0.3, ease: "easeOut" }}
                  />
                ))}
              </motion.g>
            )}
          </AnimatePresence>
          <g clipPath="url(#agua-corpo)">
            <motion.g initial={false} animate={{ y: nivel - TOPO }} transition={{ type: "spring", visualDuration: 0.9, bounce: 0.25 }}>
              <g className="agua-onda">
                <path d={`M-60 ${TOPO} q 20 -7 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 V 400 H -60 Z`} fill="url(#agua-liquido)" />
              </g>
              <g className="agua-onda agua-onda-2">
                <path d={`M-80 ${TOPO + 3} q 20 -6 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 V 400 H -80 Z`} fill="url(#agua-liquido)" opacity="0.5" />
              </g>
              {p > 0.05 && [0, 1, 2].map((i) => <circle key={i} className="agua-bolha" cx={90 + i * 22} cy={TOPO + 60 + i * 18} r={2.5 + i} style={{ animationDelay: `${i * 0.9}s` }} />)}
            </motion.g>
          </g>
          <path d={CORPO} className="agua-vidro" />
          <path d="M74 48 L82 160" className="agua-brilho" />
          {[0.25, 0.5, 0.75].map((m) => (
            <line key={m} x1="140" x2="148" y1={BASE - (BASE - TOPO - 8) * m} y2={BASE - (BASE - TOPO - 8) * m} className="agua-marca" />
          ))}
        </svg>

        <div className="agua-info">
          <div className="agua-total">
            <span className="numero-grande">{litros(ml)} L</span>
            <span className="texto-3">{T.journal.aguaDe(litros(agua.meta))}</span>
          </div>
          {completo ? (
            <span className="etiqueta etiqueta-sucesso"><Check size={11} />{T.journal.aguaCompleta}</span>
          ) : (
            <span className="texto-2" style={{ fontSize: 12 }}>{T.journal.aguaFalta(litros(agua.meta - ml))}</span>
          )}
          <div className="agua-copos" aria-hidden="true">
            {Array.from({ length: Math.min(copos, 16) }, (_, i) => <span key={i} data-cheio={i < bebidos ? "sim" : "nao"} />)}
          </div>
          <div className="linha" style={{ gap: 6, flexWrap: "wrap" }}>
            <Botao pequeno variante="primario" icone={<Plus size={13} />} onClick={() => adicionar(agua.copo)}>{T.journal.aguaCopo(agua.copo)}</Botao>
            <Botao pequeno icone={<Plus size={13} />} onClick={() => adicionar(500)}>{T.journal.aguaGarrafa}</Botao>
            <Botao pequeno soIcone variante="fantasma" icone={<Minus size={13} />} aria-label={T.journal.aguaTirar} title={T.journal.aguaTirar} disabled={ml === 0} onClick={() => adicionar(-agua.copo)} />
          </div>
        </div>
      </div>
      {ajustando && (
        <form className="formulario-linha" style={{ marginTop: 12, alignItems: "end" }} onSubmit={salvarAjuste} noValidate>
          <Campo id="ag-meta" rotulo={T.journal.aguaMeta} dica={T.journal.aguaMetaDica}>
            <input id="ag-meta" className="campo" inputMode="numeric" value={meta} onChange={(e) => setMeta(e.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Campo id="ag-copo" rotulo={T.journal.aguaTamanhoCopo}>
            <input id="ag-copo" className="campo" inputMode="numeric" value={copo} onChange={(e) => setCopo(e.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Botao type="submit" pequeno variante="primario">{T.geral.salvar}</Botao>
        </form>
      )}
    </Cartao>
  );
}
