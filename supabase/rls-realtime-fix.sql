create or replace function public.is_chat_member(target_chat_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members
    where chat_id = target_chat_id
      and user_id = auth.uid()
  );
$$;

grant execute on function public.is_chat_member(uuid) to authenticated;

drop policy if exists "members can view their chats" on public.chats;
drop policy if exists "members can view chat membership" on public.chat_members;
drop policy if exists "chat creators and admins can add members" on public.chat_members;
drop policy if exists "members can view messages" on public.messages;
drop policy if exists "members can send messages" on public.messages;
drop policy if exists "members can delete own messages" on public.messages;

create policy "members can view their chats"
on public.chats
for select
to authenticated
using (
  public.is_chat_member(id)
);

create policy "members can view chat membership"
on public.chat_members
for select
to authenticated
using (
  public.is_chat_member(chat_id)
);

create policy "chat creators and admins can add members"
on public.chat_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chats
    where chats.id = chat_members.chat_id
      and chats.created_by = auth.uid()
  )
  or exists (
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
  public.is_chat_member(chat_id)
);

create policy "members can send messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_chat_member(chat_id)
);

create policy "members can delete own messages"
on public.messages
for delete
to authenticated
using (
  sender_id = auth.uid()
  and public.is_chat_member(chat_id)
);
