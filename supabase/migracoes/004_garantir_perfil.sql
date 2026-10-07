-- Contas criadas antes do perfil ficavam sem linha em public.perfis.
-- A sincronização grava em dados_utilizador com essa chave e falhava.

create or replace function public.garantir_perfil()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
begin
  if auth.uid() is null then
    return;
  end if;
  select id, email, raw_user_meta_data into u from auth.users where id = auth.uid();
  if u.id is null or u.email is null then
    return;
  end if;
  insert into public.perfis (id, nome, email)
  values (
    u.id,
    left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1), 'conta'), 80),
    lower(u.email)
  )
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.garantir_perfil() from public, anon;
grant execute on function public.garantir_perfil() to authenticated;

insert into public.perfis (id, nome, email)
select
  u.id,
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1), 'conta'), 80),
  lower(u.email)
from auth.users u
where u.email is not null
  and not exists (select 1 from public.perfis p where p.id = u.id or lower(p.email) = lower(u.email));
