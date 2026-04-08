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

drop policy if exists "admins can manage all profiles" on public.profiles;
create policy "admins can manage all profiles"
on public.profiles
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
