create table if not exists public.chat_read_markers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  last_read_message_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, chat_id)
);

create index if not exists idx_chat_read_markers_user_updated
  on public.chat_read_markers (user_id, updated_at desc);

alter table public.chat_read_markers enable row level security;

drop policy if exists "users can view their own read markers" on public.chat_read_markers;
drop policy if exists "users can manage their own read markers" on public.chat_read_markers;

create policy "users can view their own read markers"
on public.chat_read_markers
for select
to authenticated
using (auth.uid() = user_id);

-- Allow chat members to view read markers for chats they belong to.
-- This enables WhatsApp-like read receipts (e.g., client sees when admin read their message).
drop policy if exists "members can view read markers for their chats" on public.chat_read_markers;
create policy "members can view read markers for their chats"
on public.chat_read_markers
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_members cm
    where cm.chat_id = chat_read_markers.chat_id
      and cm.user_id = auth.uid()
  )
);

create policy "users can manage their own read markers"
on public.chat_read_markers
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
