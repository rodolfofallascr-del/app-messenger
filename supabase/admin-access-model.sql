alter table public.profiles add column if not exists role text not null default 'client';
alter table public.profiles add column if not exists status text not null default 'pending';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'client'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('pending', 'approved', 'blocked'));

update public.profiles
set role = coalesce(role, 'client'),
    status = coalesce(status, 'pending');

create index if not exists idx_profiles_role_status on public.profiles (role, status);