-- Server-side "active announcements" evaluation.
-- This avoids relying on device Intl/timezone behavior on Android.
--
-- Run in Supabase SQL Editor.

create or replace function public.get_active_announcements(
  _default_timezone text default 'America/Costa_Rica'
)
returns setof public.announcements
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      a.*,
      -- Safe timezone: if invalid, Postgres will raise. We guard with a simple fallback.
      -- Note: this does NOT fully validate IANA names, but keeps behavior predictable.
      coalesce(nullif(trim(a.timezone), ''), _default_timezone) as tz
    from public.announcements a
    where a.active = true
      and (a.starts_at is null or now() >= a.starts_at)
      and (a.ends_at is null or now() < a.ends_at)
  ),
  rec as (
    select
      b.*,
      extract(dow from (now() at time zone b.tz))::int as dow_local,
      (now() at time zone b.tz)::time as time_local
    from base b
  )
  select r.*
  from rec r
  where
    (
      r.is_recurring is not true
      or (
        r.is_recurring = true
        and r.days_of_week is not null
        and cardinality(r.days_of_week) > 0
        and r.start_time is not null
        and r.end_time is not null
        and (
          -- Normal window (e.g. 07:00 -> 11:00)
          (
            r.start_time <= r.end_time
            and r.dow_local = any (r.days_of_week)
            and r.time_local >= r.start_time
            and r.time_local < r.end_time
          )
          or
          -- Overnight window (e.g. 22:00 -> 02:00)
          (
            r.start_time > r.end_time
            and (
              (r.dow_local = any (r.days_of_week) and r.time_local >= r.start_time)
              or
              (((r.dow_local + 6) % 7) = any (r.days_of_week) and r.time_local < r.end_time)
            )
          )
        )
      )
    )
  order by r.updated_at desc nulls last, r.created_at desc;
$$;

-- Allow authenticated clients to call it.
revoke all on function public.get_active_announcements(text) from public;
grant execute on function public.get_active_announcements(text) to authenticated;

