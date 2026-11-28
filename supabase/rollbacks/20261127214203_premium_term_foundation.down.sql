-- Operational rollback gate. Keep the schema and premium protections in place.
-- Roll back only to an application build that retains the premium access guards.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.memorials'::regclass
      and t.tgname = 'memorials_set_complete_term' and t.tgenabled in ('O', 'A')
  ) or not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.memorial_published_snapshots'::regclass
      and t.tgname = 'memorial_published_snapshots_guard_expired_complete' and t.tgenabled in ('O', 'A')
  ) then
    raise exception '06-F1 rollback refused: a premium contract guard is missing';
  end if;

  if exists (
    select 1 from public.memorials m
    where m.complete_until <= statement_timestamp()
      and (
        public.memorial_publicly_visible_v1(m.id, statement_timestamp())
        or exists (select 1 from public.read_public_memorial_v1(m.slug))
      )
  ) then
    raise exception '06-F1 rollback refused: an expired premium memorial is publicly visible';
  end if;
end;
$$;
