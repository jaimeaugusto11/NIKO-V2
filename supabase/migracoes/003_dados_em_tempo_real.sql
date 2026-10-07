-- Avisa o outro aparelho assim que um bloco muda.
-- Rode depois da migração 002.

alter table public.dados_utilizador replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dados_utilizador'
  ) then
    alter publication supabase_realtime add table public.dados_utilizador;
  end if;
end $$;
