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

create or replace function public.admin_delete_user_chats(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles;
  deleted_count integer := 0;
begin
  select *
  into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null or requester.role <> 'admin' or requester.status <> 'approved' then
    raise exception 'Solo un administrador aprobado puede eliminar conversaciones.';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = target_user_id
      and role = 'admin'
  ) then
    raise exception 'No se pueden eliminar conversaciones de otro administrador con esta accion.';
  end if;

  with deleted as (
    delete from public.chats c
    where c.id in (
      select cm.chat_id
      from public.chat_members cm
      where cm.user_id = target_user_id
    )
    returning c.id
  )
  select count(*)
  into deleted_count
  from deleted;

  return deleted_count;
end;
$$;

grant execute on function public.admin_delete_user_chats(uuid) to authenticated;

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

-- Clear messages of a single chat (keep chat + members). Admin-only.
-- Admin-only clear is implemented as a per-admin "cleared_at" marker, so clients do not lose history.
create table if not exists public.admin_chat_clears (
  admin_id uuid not null references public.profiles (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  cleared_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (admin_id, chat_id)
);

alter table public.admin_chat_clears enable row level security;

drop policy if exists "admins manage own chat clears" on public.admin_chat_clears;
create policy "admins manage own chat clears"
on public.admin_chat_clears
for all
to authenticated
using (public.is_current_user_admin() and admin_id = auth.uid())
with check (public.is_current_user_admin() and admin_id = auth.uid());

create or replace function public.touch_admin_chat_clears_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_admin_chat_clears_touch on public.admin_chat_clears;
create trigger trg_admin_chat_clears_touch
before update on public.admin_chat_clears
for each row
execute function public.touch_admin_chat_clears_updated_at();

create or replace function public.admin_clear_chat_messages(target_chat_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles;
begin
  select *
  into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null or requester.role <> 'admin' or requester.status <> 'approved' then
    raise exception 'Solo un administrador aprobado puede vaciar conversaciones.';
  end if;

  -- Only allow clearing chats where the admin is a member (avoid wiping arbitrary chats).
  if not exists (
    select 1
    from public.chat_members cm
    where cm.chat_id = target_chat_id
      and cm.user_id = auth.uid()
  ) then
    raise exception 'No tienes permisos para vaciar esta conversacion.';
  end if;

  insert into public.admin_chat_clears (admin_id, chat_id, cleared_at)
  values (auth.uid(), target_chat_id, timezone('utc', now()))
  on conflict (admin_id, chat_id)
  do update set cleared_at = excluded.cleared_at;

  return 1;
end;
$$;

grant execute on function public.admin_clear_chat_messages(uuid) to authenticated;

drop policy if exists "admins can manage all profiles" on public.profiles;
create policy "admins can manage all profiles"
on public.profiles
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
