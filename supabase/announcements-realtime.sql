-- Ensure announcements changes are delivered via Supabase Realtime (postgres_changes).
-- Safe to run multiple times.

do $$
begin
  begin
    alter publication supabase_realtime add table public.announcements;
  exception
    when duplicate_object then
      -- Already part of the publication.
      null;
  end;
end $$;

