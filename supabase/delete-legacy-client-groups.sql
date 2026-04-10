-- PREVIEW:
-- Revisa los grupos existentes antes de borrar.
select
  c.id,
  c.name,
  c.type,
  c.created_at
from public.chats c
where c.type = 'group'
order by c.created_at desc;

-- DELETE BY CHAT ID:
-- Cambia el UUID por el chat que quieras borrar.
-- delete from public.chats
-- where id = 'PEGAR_CHAT_ID_AQUI';

-- DELETE BY GROUP NAME:
-- Cambia el nombre por el grupo exacto.
-- delete from public.chats
-- where type = 'group'
--   and name = 'PEGAR_NOMBRE_DEL_GRUPO_AQUI';
