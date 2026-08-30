-- Mission 002: shared helper — keeps `updated_at` accurate on every table
-- that has one, instead of relying on application code to remember to
-- set it. Standard PostgreSQL, no Supabase-specific behaviour.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Sets updated_at = now() on every UPDATE. Attached per-table via a BEFORE UPDATE trigger.';
