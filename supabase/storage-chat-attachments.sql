-- Crea el bucket publico para adjuntos del chat y permite a usuarios autenticados subir/leer archivos.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do update set public = true;

create policy "chat attachments are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'chat-attachments');

create policy "authenticated users can upload chat attachments"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'chat-attachments');
