import { useCallback, useEffect, useState } from "react";
import { addDays } from "date-fns";
import { Gauge, Bot, Cpu, CalendarDays, TriangleAlert, RefreshCw, Clock, FolderOpen, Activity } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Progresso, Vazio, AvisoFaixa } from "../../componentes/basicos";
import { BarrasHorizontais, BarrasVerticais } from "../../componentes/Graficos";
import { Marca } from "../../marcas/Marca";
import { useComunicacao } from "../../estado/comunicacao";
import { useConfig } from "../../estado/configuracoes";
import { AGENTES } from "../../estado/agentes";
import { T } from "../../textos/textos";
import { hojeISO, paraISO, horarioRelativo } from "../../utilitarios/datas";
import { somar } from "../../utilitarios/basicos";
import { lerConsumo, type Consumo } from "../../ponte/ponteLocal";
import { faltaPara, nivelDoUso } from "../../utilitarios/consumo";

const numero = new Intl.NumberFormat("pt-BR");
const dolar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

const nivel = nivelDoUso;

function PlanosEsessao() {
  const cfg = useConfig((s) => s.consumo);
  const definir = useConfig((s) => s.definir);
  const [dados, setDados] = useState<Consumo | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const atualizar = useCallback(async (forcar = false) => {
    setCarregando(true);
    try {
      setDados(await lerConsumo(forcar));
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!cfg.lerPlanos) return;
    void atualizar();
    const t = window.setInterval(() => !document.hidden && void atualizar(), 5 * 60000);
    return () => window.clearInterval(t);
  }, [cfg.lerPlanos, atualizar]);

  if (!cfg.lerPlanos)
    return (
      <Cartao>
        <div className="coluna" style={{ gap: 12 }}>
          <AvisoFaixa tipo="alerta">
            <ul style={{ paddingLeft: 16 }}>{T.consumo.parte2Aviso.map((a) => <li key={a}>{a}</li>)}</ul>
          </AvisoFaixa>
          <Botao variante="primario" onClick={() => definir({ consumo: { ...cfg, lerPlanos: true } })}>{T.consumo.ligarParte2}</Botao>
        </div>
      </Cartao>
    );

  if (erro && !dados) return <AvisoFaixa tipo="alerta">{T.consumo.ponteFora}</AvisoFaixa>;
  if (!dados) return <Cartao><p className="texto-3">{T.geral.carregando}</p></Cartao>;

  const sessao = dados.sessao;
  return (
    <div className="coluna" style={{ gap: 16 }}>
      <div className="linha-entre">
        <span className="texto-3" style={{ fontSize: 12 }}>{T.conexoes.atualizado(horarioRelativo(dados.atualizadoEm))}</span>
        <Botao pequeno icone={<RefreshCw size={13} className={carregando ? "girando" : ""} />} disabled={carregando} onClick={() => void atualizar(true)}>{T.janelaConexao.atualizar}</Botao>
      </div>
      {sessao && (
        <Cartao titulo={T.consumo.sessaoClaude} icone={<Activity size={16} />} acoes={<span className="etiqueta etiqueta-sucesso">{T.consumo.ativaHa(horarioRelativo(sessao.ultimaAtividade))}</span>}>
          <div className="linha texto-2" style={{ fontSize: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <FolderOpen size={13} />
            <span className="cortar">{sessao.projeto}</span>
            {sessao.modelo && <code>{sessao.modelo}</code>}
            {sessao.inicio && <span className="linha"><Clock size={12} />{T.consumo.iniciada(horarioRelativo(sessao.inicio))}</span>}
          </div>
          <div className="grade-metricas">
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.mensagens}</span><span className="numero-grande">{numero.format(sessao.mensagens)}</span></div>
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.entrada}</span><span className="numero-grande">{numero.format(sessao.entrada)}</span></div>
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.saida}</span><span className="numero-grande">{numero.format(sessao.saida)}</span></div>
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.cacheLido}</span><span className="numero-grande">{numero.format(sessao.cacheLido)}</span></div>
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.cacheCriado}</span><span className="numero-grande">{numero.format(sessao.cacheCriado)}</span></div>
          </div>
        </Cartao>
      )}
      <div className="grade">
        {dados.ferramentas.map((f) => (
          <Cartao key={f.id} className="col-6" titulo={f.nome} icone={f.id === "claude" ? <Marca marca="anthropic" tamanho={16} /> : <Cpu size={16} />} acoes={f.plano ? <span className="etiqueta">{f.plano}</span> : undefined}>
            {f.situacao === "ok" ? (
              <div className="coluna" style={{ gap: 14 }}>
                {f.janelas.length === 0 && <p className="texto-3">{T.consumo.semJanelas}</p>}
                {f.janelas.map((j) => (
                  <div key={j.id} className="coluna" style={{ gap: 6 }}>
                    <div className="linha-entre">
                      <span>{T.consumo.janelas[j.rotulo as keyof typeof T.consumo.janelas] ?? j.rotulo}</span>
                      <span className="numero" style={{ fontWeight: 600 }}>{Math.round(j.usado)}%</span>
                    </div>
                    <Progresso valor={j.usado / 100} nivel={nivel(j.usado)} rotulo={j.rotulo} />
                    <span className="texto-3" style={{ fontSize: 11 }}>{faltaPara(j.reiniciaEm)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="texto-3">{T.consumo.situacoes[f.situacao]}{f.nota ? ` (${f.nota})` : ""}</p>
            )}
          </Cartao>
        ))}
      </div>
    </div>
  );
}

export default function ConsumoIa() {
  const uso = useComunicacao((s) => s.usoIa);
  const definirUso = useComunicacao((s) => s.definirUsoIa);
  const consumo = useConfig((s) => s.consumo);
  const nomes = useConfig((s) => s.agentes.nomes);
  const mes = hojeISO().slice(0, 7);
  const doMes = uso.filter((u) => u.data.startsWith(mes));
  const temPreco = consumo.precoEntrada + consumo.precoSaida > 0;
  const custo = somar(doMes, (u) => (u.entrada * consumo.precoEntrada + u.saida * consumo.precoSaida) / 1e6);
  const p = consumo.limiteMensal > 0 ? custo / consumo.limiteMensal : 0;
  const porModelo = new Map<string, typeof uso>();
  for (const u of doMes) porModelo.set(`${u.provedor} . ${u.modelo}`, [...(porModelo.get(`${u.provedor} . ${u.modelo}`) ?? []), u]);
  const dias = Array.from({ length: 30 }, (_, i) => paraISO(addDays(new Date(), i - 29)));
  const totalTokens = (l: typeof uso) => somar(l, (u) => u.entrada + u.saida);

  return (
    <>
      <CabecalhoAba titulo={T.consumo.titulo} subtitulo={T.consumo.subtitulo} agente="operador" />
      <h2 className="titulo-secao">{T.consumo.parte2}</h2>
      <PlanosEsessao />
      <div className="linha-entre">
        <h2 className="titulo-secao">{T.consumo.parte1}</h2>
        {uso.length > 0 && <Botao pequeno variante="fantasma" onClick={() => definirUso([])}>{T.consumo.limparDemo}</Botao>}
      </div>
      {uso.length === 0 ? (
        <Cartao><Vazio icone={<Gauge size={28} />} titulo={T.consumo.semUso} texto={T.consumo.semUsoDica} /></Cartao>
      ) : (
        <div className="grade">
          <Cartao className="col-3"><span className="rotulo-secao">{T.consumo.entrada}</span><div className="numero-grande">{numero.format(somar(doMes, (u) => u.entrada))}</div></Cartao>
          <Cartao className="col-3"><span className="rotulo-secao">{T.consumo.saida}</span><div className="numero-grande">{numero.format(somar(doMes, (u) => u.saida))}</div></Cartao>
          <Cartao className="col-3"><span className="rotulo-secao">{T.consumo.mensagens}</span><div className="numero-grande">{doMes.length}</div></Cartao>
          <Cartao className="col-3"><span className="rotulo-secao">{T.consumo.custo}</span><div className="numero-grande">{temPreco ? dolar.format(custo) : "--"}</div></Cartao>
          {!temPreco && <div className="col-12"><AvisoFaixa>{T.consumo.semPreco}</AvisoFaixa></div>}
          {temPreco && (
            <Cartao className="col-12" titulo={T.consumo.limite} icone={<Gauge size={16} />}>
              <Progresso valor={p} nivel={p >= 1 ? "erro" : p >= 0.8 ? "alerta" : undefined} rotulo={T.consumo.limite} />
              <div className="linha-entre" style={{ marginTop: 6 }}>
                <span className="campo-dica">{T.consumo.limiteDica}</span>
                <span className="numero texto-2">{dolar.format(custo)} / {dolar.format(consumo.limiteMensal)}</span>
              </div>
              {p >= 0.8 && <AvisoFaixa tipo={p >= 1 ? "erro" : "alerta"}><span className="linha"><TriangleAlert size={13} />{T.consumo.pertoLimite(Math.round(p * 100))}</span></AvisoFaixa>}
            </Cartao>
          )}
          <Cartao className="col-6" titulo={T.consumo.porModelo} icone={<Cpu size={16} />}>
            <BarrasHorizontais formatar={(v) => numero.format(v)} barras={[...porModelo].map(([k, l]) => ({ rotulo: k, valor: totalTokens(l) }))} />
          </Cartao>
          <Cartao className="col-6" titulo={T.consumo.porAgente} icone={<Bot size={16} />}>
            <BarrasHorizontais formatar={(v) => numero.format(v)} barras={AGENTES.map((a) => ({ rotulo: nomes[a], valor: totalTokens(doMes.filter((u) => u.agenteId === a)) }))} />
          </Cartao>
          <Cartao className="col-12" titulo={T.consumo.porDia} icone={<CalendarDays size={16} />}>
            <BarrasVerticais formatar={(v) => numero.format(v)} barras={dias.map((d) => ({ rotulo: d.slice(8), valor: totalTokens(uso.filter((u) => u.data === d)) }))} />
          </Cartao>
        </div>
      )}
    </>
  );
}
