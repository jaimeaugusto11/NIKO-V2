import { useMemo, useState } from "react";
import { getDay } from "date-fns";
import { useRotina } from "../estado/rotina";
import { useEstudos } from "../estado/estudos";
import { usePomodoro } from "../estado/pomodoro";
import { useComunicacao } from "../estado/comunicacao";
import { useInterface } from "../estado/interface";
import { valoresDoMapa, type FonteMapa } from "../utilitarios/estatisticas";
import { deISO, formatar } from "../utilitarios/datas";
import { Pilulas } from "./basicos";
import { T } from "../textos/textos";

export function MapaDeCalor({ fonteInicial = "tudo", compacto }: { fonteInicial?: FonteMapa; compacto?: boolean }) {
  const [fonte, setFonte] = useState<FonteMapa>(fonteInicial);
  const [dica, setDica] = useState<{ x: number; y: number; texto: string } | null>(null);
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const registroRevisoes = useEstudos((s) => s.registroRevisoes);
  const sessoes = usePomodoro((s) => s.sessoes);
  const conexoes = useComunicacao((s) => s.conexoes);
  const irPara = useInterface((s) => s.irPara);

  const dias = useMemo(
    () => valoresDoMapa({ tarefas, habitos, registros, registroRevisoes, sessoes, conexoes }, fonte),
    [tarefas, habitos, registros, registroRevisoes, sessoes, conexoes, fonte],
  );

  const deslocamento = (getDay(deISO(dias[0].data)) + 6) % 7;
  const celulas = [...Array.from({ length: deslocamento }, () => null), ...dias];
  const semanas = Math.ceil(celulas.length / 7);
  const meses = Array.from({ length: semanas }, (_, c) => {
    const dia = celulas.slice(c * 7, c * 7 + 7).find((x) => x);
    const anterior = c > 0 ? celulas.slice((c - 1) * 7, c * 7).find((x) => x) : undefined;
    if (!dia) return "";
    return !anterior || dia.data.slice(5, 7) !== anterior.data.slice(5, 7) ? formatar(dia.data, "MMM") : "";
  });

  const descrever = (d: (typeof dias)[number]) => {
    const partes = [];
    if (fonte === "tudo" || fonte === "estudo") partes.push(`${d.minutos} min, ${d.cartoes} cartões`);
    if (fonte === "tudo" || fonte === "habitos") partes.push(`${Math.round(d.pctHabitos * 100)}% hábitos`);
    if (fonte === "tudo" || fonte === "tarefas") partes.push(`${d.tarefas} tarefas`);
    if (fonte === "tudo" || fonte === "commits") partes.push(`${d.commits} commits`);
    return T.conquistas.diaDica(formatar(d.data, "d 'de' MMM"), partes.join(", "));
  };

  return (
    <div className="mapa-calor">
      {!compacto && (
        <Pilulas
          rotulo={T.conquistas.mapa}
          valor={fonte}
          aoMudar={setFonte}
          opcoes={(Object.keys(T.conquistas.fontes) as FonteMapa[]).map((f) => ({ valor: f, rotulo: T.conquistas.fontes[f] }))}
        />
      )}
      <div className="mapa-calor-rolagem">
        <div className="mapa-calor-corpo">
        <div className="mapa-calor-meses" style={{ gridTemplateColumns: `repeat(${semanas}, minmax(0, 1fr))` }} aria-hidden="true">
          {meses.map((m, i) => <span key={i}>{m}</span>)}
        </div>
        <div className="mapa-calor-linha">
        <div className="mapa-calor-semana" aria-hidden="true">
          {T.calendario.diasSemana.map((d, i) => <span key={d}>{i % 2 === 0 ? d : ""}</span>)}
        </div>
        <div className="mapa-calor-grade" role="grid" aria-label={T.conquistas.mapa} style={{ gridTemplateColumns: `repeat(${semanas}, minmax(0, 1fr))` }}>
          {celulas.map((d, i) =>
            d ? (
              <button
                key={d.data}
                type="button"
                className="mapa-celula"
                data-nivel={d.nivel}
                aria-label={descrever(d)}
                onPointerEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setDica({ x: r.left + r.width / 2, y: r.top, texto: descrever(d) });
                }}
                onPointerLeave={() => setDica(null)}
                onClick={() => irPara("journal", { data: d.data })}
              />
            ) : (
              <span key={`v-${i}`} className="mapa-celula mapa-celula-vazia" />
            ),
          )}
        </div>
        </div>
        </div>
      </div>
      <div className="mapa-legenda">
        <span>{T.conquistas.menos}</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className="mapa-celula" data-nivel={n} />
        ))}
        <span>{T.conquistas.mais}</span>
      </div>
      {dica && (
        <span className="dica-flutuante" style={{ left: dica.x, top: dica.y }}>
          {dica.texto}
        </span>
      )}
    </div>
  );
}
