-- Announcements (admin -> clients)
-- The admin publishes announcements that appear on the client mobile app.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null,
  active boolean not null default true,
  starts_at timestamptz not null default timezone('utc', now()),
  ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_announcements_active_updated
  on public.announcements (active, updated_at desc);

alter table public.announcements enable row level security;

create or replace function public.touch_announcements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_announcements_touch on public.announcements;
create trigger trg_announcements_touch
before update on public.announcements
for each row
execute function public.touch_announcements_updated_at();

-- Clients can read only active announcements in the current window.
drop policy if exists "clients can read active announcements" on public.announcements;
create policy "clients can read active announcements"
on public.announcements
for select
to authenticated
using (
  active = true
  and (starts_at is null or starts_at <= timezone('utc', now()))
  and (ends_at is null or ends_at > timezone('utc', now()))
);

-- Admins can manage announcements.
drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements"
on public.announcements
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

-- Realtime (optional but recommended for instant updates on mobile/web).
-- Safe to run multiple times; ignores "already member" errors.
do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
