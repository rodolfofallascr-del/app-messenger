create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  name text,
  type text not null check (type in ('direct', 'group')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (chat_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file')),
  attachment_url text,
  attachment_name text,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

create policy "profiles are viewable by authenticated users"
on public.profiles
for select
to authenticated
using (true);

create policy "users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "members can view their chats"
on public.chats
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_members members
    where members.chat_id = chats.id
      and members.user_id = auth.uid()
  )
);

create policy "authenticated users can create chats"
on public.chats
for insert
to authenticated
with check (created_by = auth.uid());

create policy "members can view chat membership"
on public.chat_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.chat_members members
    where members.chat_id = chat_members.chat_id
      and members.user_id = auth.uid()
  )
);

create policy "chat creators and admins can add members"
on public.chat_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_members members
    where members.chat_id = chat_members.chat_id
      and members.user_id = auth.uid()
      and members.role in ('owner', 'admin')
  )
);

create policy "members can view messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_members members
    where members.chat_id = messages.chat_id
      and members.user_id = auth.uid()
  )
);

create policy "members can send messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.chat_members members
    where members.chat_id = messages.chat_id
      and members.user_id = auth.uid()
  )
);

create index if not exists idx_chat_members_user_id on public.chat_members (user_id);
create index if not exists idx_messages_chat_id_created_at on public.messages (chat_id, created_at desc);
