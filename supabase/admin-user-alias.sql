alter table public.profiles
add column if not exists admin_alias text;

create or replace function public.admin_set_user_alias(target_user_id uuid, new_alias text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles;
  updated_profile public.profiles;
begin
  select *
  into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null or requester.role <> 'admin' or requester.status <> 'approved' then
    raise exception 'Solo un administrador aprobado puede guardar alias administrativos.';
  end if;

  update public.profiles
  set admin_alias = nullif(trim(new_alias), '')
  where id = target_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'No se encontro el usuario objetivo.';
  end if;

  return updated_profile;
end;
$$;

grant execute on function public.admin_set_user_alias(uuid, text) to authenticated;
