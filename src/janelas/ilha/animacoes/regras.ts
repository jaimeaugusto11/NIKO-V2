export interface EtapaVisual {
  id: string;
  texto: string;
}

export interface EstadoEtapas {
  contexto: string;
  anterior: EtapaVisual | null;
  atual: EtapaVisual | null;
  fila: EtapaVisual[];
  ultimaId: string | null;
}

export function criarEstadoEtapas(contexto: string, etapas: readonly EtapaVisual[]): EstadoEtapas {
  return { contexto, anterior: etapas.at(-2) ?? null, atual: etapas.at(-1) ?? null, fila: [], ultimaId: etapas.at(-1)?.id ?? null };
}

export function receberEtapas(estado: EstadoEtapas, contexto: string, etapas: readonly EtapaVisual[]): EstadoEtapas {
  if (estado.contexto !== contexto || !estado.ultimaId || etapas.length === 0) return criarEstadoEtapas(contexto, etapas);
  const indice = etapas.findLastIndex((etapa) => etapa.id === estado.ultimaId);
  if (indice < 0) return criarEstadoEtapas(contexto, etapas);
  const novas = etapas.slice(indice + 1);
  if (novas.length === 0) return estado;
  return { ...estado, ultimaId: novas.at(-1)!.id, fila: [...estado.fila, ...novas].slice(-4) };
}

export function avancarEtapa(estado: EstadoEtapas): EstadoEtapas {
  if (estado.fila.length === 0) return estado;
  return { ...estado, anterior: estado.atual, atual: estado.fila[0], fila: estado.fila.slice(1) };
}

interface RetanguloVisual {
  left: number;
  top: number;
  width: number;
  height: number;
}

function retanguloValido(retangulo: RetanguloVisual) {
  return [retangulo.left, retangulo.top, retangulo.width, retangulo.height].every(Number.isFinite) && retangulo.width > 0 && retangulo.height > 0;
}

export function calcularDestinoPersonagem(ilha: RetanguloVisual, espaco: RetanguloVisual, escala: number) {
  if (!retanguloValido(ilha) || !retanguloValido(espaco) || !Number.isFinite(escala) || escala <= 0) return null;
  return { x: (espaco.left - ilha.left + espaco.width / 2) / escala - 35, y: (espaco.top - ilha.top + espaco.height / 2) / escala - 35, escala: espaco.width / escala / 70 };
}

export function calcularTrajetoArquivo(zona: RetanguloVisual, personagem: RetanguloVisual, ponto: { x: number; y: number }, escala: number) {
  if (!retanguloValido(zona) || !retanguloValido(personagem) || ![ponto.x, ponto.y, escala].every(Number.isFinite) || escala <= 0) return null;
  if (ponto.x < zona.left || ponto.x > zona.left + zona.width || ponto.y < zona.top || ponto.y > zona.top + zona.height) return null;
  return {
    origem: { x: (ponto.x - zona.left) / escala, y: (ponto.y - zona.top) / escala },
    destino: { x: (personagem.left - zona.left + personagem.width / 2) / escala, y: (personagem.top - zona.top + personagem.height * 0.55) / escala },
  };
}
