import { useEffect, useState } from "react";
import { lerConsumo, type UsoFerramenta } from "../../../ponte/ponteLocal";
import { useConfig } from "../../../estado/configuracoes";
import { faltaPara, nivelDoUso, rotuloJanela } from "../../../utilitarios/consumo";
import { T } from "../../../textos/textos";

const C = T.ilha.claude;
const INTERVALO_MS = 60_000;

export function UsoDasIas() {
  const lerPlanos = useConfig((s) => s.consumo.lerPlanos);
  const [ferramentas, setFerramentas] = useState<UsoFerramenta[]>([]);

  useEffect(() => {
    if (!lerPlanos) {
      setFerramentas([]);
      return;
    }
    let vivo = true;
    const ler = () => {
      if (document.hidden) return;
      lerConsumo()
        .then((r) => vivo && setFerramentas(r.ferramentas.filter((f) => f.situacao === "ok" && f.janelas.length > 0)))
        .catch(() => undefined);
    };
    ler();
    const t = window.setInterval(ler, INTERVALO_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [lerPlanos]);

  if (ferramentas.length === 0) return null;

  return (
    <>
      {ferramentas.map((f) => (
        <span key={f.id} className="vsc-status-item vsc-uso">
          <b>{f.id === "claude" ? "Claude" : f.nome}</b>
          {f.janelas
            .filter((j) => C.uso.curtos[j.id])
            .map((j) => (
              <span key={j.id} className="vsc-uso-janela" data-nivel={nivelDoUso(j.usado)} title={C.uso.dica(f.nome, rotuloJanela(j.rotulo), Math.round(j.usado), faltaPara(j.reiniciaEm))}>
                {C.uso.curtos[j.id]} {Math.round(j.usado)}%
              </span>
            ))}
        </span>
      ))}
    </>
  );
}
