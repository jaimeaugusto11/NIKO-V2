import { BookOpen, CalendarDays, GraduationCap, Target, Wallet, type LucideIcon } from "lucide-react";
import { Alternador, Modal } from "../../componentes/basicos";
import { useConfig } from "../../estado/configuracoes";
import { FUNCOES, type Funcao } from "../../utilitarios/funcoes";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";

const ICONE_FUNCAO: Record<Funcao, LucideIcon> = {
  journal: BookOpen,
  estudos: GraduationCap,
  financas: Wallet,
  metas: Target,
  calendario: CalendarDays,
};

export function PainelFuncoes({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const definir = useConfig((s) => s.definir);

  const alternar = (funcao: Funcao, ligar: boolean) => {
    definir({ funcoesDesligadas: ligar ? desligadas.filter((f) => f !== funcao) : [...desligadas, funcao] });
    void tocarSom(ligar ? "approve" : "close", "interface");
  };

  return (
    <Modal aberto={aberto} titulo={T.funcoes.titulo} aoFechar={aoFechar}>
      <p className="campo-dica" style={{ marginBottom: 12 }}>{T.funcoes.dica}</p>
      <div className="lista">
        {FUNCOES.map((f) => {
          const Icone = ICONE_FUNCAO[f];
          const ligada = !desligadas.includes(f);
          return (
            <div key={f} className="lista-item" data-desligada={!ligada || undefined}>
              <Icone size={16} />
              <span className="coluna lista-item-principal" style={{ gap: 2, minWidth: 0 }}>
                <span>{T.funcoes.nomes[f]}</span>
                <span className="campo-dica">{T.funcoes.descricoes[f]}</span>
              </span>
              <Alternador ligado={ligada} rotulo={T.funcoes.nomes[f]} aoMudar={(v) => alternar(f, v)} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
