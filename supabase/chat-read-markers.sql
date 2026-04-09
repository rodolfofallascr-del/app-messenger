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

create policy "users can manage their own read markers"
on public.chat_read_markers
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
