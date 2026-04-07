# App de Mensajeria

Proyecto base para una app movil de mensajeria construida con Expo y React Native.

## Estado actual

- Estructura inicial del MVP creada
- Lista de conversaciones
- Vista de conversacion
- Composer para mensajes
- Auth con Supabase listo para conectar
- Datos simulados para avanzar rapido en UI mientras conectamos el backend

## Stack objetivo

- Expo + React Native
- Supabase Auth
- Supabase Realtime
- Supabase Storage
- Expo Notifications

## Variables de entorno

Duplica `.env.example` como `.env` y completa:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

## Base de datos

Ejecuta el SQL de `supabase/schema.sql` en el editor SQL de tu proyecto Supabase.

## Siguiente fase

1. Ejecutar `supabase/schema.sql`
2. Crear `.env` con tus credenciales
3. Conectar listado real de chats
4. Conectar mensajes en tiempo real
5. Subir imagenes y archivos con Storage
6. Agregar notificaciones push

## Comandos

```bash
npm start
npm run android
npm run web
```
