import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { T } from "../textos/textos";

function emLinha(texto: string, chave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const padrao = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = padrao.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const bruto = m[0];
    const k = `${chave}-${i++}`;
    if (bruto.startsWith("`")) partes.push(<code key={k}>{bruto.slice(1, -1)}</code>);
    else if (bruto.startsWith("**") || bruto.startsWith("__")) partes.push(<strong key={k}>{bruto.slice(2, -2)}</strong>);
    else partes.push(<em key={k}>{bruto.slice(1, -1)}</em>);
    ultimo = m.index + bruto.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

type Bloco =
  | { tipo: "codigo"; texto: string; linguagem: string }
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "lista"; ordenada: boolean; itens: string[] }
  | { tipo: "citacao"; texto: string }
  | { tipo: "paragrafo"; linhas: string[] };

function blocos(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const saida: Bloco[] = [];
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i];
    const cerca = /^```\s*([\w+-]*)\s*$/.exec(linha);
    if (cerca) {
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !/^```\s*$/.test(linhas[i])) corpo.push(linhas[i++]);
      i++;
      saida.push({ tipo: "codigo", texto: corpo.join("\n"), linguagem: cerca[1] });
      continue;
    }
    if (!linha.trim()) {
      i++;
      continue;
    }
    const titulo = /^(#{1,4})\s+(.*)$/.exec(linha);
    if (titulo) {
      saida.push({ tipo: "titulo", nivel: titulo[1].length, texto: titulo[2] });
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(linha)) {
      const ordenada = /^\s*\d+[.)]\s+/.test(linha);
      const itens: string[] = [];
      while (i < linhas.length && /^\s*([-*+]|\d+[.)])\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      saida.push({ tipo: "lista", ordenada, itens });
      continue;
    }
    if (/^>\s?/.test(linha)) {
      const corpo: string[] = [];
      while (i < linhas.length && /^>\s?/.test(linhas[i])) corpo.push(linhas[i++].replace(/^>\s?/, ""));
      saida.push({ tipo: "citacao", texto: corpo.join(" ") });
      continue;
    }
    const corpo: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^```/.test(linhas[i]) && !/^#{1,4}\s/.test(linhas[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(linhas[i]) && !/^>\s?/.test(linhas[i])) corpo.push(linhas[i++]);
    saida.push({ tipo: "paragrafo", linhas: corpo });
  }
  return saida;
}

export function TextoRico({ texto }: { texto: string }) {
  return (
    <div className="texto-rico">
      {blocos(texto).map((b, n) => {
        const k = String(n);
        if (b.tipo === "codigo") return <BlocoCodigo key={k} texto={b.texto} linguagem={b.linguagem} />;
        if (b.tipo === "titulo") return <p key={k} className={`texto-rico-titulo texto-rico-t${b.nivel}`}>{emLinha(b.texto, k)}</p>;
        if (b.tipo === "citacao") return <blockquote key={k}>{emLinha(b.texto, k)}</blockquote>;
        if (b.tipo === "lista") {
          const Lista = b.ordenada ? "ol" : "ul";
          return <Lista key={k}>{b.itens.map((it, j) => <li key={j}>{emLinha(it, `${k}-${j}`)}</li>)}</Lista>;
        }
        return (
          <p key={k}>
            {b.linhas.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {emLinha(l, `${k}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const PALAVRAS = /^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|interface|type|enum|public|private|protected|static|void|null|undefined|true|false|this|super|def|lambda|pass|None|True|False|and|or|not|elif|with|as|yield|fn|mut|impl|struct|pub|use|mod|match|package|func|go|defer|select|from|where|join|insert|update|delete|create|table|into|values|set)$/;
const TOKENS = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(<\/?[A-Za-z][\w-]*)/g;

function colorir(texto: string, linguagem: string): ReactNode[] {
  const semHash = !/^(py|python|sh|bash|ps1|powershell|yaml|yml|toml|r|rb|ruby)$/i.test(linguagem);
  const saida: ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(TOKENS)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) saida.push(texto.slice(ultimo, inicio));
    const [todo, comentario, cadeia, numero, palavra, tag] = m;
    if (comentario && !(semHash && comentario.startsWith("#"))) saida.push(<span key={i++} className="cod-comentario">{todo}</span>);
    else if (cadeia) saida.push(<span key={i++} className="cod-texto">{todo}</span>);
    else if (numero) saida.push(<span key={i++} className="cod-numero">{todo}</span>);
    else if (palavra && PALAVRAS.test(palavra)) saida.push(<span key={i++} className="cod-palavra">{todo}</span>);
    else if (palavra && texto[inicio + todo.length] === "(") saida.push(<span key={i++} className="cod-funcao">{todo}</span>);
    else if (tag) saida.push(<span key={i++} className="cod-palavra">{todo}</span>);
    else saida.push(todo);
    ultimo = inicio + todo.length;
  }
  if (ultimo < texto.length) saida.push(texto.slice(ultimo));
  return saida;
}

function BlocoCodigo({ texto, linguagem }: { texto: string; linguagem: string }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const linhas = texto.split("\n").length;
  const longo = linhas > 16;
  const partes = useMemo(() => colorir(texto, linguagem), [texto, linguagem]);
  return (
    <div className="bloco-codigo" data-longo={longo && !aberto ? "sim" : "nao"}>
      <div className="bloco-codigo-topo">
        <span>{linguagem || T.chat.codigo.rotulo}</span>
        <span className="texto-3">{T.chat.codigo.linhas(linhas)}</span>
        <button
          type="button"
          className="bloco-codigo-botao"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
              window.setTimeout(() => setCopiado(false), 1400);
            } catch {
              return;
            }
          }}
        >
          {copiado ? <Check size={12} /> : <Copy size={12} />}
          {copiado ? T.chat.copiado : T.chat.copiar}
        </button>
      </div>
      <pre data-linguagem={linguagem || undefined}>
        <code>{partes}</code>
      </pre>
      {longo && (
        <button type="button" className="bloco-codigo-expandir" onClick={() => setAberto((a) => !a)}>
          {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {aberto ? T.chat.codigo.recolher : T.chat.codigo.verTudo(linhas)}
        </button>
      )}
    </div>
  );
}