import { useEffect, useState } from "react";
import { Plus, Trash2, Target, Columns3, ImagePlus, Pencil, Gauge } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Campo, Modal, Progresso, Vazio, ConfirmarModal } from "../../componentes/basicos";
import { useOrganizacao } from "../../estado/organizacao";
import { useRotina, habitoCumprido } from "../../estado/rotina";
import { usePomodoro } from "../../estado/pomodoro";
import { useFinancas } from "../../estado/financas";
import { useEstudos } from "../../estado/estudos";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { dataValida, formatar, paraISO } from "../../utilitarios/datas";
import { lerImagemComoDataUrl, somar } from "../../utilitarios/basicos";
import { tocarSom } from "../../ponte/sons";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import { addDays } from "date-fns";
import type { CartaoVisao, Meta, TipoMeta } from "../../tipos";

function useProgresso() {
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const sessoes = usePomodoro((s) => s.sessoes);
  const economias = useFinancas((s) => s.metasEconomia);
  return (m: Meta): { atual: number; alvo: number; rotulo: string } => {
    switch (m.tipo) {
      case "habito": {
        const h = habitos.find((x) => x.id === m.vinculoId);
        if (!h) return { atual: 0, alvo: 100, rotulo: "0%" };
        const dias = Array.from({ length: m.periodo === "ano" ? 365 : 90 }, (_, i) => paraISO(addDays(new Date(), -i)));
        const pct = Math.round((dias.filter((d) => habitoCumprido(h, registros[d]?.[h.id])).length / dias.length) * 100);
        return { atual: pct, alvo: m.alvo, rotulo: `${pct}%` };
      }
      case "estudo": {
        const horas = somar(sessoes.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && s.materiaId === m.vinculoId), (s) => s.minutos) / 60;
        return { atual: horas, alvo: m.alvo, rotulo: `${horas.toFixed(1).replace(".", ",")} / ${m.alvo} h` };
      }
      case "financeira": {
        const e = economias.find((x) => x.id === m.vinculoId) ?? economias[0];
        if (!e) return { atual: 0, alvo: 100, rotulo: "0%" };
        const pct = e.alvo ? Math.round((e.guardado / e.alvo) * 100) : 0;
        return { atual: pct, alvo: 100, rotulo: `${pct}%` };
      }
      case "tarefas": {
        const ligadas = tarefas.filter((t) => t.metaId === m.id);
        const feitas = ligadas.filter((t) => t.status === "concluida").length;
        return { atual: feitas, alvo: Math.max(1, ligadas.length), rotulo: `${feitas} / ${ligadas.length}` };
      }
      default:
        return { atual: m.atual, alvo: m.alvo, rotulo: `${m.atual} / ${m.alvo}` };
    }
  };
}

