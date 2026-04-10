create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'approved'
  );
$$;

grant execute on function public.is_current_user_admin() to authenticated;

create or replace function public.admin_set_user_status(target_user_id uuid, new_status text)
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
    raise exception 'Solo un administrador aprobado puede cambiar el estado de usuarios.';
  end if;

  if new_status not in ('pending', 'approved', 'blocked') then
    raise exception 'Estado invalido: %', new_status;
  end if;

  if target_user_id = auth.uid() and new_status = 'blocked' then
    raise exception 'El administrador no puede bloquearse a si mismo.';
  end if;

  update public.profiles
  set status = new_status
  where id = target_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'No se encontro el usuario objetivo.';
  end if;

  return updated_profile;
end;
$$;

grant execute on function public.admin_set_user_status(uuid, text) to authenticated;

drop policy if exists "admins can manage all profiles" on public.profiles;
create policy "admins can manage all profiles"
on public.profiles
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
