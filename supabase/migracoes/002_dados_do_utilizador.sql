-- Dados do Niko partilhados entre o computador e o telemóvel.
-- Rode este ficheiro uma vez no SQL Editor, depois da migração 001.
-- Cada linha é um bloco já guardado pela app (tarefas, finanças, conversas com os agentes, ...).
-- Chaves de IA e de conexões não entram aqui: ficam no cofre de cada aparelho.
-- Quando os dois aparelhos mudam o mesmo bloco, fica o que foi escrito por último.

create table if not exists public.dados_utilizador (
  user_id uuid not null references public.perfis (id) on delete cascade,
  chave text not null check (chave ~ '^niko:[A-Za-z0-9_-]{1,60}$'),
  valor text not null check (char_length(valor) <= 900000),
  atualizado_em timestamptz not null default now(),
  dispositivo text not null default '' check (char_length(dispositivo) <= 40),
  apagado boolean not null default false,
  primary key (user_id, chave)
);

alter table public.dados_utilizador enable row level security;

drop policy if exists "ler os meus dados" on public.dados_utilizador;
create policy "ler os meus dados" on public.dados_utilizador
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "criar os meus dados" on public.dados_utilizador;
create policy "criar os meus dados" on public.dados_utilizador
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "alterar os meus dados" on public.dados_utilizador;
create policy "alterar os meus dados" on public.dados_utilizador
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
