import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Italic, Heading2, List, ListOrdered, Quote, Code, Minus, Strikethrough } from "lucide-react";
import { sanitizarHtml } from "../utilitarios/sanitizar";
import { T } from "../textos/textos";

interface Props {
  conteudo: string;
  aoMudar: (html: string) => void;
  placeholder?: string;
  compacto?: boolean;
  chave: string;
}

export function Editor({ conteudo, aoMudar, placeholder, compacto, chave }: Props) {
  const temporizador = useRef<number | undefined>(undefined);
  const aoMudarRef = useRef(aoMudar);
  const pendente = useRef<{ html: string; salvar: (html: string) => void } | null>(null);
  aoMudarRef.current = aoMudar;

  const editor = useEditor(
    {
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, protocols: ["http", "https"] } }), Placeholder.configure({ placeholder: placeholder ?? "" })],
      content: sanitizarHtml(conteudo),
      editorProps: {
        attributes: {
          class: `editor-conteudo ${compacto ? "editor-compacto" : ""}`,
          spellcheck: "true",
        },
      },
      onUpdate: ({ editor: e }) => {
        window.clearTimeout(temporizador.current);
        pendente.current = { html: e.isEmpty ? "" : e.getHTML(), salvar: aoMudarRef.current };
        temporizador.current = window.setTimeout(() => {
          if (pendente.current) pendente.current.salvar(pendente.current.html);
          pendente.current = null;
        }, 400);
      },
    },
    [chave],
  );

  useEffect(
    () => () => {
      window.clearTimeout(temporizador.current);
      if (pendente.current) pendente.current.salvar(pendente.current.html);
    },
    [chave],
  );

  if (!editor) return null;

  const botoes = [
    { icone: <Bold size={14} />, ativo: editor.isActive("bold"), acao: () => editor.chain().focus().toggleBold().run(), nome: T.editor.negrito },
    { icone: <Italic size={14} />, ativo: editor.isActive("italic"), acao: () => editor.chain().focus().toggleItalic().run(), nome: T.editor.italico },
    { icone: <Strikethrough size={14} />, ativo: editor.isActive("strike"), acao: () => editor.chain().focus().toggleStrike().run(), nome: T.editor.riscado },
    { icone: <Heading2 size={14} />, ativo: editor.isActive("heading", { level: 2 }), acao: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), nome: T.editor.titulo },
    { icone: <List size={14} />, ativo: editor.isActive("bulletList"), acao: () => editor.chain().focus().toggleBulletList().run(), nome: T.editor.lista },
    { icone: <ListOrdered size={14} />, ativo: editor.isActive("orderedList"), acao: () => editor.chain().focus().toggleOrderedList().run(), nome: T.editor.listaNumerada },
    { icone: <Quote size={14} />, ativo: editor.isActive("blockquote"), acao: () => editor.chain().focus().toggleBlockquote().run(), nome: T.editor.citacao },
    { icone: <Code size={14} />, ativo: editor.isActive("codeBlock"), acao: () => editor.chain().focus().toggleCodeBlock().run(), nome: T.editor.codigo },
    { icone: <Minus size={14} />, ativo: false, acao: () => editor.chain().focus().setHorizontalRule().run(), nome: T.editor.divisor },
  ];

  return (
    <div className="editor">
      <div className="editor-barra" role="toolbar">
        {botoes.map((b) => (
          <button key={b.nome} type="button" className="editor-botao" aria-pressed={b.ativo} aria-label={b.nome} title={b.nome} onClick={b.acao}>
            {b.icone}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
