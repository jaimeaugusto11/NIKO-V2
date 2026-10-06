const formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarDinheiro(centavos: number): string {
  return formatador.format(centavos / 100);
}

export function lerValorEmCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/^r\$\s*/i, "").replace(/\s/g, "");
  if (!limpo) return null;
  let normalizado = limpo;
  if (/,\d{1,2}$/.test(limpo)) normalizado = limpo.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normalizado = limpo.replace(/\./g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const valor = Math.round(Number(normalizado) * 100);
  if (!Number.isFinite(valor)) return null;
  return valor;
}

export function centavosParaCampo(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
