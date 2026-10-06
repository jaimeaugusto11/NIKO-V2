import { Trophy, Lock } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, AvisoFaixa } from "../../componentes/basicos";
import { MapaDeCalor } from "../../componentes/MapaDeCalor";
import { Personagem } from "../../personagens/Personagem";
import { useConquistas, CONQUISTAS } from "../../estado/conquistas";
import { useConfig } from "../../estado/configuracoes";
import { T } from "../../textos/textos";
import { formatar, diaDoMomento } from "../../utilitarios/datas";
import { conquistaLigada } from "../../utilitarios/funcoes";

export default function Conquistas() {
  const alcancadas = useConquistas((s) => s.alcancadas);
  const ativas = useConfig((s) => s.conquistasAtivas);
  const nomes = useConfig((s) => s.agentes.nomes);
  const desligadas = useConfig((s) => s.funcoesDesligadas);

  return (
    <>
      <CabecalhoAba titulo={T.conquistas.titulo} subtitulo={T.conquistas.subtitulo} agente="organizador" />
      {!ativas && <AvisoFaixa tipo="alerta">{T.conquistas.desligadas}</AvisoFaixa>}
      <Cartao titulo={T.conquistas.mapa}>
        <MapaDeCalor />
      </Cartao>
      <div className="grade-conquistas">
        {CONQUISTAS.filter((c) => conquistaLigada(c.codigo, desligadas)).map((c) => {
          const a = alcancadas.find((x) => x.codigo === c.codigo);
          const item = T.conquistas.itens[c.codigo];
          const proximo = c.niveis.find((n) => !a || n > a.nivel);
          return (
            <div key={c.codigo} className="cartao conquista" data-alcancada={a ? "sim" : "nao"}>
              <div className="linha">
                <span className="conquista-icone">{a ? <Trophy size={18} /> : <Lock size={16} />}</span>
                <div className="coluna" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                  <b className="cortar">{item.nome}</b>
                  <span className="texto-3" style={{ fontSize: 11 }}>{nomes[c.agente]}</span>
                </div>
                <Personagem agente={c.agente} tamanho={32} estado={a ? "sucesso" : "ocioso"} interativo={!!a} halo={false} />
              </div>
              <p className="texto-2" style={{ fontSize: 12 }}>{item.regra}</p>
              <div className="linha" style={{ flexWrap: "wrap" }}>
                {c.niveis.map((n, i) => (
                  <span key={n} className={`etiqueta ${a && a.nivel >= n ? "etiqueta-sucesso" : ""}`}>{c.niveis.length > 1 ? T.conquistas.nivel(i + 1) : T.conquistas.unico}</span>
                ))}
                {a && <span className="texto-3 empurrar" style={{ fontSize: 11 }}>{formatar(diaDoMomento(a.data), "d/MM/yyyy")}</span>}
              </div>
              {proximo && a && <span className="campo-dica">{T.conquistas.proximoNivel(proximo)}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
