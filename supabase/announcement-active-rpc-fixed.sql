-- Fixed server-side "active announcements" evaluation.
-- This version avoids returning extra computed columns (tz/dow/time), which can cause:
--   ERROR: return type mismatch ... Final statement returns too many columns.
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
      a as row,
      coalesce(nullif(trim(a.timezone), ''), _default_timezone) as tz
    from public.announcements a
    where a.active = true
      and (a.starts_at is null or now() >= a.starts_at)
      and (a.ends_at is null or now() < a.ends_at)
  ),
  rec as (
    select
      b.row,
      b.tz,
      extract(dow from (now() at time zone b.tz))::int as dow_local,
      (now() at time zone b.tz)::time as time_local
    from base b
  )
  select (r.row).*
  from rec r
  where
    (
      (r.row).is_recurring is not true
      or (
        (r.row).is_recurring = true
        and (r.row).days_of_week is not null
        and cardinality((r.row).days_of_week) > 0
        and (r.row).start_time is not null
        and (r.row).end_time is not null
        and (
          -- Normal window (e.g. 07:00 -> 11:00)
          (
            (r.row).start_time <= (r.row).end_time
            and r.dow_local = any ((r.row).days_of_week)
            and r.time_local >= (r.row).start_time
            and r.time_local < (r.row).end_time
          )
          or
          -- Overnight window (e.g. 22:00 -> 02:00)
          (
            (r.row).start_time > (r.row).end_time
            and (
              (r.dow_local = any ((r.row).days_of_week) and r.time_local >= (r.row).start_time)
              or
              (((r.dow_local + 6) % 7) = any ((r.row).days_of_week) and r.time_local < (r.row).end_time)
            )
          )
        )
      )
    )
  order by (r.row).updated_at desc nulls last, (r.row).created_at desc;
$$;

revoke all on function public.get_active_announcements(text) from public;
grant execute on function public.get_active_announcements(text) to authenticated;

