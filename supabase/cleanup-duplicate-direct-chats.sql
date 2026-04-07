-- Limpia chats directos duplicados conservando el mas reciente de cada pareja de usuarios.
-- Revisa primero el bloque PREVIEW. Si el resultado se ve correcto, ejecuta el bloque DELETE.

-- PREVIEW
with direct_pairs as (
  select
    c.id,
    c.created_at,
    min(cm.user_id::text) as user_a,
    max(cm.user_id::text) as user_b,
    count(distinct cm.user_id) as member_count
  from public.chats c
  join public.chat_members cm on cm.chat_id = c.id
  where c.type = 'direct'
  group by c.id, c.created_at
),
ranked_duplicates as (
  select
    id,
    created_at,
    user_a,
    user_b,
    row_number() over (
      partition by user_a, user_b
      order by created_at desc, id desc
    ) as keep_rank
  from direct_pairs
  where member_count = 2
)
select id, created_at, user_a, user_b, keep_rank
from ranked_duplicates
where keep_rank > 1
order by user_a, user_b, created_at desc;

-- DELETE
begin;

with direct_pairs as (
  select
    c.id,
    c.created_at,
    min(cm.user_id::text) as user_a,
    max(cm.user_id::text) as user_b,
    count(distinct cm.user_id) as member_count
  from public.chats c
  join public.chat_members cm on cm.chat_id = c.id
  where c.type = 'direct'
  group by c.id, c.created_at
),
ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by user_a, user_b
      order by created_at desc, id desc
    ) as keep_rank
  from direct_pairs
  where member_count = 2
),
duplicate_chats as (
  select id
  from ranked_duplicates
  where keep_rank > 1
)
delete from public.chats
where id in (select id from duplicate_chats);

commit;
