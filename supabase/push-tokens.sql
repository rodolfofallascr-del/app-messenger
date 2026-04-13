-- Expo Push tokens for delivering push notifications to mobile clients.
-- Run this in Supabase SQL Editor.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  device_id text,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, expo_push_token)
);

create index if not exists idx_push_tokens_user_id on public.push_tokens (user_id);
create index if not exists idx_push_tokens_updated_at on public.push_tokens (updated_at desc);

alter table public.push_tokens enable row level security;

drop policy if exists "users can view their own push tokens" on public.push_tokens;
drop policy if exists "users can manage their own push tokens" on public.push_tokens;

create policy "users can view their own push tokens"
on public.push_tokens
for select
to authenticated
using (user_id = auth.uid());

create policy "users can manage their own push tokens"
on public.push_tokens
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

