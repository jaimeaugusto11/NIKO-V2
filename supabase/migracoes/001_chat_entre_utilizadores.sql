-- Chat entre utilizadores do Niko.
-- Rode este ficheiro uma vez no SQL Editor do seu projeto Supabase.
-- Não existe lista pública de utilizadores: só se encontra alguém pelo e-mail exato,
-- e cada pessoa só vê as conversas de que participa.

create extension if not exists pgcrypto;

-- Perfis -------------------------------------------------------------------

create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  email text not null unique,
  criado_em timestamptz not null default now()
);

create or replace function public.criar_perfil_do_utilizador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    lower(new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_utilizador on auth.users;
create trigger ao_criar_utilizador
  after insert on auth.users
  for each row execute function public.criar_perfil_do_utilizador();

-- Conversas, participantes e mensagens ---------------------------------------

create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('direta', 'grupo')),
  nome text check (nome is null or char_length(nome) between 1 and 80),
  criada_por uuid references public.perfis (id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create table if not exists public.participantes (
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  entrou_em timestamptz not null default now(),
  lida_em timestamptz not null default now(),
  primary key (conversa_id, usuario_id)
);

create index if not exists participantes_por_usuario on public.participantes (usuario_id);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  texto text not null check (char_length(trim(texto)) between 1 and 4000),
  criada_em timestamptz not null default now()
);

create index if not exists mensagens_por_conversa on public.mensagens (conversa_id, criada_em desc);

create or replace function public.tocar_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversas set atualizada_em = new.criada_em where id = new.conversa_id;
  update public.participantes set lida_em = new.criada_em where conversa_id = new.conversa_id and usuario_id = new.autor_id;
  return new;
end;
$$;

drop trigger if exists ao_enviar_mensagem on public.mensagens;
create trigger ao_enviar_mensagem
  after insert on public.mensagens
  for each row execute function public.tocar_conversa();

-- Regras de acesso (RLS) -----------------------------------------------------

-- Função auxiliar com security definer para as políticas não se chamarem em ciclo.
create or replace function public.participa(conversa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.participantes where conversa_id = conversa and usuario_id = auth.uid());
$$;

alter table public.perfis enable row level security;
alter table public.conversas enable row level security;
alter table public.participantes enable row level security;
alter table public.mensagens enable row level security;

drop policy if exists "ver o próprio perfil e de quem conversa comigo" on public.perfis;
create policy "ver o próprio perfil e de quem conversa comigo" on public.perfis
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.participantes eu
      join public.participantes outro on outro.conversa_id = eu.conversa_id
      where eu.usuario_id = auth.uid() and outro.usuario_id = perfis.id
    )
  );

drop policy if exists "alterar o próprio nome" on public.perfis;
create policy "alterar o próprio nome" on public.perfis
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "ver conversas de que participo" on public.conversas;
create policy "ver conversas de que participo" on public.conversas
  for select to authenticated
  using (public.participa(id));

drop policy if exists "ver participantes das minhas conversas" on public.participantes;
create policy "ver participantes das minhas conversas" on public.participantes
  for select to authenticated
  using (public.participa(conversa_id));

drop policy if exists "ver mensagens das minhas conversas" on public.mensagens;
create policy "ver mensagens das minhas conversas" on public.mensagens
  for select to authenticated
  using (public.participa(conversa_id));

drop policy if exists "enviar mensagens nas minhas conversas" on public.mensagens;
create policy "enviar mensagens nas minhas conversas" on public.mensagens
  for insert to authenticated
  with check (autor_id = auth.uid() and public.participa(conversa_id));

-- Criar conversas, participantes e grupos só acontece pelas funções abaixo,
-- que conferem quem está a pedir. Por isso não há políticas de insert nessas tabelas.

-- Funções chamadas pelo Niko ---------------------------------------------------

