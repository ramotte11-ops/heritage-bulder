-- Offrandes symboliques V1 — C1 : socle sécurisé des gestes réels.
--
-- Purely additive: four new tables and one function. No existing table,
-- policy, grant or row is touched. Nothing here is reachable by a
-- visitor yet: there is no public memorial page, the only writer is a
-- service_role function, and the eligibility lock below starts empty —
-- so no deposit can succeed anywhere until a later, separate mission
-- explicitly opens one memorial.
--
-- PO decisions this migration encodes (QG GO C1):
--   * a gesture is anonymous: memorial, kind, time — nothing else. No
--     name, e-mail, IP, user-agent or free text is ever received or
--     stored;
--   * gestures are private to the memorial's owner (no public read, no
--     counter, no collective display);
--   * deposits are reserved to the paid complete hommage (HERITAGE
--     Direct). That commercial model does not exist yet, so eligibility
--     is an explicit per-memorial opening, closed by default;
--   * when that right ends, no new gesture is accepted, but the gestures
--     already received stay readable by the family. Nothing here deletes
--     a gesture on expiry — no retention period has been decided.
--
-- ---------------------------------------------------------------------
-- A. symbolic_offerings — the gestures
-- ---------------------------------------------------------------------
--
-- `kind` mirrors config/symbolic-offerings-v1-tokens.ts (OFFERING_KINDS).
--
-- `idempotency_key` is a random UUID the visitor's browser draws once per
-- gesture. Unique per memorial: a double click or a network retry of the
-- same gesture records it once. It identifies a gesture, never a person.
--
-- `read_at` is reserved for C2 (owner notifications: unread while null).
-- No role may write it in C1.
--
-- `on delete cascade` follows memorials like every other memorial-owned
-- table (drafts, snapshots, messages). It fires only if the memorial row
-- itself is deleted — no role holds DELETE on memorials — never on the
-- end of a right.

