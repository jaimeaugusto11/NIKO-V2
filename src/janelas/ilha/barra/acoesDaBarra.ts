import type { AbaIlha } from "../../../estado/configuracoes";
import { useIlha } from "../../../estado/ilha";

export function alternarAbaDaBarra(aba: AbaIlha) {
  const ilha = useIlha.getState();
  if (ilha.estado === "expandida" && ilha.aba === aba) ilha.recolher();
  else ilha.abrir(aba);
}

export function criarAlternadorDoIniciar(ler: () => Promise<{ aberto: boolean }>, executar: (abertoAntes?: boolean) => Promise<unknown>) {
  let leitura: Promise<boolean | undefined> | null = null;
  let ocupado = false;
  let preparando = false;
  return {
    preparar() {
      if (ocupado || preparando) return;
      preparando = true;
      leitura = ler().then((r) => r.aberto).catch(() => undefined).finally(() => { preparando = false; });
    },
    limpar() {
      leitura = null;
    },
    async alternar() {
      if (ocupado) return;
      ocupado = true;
      const anterior = leitura;
      leitura = null;
      try {
        const abertoAntes = await (anterior ?? ler().then((r) => r.aberto).catch(() => undefined));
        const resultado = await executar(abertoAntes);
        if (resultado && typeof resultado === "object" && "aberto" in resultado && typeof resultado.aberto === "boolean") leitura = Promise.resolve(resultado.aberto);
      } finally {
        ocupado = false;
      }
    },
  };
}
