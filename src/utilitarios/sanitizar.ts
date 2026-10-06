const ETIQUETAS_PERMITIDAS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "CODE", "PRE", "BLOCKQUOTE",
  "H1", "H2", "H3", "UL", "OL", "LI", "HR", "MARK", "A", "SPAN",
]);

export function sanitizarHtml(html: string): string {
  if (!html) return "";
  const documento = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const raiz = documento.body.firstElementChild;
  if (!raiz) return "";

  const limpar = (no: Element) => {
    for (const filho of Array.from(no.children)) {
      if (!ETIQUETAS_PERMITIDAS.has(filho.tagName)) {
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"].includes(filho.tagName)) {
          filho.remove();
          continue;
        }
        const fragmento = documento.createDocumentFragment();
        while (filho.firstChild) fragmento.appendChild(filho.firstChild);
        filho.replaceWith(fragmento);
        limpar(no);
        return;
      }
      for (const atributo of Array.from(filho.attributes)) {
        const nome = atributo.name.toLowerCase();
        const manter = filho.tagName === "A" && nome === "href" && /^https?:\/\//i.test(atributo.value);
        if (!manter) filho.removeAttribute(atributo.name);
      }
      if (filho.tagName === "A") {
        filho.setAttribute("rel", "noopener noreferrer");
        filho.setAttribute("target", "_blank");
      }
      limpar(filho);
    }
  };

  limpar(raiz);
  return raiz.innerHTML;
}

export function htmlParaTexto(html: string): string {
  if (!html) return "";
  const documento = new DOMParser().parseFromString(html, "text/html");
  return (documento.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
