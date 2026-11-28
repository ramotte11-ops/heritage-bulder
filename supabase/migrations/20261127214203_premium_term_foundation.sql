-- 06-F1. The historical first publication and the premium contract have independent clocks.
-- Existing rows keep their dates (including NULL). No backfill.
alter table public.memorials
  add column complete_started_at timestamptz,
  add column complete_until timestamptz,
  add column complete_recovery_until timestamptz,
  add column complete_archive_until timestamptz,
  add column complete_pending_publication boolean not null default false,
  add constraint memorials_complete_term_coherent check (
    (complete_started_at is null and complete_until is null
      and complete_recovery_until is null and complete_archive_until is null)
    or (access_level = 'complet' and first_published_at is not null
      and complete_started_at is not null and complete_until is not null
      and complete_recovery_until is not null and complete_archive_until is not null
      and complete_started_at >= first_published_at and complete_started_at < complete_until
      and complete_until < complete_recovery_until and complete_recovery_until < complete_archive_until)
  ),
  add constraint memorials_complete_pending_coherent check (
    not complete_pending_publication or (access_level = 'complet' and complete_started_at is null)
  );

-- Publication RPCs and the upgrade RPC already serialize on the memorial row.
-- UTC calendar arithmetic is independent of the connection's TimeZone.
create function public.set_memorial_complete_term_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.complete_started_at is not null or new.complete_until is not null
       or new.complete_recovery_until is not null or new.complete_archive_until is not null
       or new.complete_pending_publication then
      raise exception 'premium term is server managed' using errcode = '23514';
    end if;
    return new;
  end if;

  if row(new.complete_started_at, new.complete_until, new.complete_recovery_until,
         new.complete_archive_until, new.complete_pending_publication)
     is distinct from
     row(old.complete_started_at, old.complete_until, old.complete_recovery_until,
         old.complete_archive_until, old.complete_pending_publication) then
    raise exception 'premium term is server managed' using errcode = '23514';
  end if;

  if new.access_level <> 'complet' or old.complete_started_at is not null then
    return new;
  end if;

  if old.access_level = 'avis' then
    if old.status = 'published' then
      -- Same clock value as the upgrade's journal event.
      v_start := new.access_level_changed_at;
      if v_start is null then
        raise exception 'published upgrade requires an upgrade timestamp' using errcode = '23514';
      end if;
    else
      new.complete_pending_publication := true;
    end if;
  elsif new.status = 'published' and old.status <> 'published'
      and (old.first_published_at is null or old.complete_pending_publication) then
    -- An editing free tribute can be upgraded while off-line. Its existing
    -- historical date must survive and the new snapshot supplies the anchor.
    if old.first_published_at is null then
      v_start := new.first_published_at;
    else
      select s.published_at into v_start
        from public.memorial_published_snapshots s where s.memorial_id = new.id;
    end if;
    if v_start is null then
      raise exception 'premium publication requires a publication timestamp' using errcode = '23514';
    end if;
  end if;

  if v_start is not null then
    new.complete_pending_publication := false;
    new.complete_started_at := v_start;
    new.complete_until := ((v_start at time zone 'UTC') + interval '10 years') at time zone 'UTC';
    new.complete_recovery_until := ((new.complete_until at time zone 'UTC') + interval '3 months') at time zone 'UTC';
    new.complete_archive_until := ((new.complete_recovery_until at time zone 'UTC') + interval '12 months') at time zone 'UTC';
  end if;
  return new;
end;
$$;

revoke all on function public.set_memorial_complete_term_v1() from public, anon, authenticated, service_role;
create trigger memorials_set_complete_term
before insert or update on public.memorials
for each row execute function public.set_memorial_complete_term_v1();

-- The shared snapshot boundary covers every publication RPC, including older versions.
create function public.guard_expired_complete_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.memorials m
     where m.id = new.memorial_id and m.complete_until <= clock_timestamp()
  ) then
    raise exception 'premium publication expired' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_expired_complete_publication_v1() from public, anon, authenticated, service_role;
create trigger memorial_published_snapshots_guard_expired_complete
before insert or update on public.memorial_published_snapshots
for each row execute function public.guard_expired_complete_publication_v1();

create or replace function public.memorial_publicly_visible_v1(p_memorial_id uuid, p_now timestamptz)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select m.status = 'published'
           and ((m.access_level = 'complet'
                 and not m.complete_pending_publication
                 and (m.complete_until is null or p_now < m.complete_until))
                or (m.access_level = 'avis'
                    and m.free_public_until is not null
                    and p_now < m.free_public_until))
      from public.memorials m
     where m.id = p_memorial_id
  ), false);
$$;

comment on function public.memorial_publicly_visible_v1(uuid, timestamptz) is
  'Published and within the applicable term. Historical complete publications without a term retain their visibility.';

-- Narrow owner access. The draft and offering policies already read memorials
-- under RLS, so they inherit the recovery boundary.
alter policy memorials_select_own on public.memorials
  using (owner_id = public.current_owner_id()
         and (complete_recovery_until is null or now() < complete_recovery_until));

alter policy memorials_update_own on public.memorials
  using (owner_id = public.current_owner_id()
         and (complete_recovery_until is null or now() < complete_recovery_until))
  with check (owner_id = public.current_owner_id()
              and (complete_recovery_until is null or now() < complete_recovery_until));

alter policy memorial_videos_select_own on public.memorial_videos
  using (owner_id = public.current_owner_id()
         and exists (select 1 from public.memorials m where m.id = memorial_id));

-- A signature is a second public write and does not otherwise recheck the term.
create or replace function public.sign_symbolic_offering_v1(
  p_slug text,
  p_idempotency_key uuid,
  p_signature text
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_memorial_id uuid;
  v_existing text;
begin
  if nullif(btrim(p_slug), '') is null
     or p_idempotency_key is null
     or p_signature is null
     or char_length(p_signature) not between 1 and 40
     or p_signature <> btrim(p_signature)
     or p_signature ~ '[[:cntrl:]]'
     or p_signature ~ '[\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]' then
    raise exception 'invalid symbolic offering signature request' using errcode = '22023';
  end if;

  select m.id into v_memorial_id
    from public.memorials as m
   where m.slug = p_slug
     and (m.complete_until is null or v_now < m.complete_until);

  if v_memorial_id is null then
    return query select 'refused'::text;
    return;
  end if;

  -- Une seule instruction : la ligne est verrouillée par l'UPDATE ; deux
  -- envois concurrents ne peuvent pas signer deux fois le même geste.
  update public.symbolic_offerings as o
     set signature = p_signature,
         signed_at = v_now
   where o.memorial_id = v_memorial_id
     and o.idempotency_key = p_idempotency_key
     and o.signature is null
     and o.created_at > v_now - interval '30 minutes';

  if found then
    return query select 'signed'::text;
    return;
  end if;

  select o.signature into v_existing
    from public.symbolic_offerings as o
   where o.memorial_id = v_memorial_id
     and o.idempotency_key = p_idempotency_key;

  if v_existing is not null and v_existing = p_signature then
    return query select 'already_signed'::text;
    return;
  end if;

  return query select 'refused'::text;
end;
$$;

-- C3 closes the ACL again on CREATE OR REPLACE.
grant execute on function public.sign_symbolic_offering_v1(text, uuid, text) to service_role;

notify pgrst, 'reload schema';
