import projeto from "../supabase/projeto.json";

// Projeto Supabase partilhado por todos os utilizadores do Niko para o chat entre pessoas, definido em
// supabase/projeto.json. A chave pública ("anon" ou "publishable") pode ir no app: quem protege os dados
// são as regras de acesso (RLS) de supabase/migracoes/001_chat_entre_utilizadores.sql. Nunca use a chave service_role.
export const SUPABASE_URL = (process.env.NIKO_SUPABASE_URL ?? projeto.url).trim();
export const SUPABASE_CHAVE_PUBLICA = (process.env.NIKO_SUPABASE_CHAVE ?? projeto.chavePublica).trim();
