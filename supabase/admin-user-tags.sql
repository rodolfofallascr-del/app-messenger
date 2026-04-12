alter table public.profiles
add column if not exists admin_tags text[] not null default '{}';

create or replace function public.admin_set_user_tags(target_user_id uuid, new_tags text[])
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles;
  updated_profile public.profiles;
  normalized_tags text[];
begin
  select *
  into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null or requester.role <> 'admin' or requester.status <> 'approved' then
    raise exception 'Solo un administrador aprobado puede guardar etiquetas administrativas.';
  end if;

  select coalesce(
    array_agg(distinct cleaned_tag order by cleaned_tag),
    '{}'::text[]
  )
  into normalized_tags
  from (
    select nullif(trim(tag_value), '') as cleaned_tag
    from unnest(coalesce(new_tags, '{}'::text[])) as tag_value
  ) normalized
  where cleaned_tag is not null;

  update public.profiles
  set admin_tags = normalized_tags
  where id = target_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'No se encontro el usuario objetivo.';
  end if;

  return updated_profile;
end;
$$;

grant execute on function public.admin_set_user_tags(uuid, text[]) to authenticated;