create or replace function public.buscar_por_email(procurado text)
returns table (id uuid, nome text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome, p.email from public.perfis p
  where auth.uid() is not null and p.email = lower(trim(procurado)) and p.id <> auth.uid()
  limit 1;
$$;

create or replace function public.abrir_conversa_direta(outro uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existente uuid;
  nova uuid;
begin
  if auth.uid() is null then raise exception 'sem_sessao'; end if;
  if outro = auth.uid() then raise exception 'conversa_consigo'; end if;
  if not exists (select 1 from public.perfis where id = outro) then raise exception 'utilizador_desconhecido'; end if;
  select c.id into existente from public.conversas c
  where c.tipo = 'direta'
    and exists (select 1 from public.participantes where conversa_id = c.id and usuario_id = auth.uid())
    and exists (select 1 from public.participantes where conversa_id = c.id and usuario_id = outro)
  limit 1;
  if existente is not null then return existente; end if;
  insert into public.conversas (tipo, criada_por) values ('direta', auth.uid()) returning id into nova;
  insert into public.participantes (conversa_id, usuario_id) values (nova, auth.uid()), (nova, outro);
  return nova;
end;
$$;

create or replace function public.criar_grupo(nome_do_grupo text, membros uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nova uuid;
begin
  if auth.uid() is null then raise exception 'sem_sessao'; end if;
  if char_length(trim(coalesce(nome_do_grupo, ''))) = 0 then raise exception 'grupo_sem_nome'; end if;
  if coalesce(array_length(membros, 1), 0) > 50 then raise exception 'grupo_grande_demais'; end if;
  insert into public.conversas (tipo, nome, criada_por) values ('grupo', trim(nome_do_grupo), auth.uid()) returning id into nova;
  insert into public.participantes (conversa_id, usuario_id) values (nova, auth.uid());
  insert into public.participantes (conversa_id, usuario_id)
    select nova, p.id from public.perfis p where p.id = any (membros) and p.id <> auth.uid()
    on conflict do nothing;
  return nova;
end;
$$;

create or replace function public.adicionar_ao_grupo(conversa uuid, membro uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.participa(conversa) then raise exception 'sem_acesso'; end if;
  if not exists (select 1 from public.conversas where id = conversa and tipo = 'grupo') then raise exception 'nao_e_grupo'; end if;
  if (select count(*) from public.participantes where conversa_id = conversa) >= 50 then raise exception 'grupo_grande_demais'; end if;
  insert into public.participantes (conversa_id, usuario_id) values (conversa, membro) on conflict do nothing;
end;
$$;

create or replace function public.sair_da_conversa(conversa uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.participantes where conversa_id = conversa and usuario_id = auth.uid();
  delete from public.conversas c where c.id = conversa and not exists (select 1 from public.participantes where conversa_id = c.id);
end;
$$;

create or replace function public.marcar_lida(conversa uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.participantes set lida_em = now() where conversa_id = conversa and usuario_id = auth.uid();
$$;

-- Lista das minhas conversas, com participantes, última mensagem e não lidas, numa só chamada.
create or replace function public.minhas_conversas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by (item ->> 'atualizadaEm') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id,
      'tipo', c.tipo,
      'nome', c.nome,
      'atualizadaEm', c.atualizada_em,
      'participantes', (
        select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'email', p.email))
        from public.participantes pa join public.perfis p on p.id = pa.usuario_id
        where pa.conversa_id = c.id
      ),
      'ultima', (
        select jsonb_build_object('texto', m.texto, 'autorId', m.autor_id, 'criadaEm', m.criada_em)
        from public.mensagens m where m.conversa_id = c.id order by m.criada_em desc limit 1
      ),
      'naoLidas', (
        select count(*) from public.mensagens m
        where m.conversa_id = c.id and m.criada_em > eu.lida_em and m.autor_id <> auth.uid()
      )
    ) as item
    from public.participantes eu
    join public.conversas c on c.id = eu.conversa_id
    where eu.usuario_id = auth.uid()
  ) lista;
$$;

revoke all on function public.criar_perfil_do_utilizador() from public, anon;
revoke all on function public.tocar_conversa() from public, anon;
revoke all on function public.participa(uuid) from public, anon;
grant execute on function public.criar_perfil_do_utilizador() to authenticated;
grant execute on function public.tocar_conversa() to authenticated;
grant execute on function public.participa(uuid) to authenticated;
revoke all on function public.buscar_por_email(text) from public, anon;
revoke all on function public.abrir_conversa_direta(uuid) from public, anon;
revoke all on function public.criar_grupo(text, uuid[]) from public, anon;
revoke all on function public.adicionar_ao_grupo(uuid, uuid) from public, anon;
revoke all on function public.sair_da_conversa(uuid) from public, anon;
revoke all on function public.marcar_lida(uuid) from public, anon;
revoke all on function public.minhas_conversas() from public, anon;
grant execute on function public.buscar_por_email(text) to authenticated;
grant execute on function public.abrir_conversa_direta(uuid) to authenticated;
grant execute on function public.criar_grupo(text, uuid[]) to authenticated;
grant execute on function public.adicionar_ao_grupo(uuid, uuid) to authenticated;
grant execute on function public.sair_da_conversa(uuid) to authenticated;
grant execute on function public.marcar_lida(uuid) to authenticated;
grant execute on function public.minhas_conversas() to authenticated;

-- Tempo real: o Supabase só entrega a cada pessoa as linhas que a RLS deixa ver.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'mensagens') then
    alter publication supabase_realtime add table public.mensagens;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'participantes') then
    alter publication supabase_realtime add table public.participantes;
  end if;
end;
$$;
