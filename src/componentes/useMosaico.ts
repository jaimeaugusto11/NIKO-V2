import { useLayoutEffect, type RefObject } from "react";

const LINHA = 2;
const ESPACO = 14;

function preencher(cartao: HTMLElement) {
  const secoes = Array.from(cartao.querySelectorAll<HTMLElement>(".secao-extra"));
  const extras = Array.from(cartao.querySelectorAll<HTMLElement>(".item-extra"));
  for (const el of [...secoes, ...extras]) el.style.display = "";
  for (let i = extras.length - 1; i >= 0 && cartao.scrollHeight > cartao.clientHeight + 1; i--) extras[i].style.display = "none";
  for (const s of secoes) {
    const itens = Array.from(s.querySelectorAll<HTMLElement>(".item-extra"));
    if (itens.length === 0 || itens.every((x) => x.style.display === "none")) s.style.display = "none";
  }
}

function organizar(grade: HTMLElement) {
  const itens = Array.from(grade.children) as HTMLElement[];
  grade.dataset.medindo = "sim";
  for (const el of itens) {
    el.style.height = "";
    for (const x of el.querySelectorAll<HTMLElement>(".item-extra, .secao-extra")) x.style.display = "";
  }
  const alturas = itens.map((el) => el.getBoundingClientRect().height);
  itens.forEach((el, i) => {
    el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((alturas[i] + ESPACO) / LINHA))}`;
  });

  const largura = grade.clientWidth;
  const caixas = itens.map((el, i) => ({
    el,
    topo: el.offsetTop,
    base: el.offsetTop + alturas[i],
    esquerda: el.offsetLeft,
    direita: el.offsetLeft + el.offsetWidth,
    inteiro: el.offsetWidth >= largura - 1,
    alvo: alturas[i],
  }));

  const ordenadas = [...caixas].sort((a, b) => a.topo - b.topo);
  const faixas: (typeof caixas)[] = [];
  let atual: typeof caixas = [];
  for (const c of ordenadas) {
    if (c.inteiro) {
      if (atual.length) faixas.push(atual);
      atual = [];
      continue;
    }
    atual.push(c);
  }
  if (atual.length) faixas.push(atual);

  for (const faixa of faixas) {
    if (faixa.length < 2) continue;
    const fundo = Math.max(...faixa.map((c) => c.base));
    for (const c of faixa) {
      const temAbaixo = faixa.some((o) => o !== c && o.topo >= c.base && o.esquerda < c.direita - 1 && c.esquerda < o.direita - 1);
      if (temAbaixo || fundo - c.base < 1) continue;
      c.alvo = fundo - c.topo;
      c.el.style.gridRowEnd = `span ${Math.ceil((c.alvo + ESPACO) / LINHA)}`;
    }
  }

  delete grade.dataset.medindo;
  for (const c of caixas) {
    c.el.style.height = `${c.alvo}px`;
    preencher(c.el);
  }
}

export function useMosaico(ref: RefObject<HTMLElement | null>, chave: string) {
  useLayoutEffect(() => {
    const grade = ref.current;
    if (!grade) return;
    let quadro = 0;
    let largura = grade.clientWidth;
    const agendar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        organizar(grade);
      });
    };
    organizar(grade);
    const tamanho = new ResizeObserver(() => {
      if (grade.clientWidth === largura) return;
      largura = grade.clientWidth;
      agendar();
    });
    tamanho.observe(grade);
    const mudancas = new MutationObserver(agendar);
    mudancas.observe(grade, { childList: true, subtree: true, characterData: true });
    const aoCarregarFonte = () => agendar();
    document.fonts?.addEventListener?.("loadingdone", aoCarregarFonte);
    return () => {
      tamanho.disconnect();
      mudancas.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", aoCarregarFonte);
      cancelAnimationFrame(quadro);
    };
  }, [ref, chave]);
}
