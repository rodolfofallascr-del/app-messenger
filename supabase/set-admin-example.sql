-- Reemplaza el correo por el del administrador principal.
update public.profiles
set role = 'admin',
    status = 'approved'
where email = 'tu-correo-admin@empresa.com';

-- Ejemplo para aprobar un cliente.
update public.profiles
set status = 'approved'
where email = 'cliente@empresa.com';

-- Ejemplo para bloquear un cliente.
update public.profiles
set status = 'blocked'
where email = 'cliente@empresa.com';