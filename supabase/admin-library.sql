create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  tag text not null,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tag text,
  image_url text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.quick_replies enable row level security;
alter table public.media_library enable row level security;

drop policy if exists "admins can view quick replies" on public.quick_replies;
drop policy if exists "admins can manage quick replies" on public.quick_replies;
drop policy if exists "admins can view media library" on public.media_library;
drop policy if exists "admins can manage media library" on public.media_library;

create policy "admins can view quick replies"
on public.quick_replies
for select
to authenticated
using (public.is_current_user_admin());

create policy "admins can manage quick replies"
on public.quick_replies
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy "admins can view media library"
on public.media_library
for select
to authenticated
using (public.is_current_user_admin());

create policy "admins can manage media library"
on public.media_library
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create index if not exists idx_quick_replies_created_at on public.quick_replies (created_at desc);
create index if not exists idx_media_library_created_at on public.media_library (created_at desc);