create table symbolic_offerings (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references memorials (id) on delete cascade,
  kind text not null check (kind in ('bougie', 'lys', 'coeur')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,

  constraint symbolic_offerings_idempotency_key unique (memorial_id, idempotency_key),
  constraint symbolic_offerings_read_after_created check (read_at is null or read_at >= created_at)
);

create index symbolic_offerings_memorial_created_idx on symbolic_offerings (memorial_id, created_at desc);
-- C2: the owner's unread count per memorial.
create index symbolic_offerings_unread_idx on symbolic_offerings (memorial_id) where read_at is null;

comment on table symbolic_offerings is
  'Offrandes symboliques V1 (C1). One anonymous gesture (bougie, lys, coeur) left on a published memorial. Carries no visitor data at all. Written only by record_symbolic_offering_v1() (service_role); readable only by the memorial''s owner. Never deleted on expiry of the deposit right.';
comment on column symbolic_offerings.idempotency_key is
  'Random UUID drawn by the visitor''s browser once per gesture. Unique per memorial: a retry of the same gesture is recorded once. Identifies a gesture, never a person.';
comment on column symbolic_offerings.read_at is
  'Reserved for C2 (owner notifications). NULL = unread. Not writable by any role in C1.';

alter table symbolic_offerings enable row level security;

-- The owner reads the gestures of their own memorials — the same rule as
-- messages_select_own. Deliberately independent of eligibility: gestures
-- received stay readable after the deposit right has ended.
create policy symbolic_offerings_select_own on symbolic_offerings
  for select
  to authenticated
  using (memorial_id in (select id from memorials where owner_id = current_owner_id()));

revoke all privileges on table symbolic_offerings from public, anon, authenticated, service_role;
grant select on table symbolic_offerings to authenticated;

-- ---------------------------------------------------------------------
-- B. symbolic_offering_eligibility — the closed-by-default lock
-- ---------------------------------------------------------------------
--
-- One row = deposits explicitly opened for one memorial, from `opens_at`
-- until `closes_at` (NULL: no end yet). No row = closed. This is the only
-- place a deposit right lives; it carries no price, tier or duration
-- rule, because the HERITAGE Direct commercial model is not built yet.
--
-- No role can write it: C1 ships no function that opens a memorial. The
-- future HERITAGE Direct mission will add the one that does. Closing a
-- right (setting `closes_at`) never touches symbolic_offerings.

create table symbolic_offering_eligibility (
  memorial_id uuid primary key references memorials (id) on delete cascade,
  opens_at timestamptz not null default now(),
  closes_at timestamptz,
  created_at timestamptz not null default now(),

  constraint symbolic_offering_eligibility_window check (closes_at is null or closes_at > opens_at)
);

comment on table symbolic_offering_eligibility is
  'Offrandes symboliques V1 (C1). Closed-by-default deposit lock: a memorial accepts gestures only while a row here is open (opens_at <= now < closes_at, closes_at NULL = open-ended). Empty at creation; no role may write it in C1 — establishing HERITAGE Direct eligibility belongs to a later mission.';

alter table symbolic_offering_eligibility enable row level security;
revoke all privileges on table symbolic_offering_eligibility from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- C. symbolic_offering_settings — configurable, provisional limits
-- ---------------------------------------------------------------------
--
-- The deposit ceilings per memorial are DATA, not code: changing them is
-- a reviewed SQL update (QG mission), never a redeploy and never a
-- caller-supplied argument — the calling application cannot loosen them.
--
-- PROVISIONAL values, not a PO decision: 30 gestures per hour and 200
-- per day, per memorial. A missing or invalid row refuses every deposit
-- (fail closed).

create table symbolic_offering_settings (
  id boolean primary key default true check (id),
  max_per_hour integer not null check (max_per_hour > 0),
  max_per_day integer not null check (max_per_day > 0),
  updated_at timestamptz not null default now(),

  constraint symbolic_offering_settings_hour_within_day check (max_per_hour <= max_per_day)
);

insert into symbolic_offering_settings (max_per_hour, max_per_day) values (30, 200);

comment on table symbolic_offering_settings is
  'Offrandes symboliques V1 (C1). Single row: per-memorial deposit ceilings read by record_symbolic_offering_v1(). PROVISIONAL values (30/hour, 200/day), pending a PO decision. Changed only by reviewed SQL; no application role has any privilege on it.';

alter table symbolic_offering_settings enable row level security;
revoke all privileges on table symbolic_offering_settings from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- D. symbolic_offering_rate_limits — one counter row per memorial
-- ---------------------------------------------------------------------
--
-- Same fixed-window technique as activation_rate_limits (Mission 019C),
-- keyed by memorial instead of by identity: there is no visitor identity
-- to key on, and none is collected. Two windows, hour and day. The row
-- also serves as the per-memorial lock that serializes deposits.

create table symbolic_offering_rate_limits (
  memorial_id uuid primary key references memorials (id) on delete cascade,
  hour_window_started_at timestamptz not null default now(),
  hour_count integer not null default 0 check (hour_count >= 0),
  day_window_started_at timestamptz not null default now(),
  day_count integer not null default 0 check (day_count >= 0),
  updated_at timestamptz not null default now()
);

comment on table symbolic_offering_rate_limits is
  'Offrandes symboliques V1 (C1). Fixed-window deposit counters per memorial (hour and day). Counts only — no visitor data. Written only by record_symbolic_offering_v1().';

alter table symbolic_offering_rate_limits enable row level security;
revoke all privileges on table symbolic_offering_rate_limits from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- E. record_symbolic_offering_v1() — the one writer
-- ---------------------------------------------------------------------
--
-- Called by the server only (service_role), never by a browser. Takes the
-- memorial's public slug, never an internal id supplied by a visitor.
--
-- Business refusals are RETURNED, not raised, so the caller can answer
-- every one of them with the same opaque failure; only a malformed call
-- (a wiring bug) raises. Outcomes:
--   'recorded'      the gesture is stored;
--   'duplicate'     this idempotency key was already recorded for this
--                   memorial — nothing new is stored, the caller treats it
--                   as the success it already was;
--   'refused'       unknown slug, not published, Offrandes hidden in the
--                   published snapshot, other skin, or not eligible;
--   'rate_limited'  the memorial's hour or day ceiling is reached.
--
-- Order matters: every refusal is decided BEFORE the counter is touched,
-- so a closed memorial is never charged; the duplicate check runs under
-- the per-memorial row lock, so two concurrent retries of one gesture
-- cannot both pass it.

create or replace function public.record_symbolic_offering_v1(
  p_slug text,
  p_kind text,
  p_idempotency_key uuid
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_memorial_id uuid;
  v_status text;
  v_skin text;
  v_hidden jsonb;
  v_max_per_hour integer;
  v_max_per_day integer;
  v_limits public.symbolic_offering_rate_limits%rowtype;
begin
  if nullif(btrim(p_slug), '') is null
     or p_kind is null
     or p_kind not in ('bougie', 'lys', 'coeur')
     or p_idempotency_key is null then
    raise exception 'invalid symbolic offering request' using errcode = '22023';
  end if;

  select m.id, m.status, m.skin_id into v_memorial_id, v_status, v_skin
    from public.memorials as m
   where m.slug = p_slug;

  -- Published, Intemporel (the only skin the rubrique exists for), and
  -- visible in the LIVE published snapshot — what a visitor actually
  -- sees, never the draft. A malformed hiddenSections counts as "nothing
  -- hidden", exactly like lib/memorial/section-visibility.ts.
  if v_memorial_id is null or v_status is distinct from 'published' or v_skin is distinct from 'intemporel' then
    return query select 'refused'::text;
    return;
  end if;

  select s.content -> 'presentation' -> 'hiddenSections' into v_hidden
    from public.memorial_published_snapshots as s
   where s.memorial_id = v_memorial_id;

  if not found
     or (jsonb_typeof(v_hidden) = 'array' and v_hidden ? 'symbolicOfferings') then
    return query select 'refused'::text;
    return;
  end if;

  if not exists (
    select 1
      from public.symbolic_offering_eligibility as e
     where e.memorial_id = v_memorial_id
       and e.opens_at <= v_now
       and (e.closes_at is null or v_now < e.closes_at)
  ) then
    return query select 'refused'::text;
    return;
  end if;

  select st.max_per_hour, st.max_per_day into v_max_per_hour, v_max_per_day
    from public.symbolic_offering_settings as st
   where st.id;

  if v_max_per_hour is null or v_max_per_day is null then
    return query select 'refused'::text;
    return;
  end if;

  -- Per-memorial serialization point: from here to commit, one deposit at
  -- a time for this memorial.
  insert into public.symbolic_offering_rate_limits (memorial_id, hour_window_started_at, day_window_started_at)
  values (v_memorial_id, v_now, v_now)
  on conflict (memorial_id) do nothing;

  select * into v_limits
    from public.symbolic_offering_rate_limits as r
   where r.memorial_id = v_memorial_id
   for update;

  if exists (
    select 1
      from public.symbolic_offerings as o
     where o.memorial_id = v_memorial_id
       and o.idempotency_key = p_idempotency_key
  ) then
    return query select 'duplicate'::text;
    return;
  end if;

  if v_limits.hour_window_started_at <= v_now - interval '1 hour' then
    v_limits.hour_window_started_at := v_now;
    v_limits.hour_count := 0;
  end if;
  if v_limits.day_window_started_at <= v_now - interval '1 day' then
    v_limits.day_window_started_at := v_now;
    v_limits.day_count := 0;
  end if;

  if v_limits.hour_count >= v_max_per_hour or v_limits.day_count >= v_max_per_day then
    -- Keep any window reset just computed; never count the refusal.
    update public.symbolic_offering_rate_limits
       set hour_window_started_at = v_limits.hour_window_started_at,
           hour_count = v_limits.hour_count,
           day_window_started_at = v_limits.day_window_started_at,
           day_count = v_limits.day_count,
           updated_at = v_now
     where memorial_id = v_memorial_id;
    return query select 'rate_limited'::text;
    return;
  end if;

  update public.symbolic_offering_rate_limits
     set hour_window_started_at = v_limits.hour_window_started_at,
         hour_count = v_limits.hour_count + 1,
         day_window_started_at = v_limits.day_window_started_at,
         day_count = v_limits.day_count + 1,
         updated_at = v_now
   where memorial_id = v_memorial_id;

  insert into public.symbolic_offerings (memorial_id, kind, idempotency_key, created_at)
  values (v_memorial_id, p_kind, p_idempotency_key, v_now);

  return query select 'recorded'::text;
end;
$$;

comment on function public.record_symbolic_offering_v1(text, text, uuid) is
  'Offrandes symboliques V1 (C1). Records one anonymous gesture on a published memorial, by public slug. Refuses (returns, never raises) unless the memorial is published, Intemporel, shows the rubrique in its live snapshot and holds an open symbolic_offering_eligibility row; deduplicates by idempotency key under a per-memorial row lock; enforces the hour/day ceilings of symbolic_offering_settings. Service-role only; not wired to any route in C1.';

revoke execute on function public.record_symbolic_offering_v1(text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_symbolic_offering_v1(text, text, uuid) to service_role;