function FormMeta({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const org = useOrganizacao();
  const habitos = useRotina((s) => s.habitos).filter((h) => !h.arquivado);
  const materias = useEstudos((s) => s.materias);
  const economias = useFinancas((s) => s.metasEconomia);
  const [nome, setNome] = useState("");
  const [pilarId, setPilarId] = useState("");
  const [tipo, setTipo] = useState<TipoMeta>("manual");
  const [alvo, setAlvo] = useState("10");
  const [vinculo, setVinculo] = useState("");
  const [periodo, setPeriodo] = useState<"trimestre" | "ano">("trimestre");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setNome("");
    setPilarId(org.pilares[0]?.id ?? "");
    setTipo("manual");
    setAlvo("10");
    setVinculo("");
    setErros({});
  }, [aberto]);

  const opcoesVinculo = tipo === "habito" ? habitos.map((h) => ({ id: h.id, nome: h.nome })) : tipo === "estudo" ? materias.map((m) => ({ id: m.id, nome: m.nome })) : tipo === "financeira" ? economias.map((e) => ({ id: e.id, nome: e.nome })) : [];

  return (
    <Modal aberto={aberto} titulo={T.metas.novaMeta} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
          if (!pilarId) novos.pilar = T.validacao.obrigatorio;
          const a = Number(alvo);
          if (["manual", "estudo", "habito"].includes(tipo) && (!Number.isFinite(a) || a <= 0 || a > 100000)) novos.alvo = T.validacao.entre(1, 100000);
          if (opcoesVinculo.length > 0 && !vinculo) novos.vinculo = T.validacao.obrigatorio;
          if (["habito", "estudo", "financeira"].includes(tipo) && opcoesVinculo.length === 0) novos.vinculo = T.metas.semVinculo;
          setErros(novos);
          if (Object.keys(novos).length) return;
          org.criarMeta({ nome, pilarId, tipo, alvo: tipo === "habito" ? Math.min(100, a) : a || 100, atual: 0, vinculoId: vinculo || undefined, periodo });
          aoFechar();
        }}
      >
        <Campo id="mt-nome" rotulo={T.metas.nome} obrigatorio erro={erros.nome}>
          <input id="mt-nome" className="campo" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="mt-pilar" rotulo={T.metas.pilar} obrigatorio erro={erros.pilar}>
            <select id="mt-pilar" className="seletor" value={pilarId} onChange={(e) => setPilarId(e.target.value)}>
              {org.pilares.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo id="mt-periodo" rotulo={T.metas.periodo}>
            <select id="mt-periodo" className="seletor" value={periodo} onChange={(e) => setPeriodo(e.target.value as "trimestre" | "ano")}>
              <option value="trimestre">{T.metas.trimestre}</option>
              <option value="ano">{T.metas.ano}</option>
            </select>
          </Campo>
        </div>
        <div className="formulario-linha">
          <Campo id="mt-tipo" rotulo={T.metas.tipo}>
            <select id="mt-tipo" className="seletor" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoMeta); setVinculo(""); }}>
              {(Object.keys(T.metas.tipos) as TipoMeta[]).map((t) => <option key={t} value={t}>{T.metas.tipos[t]}</option>)}
            </select>
          </Campo>
          {["manual", "estudo", "habito"].includes(tipo) && (
            <Campo id="mt-alvo" rotulo={tipo === "estudo" ? T.metas.alvoHoras : tipo === "habito" ? T.metas.alvoPct : T.metas.alvo} obrigatorio erro={erros.alvo}>
              <input id="mt-alvo" className="campo" inputMode="numeric" value={alvo} onChange={(e) => setAlvo(e.target.value.replace(/[^\d]/g, ""))} />
            </Campo>
          )}
        </div>
        {opcoesVinculo.length > 0 || erros.vinculo ? (
          <Campo id="mt-vinc" rotulo={T.metas.vinculo} obrigatorio erro={erros.vinculo}>
            <select id="mt-vinc" className="seletor" value={vinculo} onChange={(e) => setVinculo(e.target.value)}>
              <option value="">{T.financas.escolha}</option>
              {opcoesVinculo.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </Campo>
        ) : null}
        {tipo === "tarefas" && <p className="campo-dica">{T.metas.metaDeTarefas}</p>}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function FormVisao({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const criar = useOrganizacao((s) => s.criarVisao);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [estado, setEstado] = useState<CartaoVisao["estado"]>("planejada");
  const [prazo, setPrazo] = useState("");
  const [imagem, setImagem] = useState<string | undefined>();
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (aberto) {
      setTitulo("");
      setDescricao("");
      setPrazo("");
      setImagem(undefined);
      setErros({});
    }
  }, [aberto]);

  return (
    <Modal aberto={aberto} titulo={T.metas.novoCartaoVisao} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!titulo.trim()) novos.titulo = T.validacao.obrigatorio;
          if (prazo && !dataValida(prazo)) novos.prazo = T.validacao.dataInvalida;
          setErros((x) => ({ ...novos, imagem: x.imagem ?? "" }));
          if (Object.keys(novos).length) return;
          criar({ titulo: titulo.trim().slice(0, 80), descricao: descricao.trim().slice(0, 300), estado, prazo: prazo || undefined, imagem });
          aoFechar();
        }}
      >
        <Campo id="v-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={erros.titulo}>
          <input id="v-titulo" className="campo" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <Campo id="v-desc" rotulo={T.financas.descricao}>
          <textarea id="v-desc" className="area-texto" value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="v-estado" rotulo={T.metas.estado}>
            <select id="v-estado" className="seletor" value={estado} onChange={(e) => setEstado(e.target.value as CartaoVisao["estado"])}>
              {(Object.keys(T.metas.estados) as CartaoVisao["estado"][]).map((s) => <option key={s} value={s}>{T.metas.estados[s]}</option>)}
            </select>
          </Campo>
          <Campo id="v-prazo" rotulo={T.financas.prazo} erro={erros.prazo}>
            <input id="v-prazo" type="date" className="campo" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
        </div>
        <Campo id="v-img" rotulo={T.metas.imagem} erro={erros.imagem || undefined} dica={T.validacao.imagemInvalida}>
          <input
            id="v-img"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="campo"
            style={{ paddingTop: 6 }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setImagem(await lerImagemComoDataUrl(f));
                setErros((x) => ({ ...x, imagem: "" }));
              } catch {
                setImagem(undefined);
                setErros((x) => ({ ...x, imagem: T.validacao.imagemInvalida }));
              }
            }}
          />
        </Campo>
        {imagem && <img src={imagem} alt="" className="visao-previa" />}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

