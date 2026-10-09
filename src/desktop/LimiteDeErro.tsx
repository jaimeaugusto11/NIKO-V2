import { Component, type ReactNode } from "react";
import { informarAreaInterativa } from "./desktop";
import { T } from "../textos/textos";

type Tipo = "sistema" | "sobreposta" | "servicos";

/** Um erro de interface não pode deixar a janela morta: a sobreposta liberta os cliques e recarrega, os serviços voltam a montar. */
export class LimiteDeErro extends Component<{ tipo: Tipo; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  private temporizador = 0;

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  componentDidCatch() {
    window.clearTimeout(this.temporizador);
    if (this.props.tipo === "sobreposta") {
      void informarAreaInterativa([]);
      this.temporizador = window.setTimeout(() => window.location.reload(), 5000);
    } else if (this.props.tipo === "servicos") {
      this.temporizador = window.setTimeout(() => this.setState({ falhou: false }), 10000);
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.temporizador);
  }

  render() {
    if (!this.state.falhou) return this.props.children;
    if (this.props.tipo !== "sistema") return null;
    return (
      <div className="falha-ponte">
        <h1>{T.app.erroJanela}</h1>
        <p>
          <button type="button" className="botao botao-primario" onClick={() => window.location.reload()}>{T.app.recarregar}</button>
        </p>
      </div>
    );
  }
}
