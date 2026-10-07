import { useState } from "react";
import { Cloud } from "lucide-react";
import { Botao, Campo } from "../componentes/basicos";
import { entrarNaConta, sairDaConta, sincronizarAgora, useSincronia } from "../sincronia/sincronizar";
import { T } from "../textos/textos";

export function Conta() {
  const fase = useSincronia((s) => s.fase);
  const erroRemoto = useSincronia((s) => s.erro);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const dentro = fase === "feita" || fase === "a-correr" || fase === "sem-rede";

  const entrar = async () => {
    setOcupado(true);
    setErro("");
    try {
      await entrarNaConta(email.trim(), senha);
      setSenha("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="movel-cartao">
      <header className="movel-cartao-topo"><Cloud size={16} />{T.movel.conta}</header>
      <div className="movel-conta">
        {dentro ? (
          <>
            <p className="texto-2">{fase === "a-correr" ? T.movel.aSincronizar : fase === "sem-rede" ? T.movel.semRede : T.movel.sincronizado}</p>
            <span className="linha">
              <Botao pequeno onClick={() => void sincronizarAgora()}>{T.movel.sincronizarAgora}</Botao>
              <Botao pequeno variante="fantasma" onClick={() => void sairDaConta()}>{T.social.sair}</Botao>
            </span>
          </>
        ) : (
          <form
            className="coluna"
            onSubmit={(e) => {
              e.preventDefault();
              void entrar();
            }}
          >
            <p className="texto-2">{T.movel.contaDica}</p>
            <Campo id="movel-email" rotulo={T.social.email} erro={erro || (fase === "erro" ? `${T.movel.falhou} ${erroRemoto}` : null)}>
              <input id="movel-email" className="campo" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Campo>
            <Campo id="movel-senha" rotulo={T.social.senha}>
              <input id="movel-senha" className="campo" type="password" autoComplete="current-password" maxLength={72} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Campo>
            <Botao type="submit" variante="primario" disabled={ocupado || !email.trim() || senha.length < 8}>{ocupado ? T.social.entrando : T.social.entrar}</Botao>
            {fase === "entrar" && <p className="texto-3">{T.movel.semSessao}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