export default function Metas() {
  const org = useOrganizacao();
  const tarefas = useRotina((s) => s.tarefas);
  const progresso = useProgresso();
  const avisar = useInterface((s) => s.avisar);
  const [novaMeta, setNovaMeta] = useState(false);
  const [novaVisao, setNovaVisao] = useState(false);
  const [novoPilar, setNovoPilar] = useState("");
  const [erroPilar, setErroPilar] = useState("");
  const [atualizando, setAtualizando] = useState<Meta | null>(null);
  const [valor, setValor] = useState("");
  const [excluir, setExcluir] = useState<Meta | null>(null);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "metas") setNovaMeta(true);
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const medias = org.metas.map((m) => {
    const p = progresso(m);
    return Math.min(1, p.atual / Math.max(1, p.alvo));
  });
  const media = medias.length ? Math.round((medias.reduce((a, b) => a + b, 0) / medias.length) * 100) : 0;

  return (
    <>
      <CabecalhoAba
        titulo={T.metas.titulo}
        subtitulo={T.metas.subtitulo}
        agente="organizador"
        acoes={
          <>
            <Botao pequeno variante="primario" icone={<Plus size={13} />} onClick={() => setNovaMeta(true)}>{T.metas.novaMeta}</Botao>
            <Botao pequeno icone={<ImagePlus size={13} />} onClick={() => setNovaVisao(true)}>{T.metas.novoCartaoVisao}</Botao>
          </>
        }
      />
      <div className="grade">
        <Cartao className="col-3"><span className="rotulo-secao">{T.metas.metasAtivas}</span><div className="numero-grande">{org.metas.length}</div></Cartao>
        <Cartao className="col-3"><span className="rotulo-secao">{T.metas.tarefasConcluidas}</span><div className="numero-grande">{tarefas.filter((t) => t.status === "concluida").length}</div></Cartao>
        <Cartao className="col-3"><span className="rotulo-secao">{T.metas.pilares}</span><div className="numero-grande">{org.pilares.length}</div></Cartao>
        <Cartao className="col-3"><span className="rotulo-secao">{T.metas.progressoMedio}</span><div className="numero-grande">{media}%</div></Cartao>

        <Cartao className="col-8" titulo={T.metas.ativas} icone={<Target size={16} />}>
          {org.metas.length === 0 ? (
            <Vazio icone={<Target size={28} />} titulo={T.metas.semMetas} acao={<Botao variante="primario" onClick={() => setNovaMeta(true)}>{T.metas.novaMeta}</Botao>} />
          ) : (
            <div className="lista">
              {org.metas.map((m) => {
                const p = progresso(m);
                const pct = Math.min(1, p.atual / Math.max(1, p.alvo));
                return (
                  <div key={m.id} className="lista-item" style={{ alignItems: "flex-start", padding: "12px 0" }}>
                    <div className="lista-item-principal" style={{ gap: 6 }}>
                      <div className="linha-entre">
                        <span>{m.nome}</span>
                        <span className="texto-2 numero" style={{ fontSize: 12 }}>{p.rotulo}</span>
                      </div>
                      <Progresso valor={pct} nivel={pct >= 1 ? "sucesso" : undefined} rotulo={m.nome} />
                      <span className="lista-item-sub">{org.pilares.find((x) => x.id === m.pilarId)?.nome} . {T.metas.tipos[m.tipo]} . {m.periodo === "ano" ? T.metas.ano : T.metas.trimestre}</span>
                    </div>
                    <div className="linha" style={{ gap: 0 }}>
                      {m.tipo === "manual" && <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.metas.atualizarValor} title={T.metas.atualizarValor} onClick={() => { setAtualizando(m); setValor(String(m.atual)); }} />}
                      <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => setExcluir(m)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Cartao>

        <Cartao className="col-4" titulo={T.metas.pilares} icone={<Columns3 size={16} />}>
          <div className="coluna" style={{ gap: 12 }}>
            {org.pilares.map((p) => (
              <div key={p.id} className="coluna" style={{ gap: 4 }}>
                <div className="linha-entre">
                  <span>{p.nome}</span>
                  <span className="linha" style={{ gap: 4 }}>
                    <span className="texto-3" style={{ fontSize: 11 }}>{org.metas.filter((m) => m.pilarId === p.id).length}</span>
                    <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={() => org.excluirPilar(p.id)} />
                  </span>
                </div>
                <div className="linha">
                  <input type="range" min={0} max={10} step={1} value={p.nota} aria-label={`${T.metas.nota} ${p.nome}`} className="faixa" onChange={(e) => org.atualizarPilar(p.id, { nota: Number(e.target.value) })} />
                  <span className="numero" style={{ minWidth: 20, textAlign: "right" }}>{p.nota}</span>
                </div>
              </div>
            ))}
            <form
              className="linha"
              style={{ alignItems: "flex-start" }}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!novoPilar.trim()) return setErroPilar(T.validacao.obrigatorio);
                org.criarPilar(novoPilar);
                setNovoPilar("");
                setErroPilar("");
              }}
            >
              <div className="campo-grupo" style={{ flex: 1 }}>
                <input className="campo" value={novoPilar} maxLength={40} placeholder={T.metas.novoPilar} aria-label={T.metas.novoPilar} onChange={(e) => { setNovoPilar(e.target.value); setErroPilar(""); }} />
                {erroPilar && <span className="campo-erro">{erroPilar}</span>}
              </div>
              <Botao type="submit" soIcone icone={<Plus size={14} />} aria-label={T.metas.novoPilar} />
            </form>
          </div>
        </Cartao>

        <Cartao className="col-12" titulo={T.metas.visao} icone={<ImagePlus size={16} />} acoes={<Botao pequeno icone={<Plus size={13} />} onClick={() => setNovaVisao(true)}>{T.metas.novoCartaoVisao}</Botao>}>
          {org.visao.length === 0 ? <Vazio titulo={T.metas.semVisao} /> : (
            <div className="grade-visao">
              {org.visao.map((v) => (
                <div key={v.id} className="cartao-visao">
                  {v.imagem ? <img src={v.imagem} alt="" /> : <div className="cartao-visao-sem-imagem"><Gauge size={24} /></div>}
                  <div className="coluna" style={{ gap: 4, padding: 12 }}>
                    <div className="linha-entre">
                      <b className="cortar">{v.titulo}</b>
                      <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={() => { org.excluirVisao(v.id); avisar(T.geral.excluido); }} />
                    </div>
                    {v.descricao && <span className="texto-2" style={{ fontSize: 12 }}>{v.descricao}</span>}
                    <div className="linha" style={{ flexWrap: "wrap" }}>
                      <select className="seletor" style={{ height: 26, width: "auto", fontSize: 11 }} value={v.estado} aria-label={T.metas.estado} onChange={(e) => org.atualizarVisao(v.id, { estado: e.target.value as CartaoVisao["estado"] })}>
                        {(Object.keys(T.metas.estados) as CartaoVisao["estado"][]).map((s) => <option key={s} value={s}>{T.metas.estados[s]}</option>)}
                      </select>
                      {v.prazo && <span className="etiqueta">{formatar(v.prazo, "MMM yyyy")}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Cartao>
      </div>
      <FormMeta aberto={novaMeta} aoFechar={() => setNovaMeta(false)} />
      <FormVisao aberto={novaVisao} aoFechar={() => setNovaVisao(false)} />
      <Modal aberto={!!atualizando} titulo={T.metas.atualizarValor} aoFechar={() => setAtualizando(null)}>
        {atualizando && (
          <form
            className="formulario"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(valor.replace(",", "."));
              if (!Number.isFinite(n) || n < 0) return;
              org.registrarProgresso(atualizando.id, n);
              if (n >= atualizando.alvo) void tocarSom("proud", "personagens");
              setAtualizando(null);
            }}
          >
            <Campo id="mt-valor" rotulo={T.metas.atual} dica={`${T.metas.alvo}: ${atualizando.alvo}`}>
              <input id="mt-valor" className="campo" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))} />
            </Campo>
            <div className="formulario-acoes">
              <Botao onClick={() => setAtualizando(null)}>{T.geral.cancelar}</Botao>
              <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmarModal aberto={!!excluir} titulo={T.geral.confirmarExclusao} texto={excluir?.nome ?? ""} aoFechar={() => setExcluir(null)} aoConfirmar={() => excluir && org.excluirMeta(excluir.id)} />
    </>
  );
}
