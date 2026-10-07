import { useEffect, useState } from "react";
import { Cloud } from "lucide-react";
import { Botao, Campo } from "../../componentes/basicos";
import { lerChave } from "../../ponte/armazenamento";
import { social } from "../../ponte/social";
import { entrarNaConta, sairDaConta, sincronizaPeloTelefone, sincronizarAgora, useSincronia } from "../../sincronia/sincronizar";
import { T } from "../../textos/textos";

function provedoresNoComputador(): { id: string; nome: string; modelo?: string }[] {
  try {
    const lido = JSON.parse(lerChave("niko:provedores-ia") ?? "") as { id?: string; nome?: string; modelo?: string }[];
    return Array.isArray(lido) ? lido.filter((p) => p && typeof p.nome === "string").map((p) => ({ id: String(p.id ?? p.nome), nome: p.nome!, modelo: p.modelo })) : [];
  } catch {
    return [];
  }
}

export function SecaoConta() {
  const fase = useSincronia((s) => s.fase);
  const erroRemoto = useSincronia((s) => s.erro);
  const em = useSincronia((s) => s.em);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [dentroNoPc, setDentroNoPc] = useState(false);
  const [nome, setNome] = useState("");

  useEffect(() => {
    if (sincronizaPeloTelefone()) return;
    let vivo = true;
    void social.estado().then((r) => {
      if (!vivo) return;
      setDentroNoPc(Boolean(r.usuario));
      setNome(r.usuario?.email ?? "");
    }).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [fase]);

  const peloTelefone = sincronizaPeloTelefone();
  const provedores = peloTelefone ? provedoresNoComputador() : [];
  const dentro = peloTelefone ? fase === "feita" || fase === "a-correr" || fase === "sem-rede" : dentroNoPc;
  const entrar = async () => {
    setOcupado(true);
    setErro("");
    try {
      if (peloTelefone) await entrarNaConta(email.trim(), senha);
      else {
        const r = await social.entrar(email.trim(), senha);
        setDentroNoPc(true);
        setNome(r.usuario?.email ?? email.trim());
        await sincronizarAgora();
      }
      setSenha("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const sair = async () => {
    if (peloTelefone) await sairDaConta();
    else {
      await social.sair();
      setDentroNoPc(false);
      setNome("");
    }
  };

  return (
    <div className="coluna" style={{ gap: 12 }}>
      <p className="texto-2"><Cloud size={14} style={{ verticalAlign: "text-bottom" }} /> {T.configuracoes.contaTexto}</p>
      {dentro ? (
        <>
          <p className="texto-2">{nome || T.configuracoes.contaDentro}</p>
          <p className="texto-3">{fase === "a-correr" ? T.movel.aSincronizar : fase === "erro" ? `${T.movel.falhou} ${erroRemoto}` : fase === "sem-rede" ? T.movel.semRede : em ? `${T.movel.sincronizado} · ${new Date(em).toLocaleString("pt-PT")}` : T.configuracoes.contaPronta}</p>
          {provedores.length > 0 && (
            <p className="texto-3">{T.configuracoes.provedoresNoPc}: {provedores.map((p) => p.modelo ? `${p.nome} (${p.modelo})` : p.nome).join(", ")}</p>
          )}
          <span className="linha">
            <Botao pequeno onClick={() => void sincronizarAgora()}>{T.movel.sincronizarAgora}</Botao>
            <Botao pequeno variante="fantasma" onClick={() => void sair()}>{T.social.sair}</Botao>
          </span>
        </>
      ) : (
        <form className="coluna" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void entrar(); }}>
          <Campo id="conta-email" rotulo={T.social.email} erro={erro}>
            <input id="conta-email" className="campo" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo id="conta-senha" rotulo={T.social.senha}>
            <input id="conta-senha" className="campo" type="password" autoComplete="current-password" maxLength={72} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          <Botao type="submit" variante="primario" disabled={ocupado || !email.trim() || senha.length < 8}>{ocupado ? T.social.entrando : T.social.entrar}</Botao>
        </form>
      )}
    </div>
  );
}
