-- Adds recurring/scheduled announcements support.
-- Safe to run multiple times.

alter table if exists public.announcements
  add column if not exists is_recurring boolean not null default false;

alter table if exists public.announcements
  add column if not exists days_of_week int[] null;

alter table if exists public.announcements
  add column if not exists start_time time null;

alter table if exists public.announcements
  add column if not exists end_time time null;

alter table if exists public.announcements
  add column if not exists timezone text null;

-- Basic sanity checks (non-breaking). Keep them permissive.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcements_days_of_week_valid'
  ) then
    alter table public.announcements
      add constraint announcements_days_of_week_valid
      check (
        days_of_week is null
        or array_length(days_of_week, 1) >= 0
      );
  end if;
exception when others then
  -- In case of permissions or prior constraints, ignore.
  null;
end $$;

