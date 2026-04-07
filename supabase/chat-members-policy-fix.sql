drop policy if exists "chat creators and admins can add members" on public.chat_members;

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
