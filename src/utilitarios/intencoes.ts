import type { AgenteId } from "../tipos";
import { normalizarTexto, urlSegura } from "./basicos";

export type Intencao =
  | { tipo: "comando"; comando: string; confirmar?: boolean }
  | { tipo: "saudacao" }
  | { tipo: "resumo" }
  | { tipo: "desconhecida"; agente: AgenteId };

const VALOR = /(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\b(?!\s*h\b|\s*horas?\b|:\d|\/)/i;
const CONECTORES = /^(?:(?:reais|real|conto|contos|pila|r\$|no|na|nos|nas|em|de|do|da|com|pro|pra|para|o|a)\s+)+/i;

export function tirarConectores(texto: string): string {
  return texto.replace(CONECTORES, "").trim();
}

function original(texto: string, trecho: string): string {
  const fonte = texto.trim().normalize("NFC");
  const normalizado = normalizarTexto(fonte).replace(/[?!.]+$/, "");
  const inicio = normalizado.length - trecho.length;
  return fonte.slice(inicio, normalizado.length).trim();
}

export function detectarIntencao(textoOriginal: string): Intencao {
  const texto = textoOriginal.trim();
  if (texto.startsWith("/")) return { tipo: "comando", comando: texto };
  const n = normalizarTexto(texto).replace(/[?!.]+$/, "");

  if (/^(oi|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|salve|fala|hey)\b[ ,]*(time|galera|pessoal|gente)?$/.test(n)) return { tipo: "saudacao" };
  if (/^(como (estou|to|ta|esta|anda|vai)( (hoje|meu dia|o dia|as coisas))?|resumo( do dia)?|status|o que (eu )?tenho( pra| para)? hoje|meu dia|como foi (meu|o) dia)$/.test(n)) return { tipo: "resumo" };

  const primeiraPalavra = texto.split(/\s+/)[0] ?? "";
  if (urlSegura(primeiraPalavra)) return { tipo: "comando", comando: `/link ${texto}` };

  const gasto = /^(gastei|paguei|comprei|torrei|saiu|gasto de)\s+(.*)$/.exec(n);
  if (gasto) {
    const resto = original(texto, gasto[2]);
    const valor = VALOR.exec(resto);
    if (valor) {
      const descricao = tirarConectores(resto.replace(valor[0], " ").replace(/\s+/g, " ").trim());
      return { tipo: "comando", comando: `/gasto ${valor[1]} ${descricao}`.trim() };
    }
  }
  const receita = /^(recebi|ganhei|entrou|caiu)\s+(.*)$/.exec(n);
  if (receita) {
    const resto = original(texto, receita[2]);
    const valor = VALOR.exec(resto);
    if (valor) return { tipo: "comando", comando: `/receita ${valor[1]} ${tirarConectores(resto.replace(valor[0], " ").replace(/\s+/g, " ").trim())}`.trim() };
  }

  const lembrete = /^(me lembra(r)?|lembre-me|me lembre|lembrete|me avisa|me avise)( de| que| para| pra)?\s+(.*)$/.exec(n);
  if (lembrete) return { tipo: "comando", comando: `/lembrete ${original(texto, lembrete[4])}`, confirmar: true };

  const compra = /^(lista de compras|adiciona na lista|adicionar na lista|adiciona a lista|comprar)[:\s]+(.*)$/.exec(n);
  if (compra && /,| e /.test(compra[2])) return { tipo: "comando", comando: `/compra ${original(texto, compra[2]).replace(/\s+e\s+/gi, ", ")}` };

  const tarefa = /^(tenho que|tenho de|preciso|nova tarefa|tarefa|anota|anote)[:\s]+(.*)$/.exec(n);
  const pergunta = texto.endsWith("?") || /^preciso\s+(?:de\s+)?(?:entender|saber|aprender|ajuda|uma ajuda|que (?:voce|tu))\b/.test(n);
  if (tarefa && !pergunta) return { tipo: "comando", comando: `/tarefa ${tirarConectores(original(texto, tarefa[2]))}`, confirmar: true };

  const foco = /^(?:(?:inicia|iniciar|comeca|comecar|bora|vamos|liga|ligar)\s+(?:um\s+|o\s+)?)?(?:pomodoro|foco)(?:\s+de)?\s*(\d{1,3})?(?:\s*min(?:utos)?)?$/.exec(n);
  if (foco) return { tipo: "comando", comando: `/pomodoro ${foco[1] ?? ""}`.trim() };
  if (/^(?:(?:bora|vamos|quero|hora de)\s+)?revisar(?:\s+(?:agora|os cartoes|cartoes))?$/.test(n)) return { tipo: "comando", comando: "/revisar" };
  if (/^lembra(r)? que\s+/.test(n)) return { tipo: "comando", comando: `/lembrar ${texto.replace(/^lembra(r)? que\s+/i, "")}` };

  return { tipo: "desconhecida", agente: agentePeloAssunto(texto) };
}

const ASSUNTOS: [AgenteId, RegExp][] = [
  ["organizador", /\b(tarefas?|lembretes?|lembra\w*|agenda\w*|compromissos?|reunia?o|reunioes|calendario|eventos?|marca(r)? (que|uma|um|na|no)|anota\w*|habitos?|rotina|planeja\w*|organiza\w*)\b/],
  ["java", /\b(codigo|programa\w*|bug\w*|debug\w*|compila\w*|funcao|funcoes|variave\w*|classe\w*|typescript|javascript|java|python|rust|react|html|css|sql|api|apis|algoritmo\w*|commit\w*|refator\w*|framework\w*|backend|frontend|git|github|vercel|deploy\w*|stripe|n8n|resend|notion|cal\.?com|pull request|pr|prs|actions|servidor|banco de dados|webhook\w*|conex(ao|oes)|integra\w*|cobranca\w*|assinante\w*|computador|pc|notebook|ram|memoria|processador|cpu|gpu|placa de video|disco|armazenamento|bateria|wi-?fi|bluetooth|programas? abertos?|janelas? abertas?|processos?)\b/],
  ["operador", /\b(gast\w*|dinheiro|conta|contas|fatura\w*|orcamento\w*|pagamento\w*|pagar|paguei|reais|saldo|cartao de credito|investi\w*|econom\w*|compra\w*|mercado|salario|receita\w*|divid\w*|consumo de ia|tokens?)\b|r\$/],
  ["tutor", /\b(estud\w*|prova\w*|materia\w*|revis\w*|aula\w*|curso\w*|livro\w*|ler|leitura|cartao|cartoes|flashcard\w*|faculdade|escola|resumo de|explica\w*|aprender)\b/],
];

export function agentePeloAssunto(textoOriginal: string): AgenteId {
  const n = normalizarTexto(textoOriginal);
  if (/\b(cloudflare|supabase|github|vercel|n8n|resend)\b/.test(n)) return "java";
  if (/\b(google calendar|outlook|teams|todoist|microsoft 365)\b/.test(n)) return "organizador";
  return ASSUNTOS.find(([, padrao]) => padrao.test(n))?.[0] ?? "organizador";
}
