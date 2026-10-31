-- HERITAGE HOMMAGE — QG 008, Lot 1 : RETOUR ARRIÈRE de
-- supabase/migrations/20261031120000_qg008_free_offer_v8_alignment.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : ce fichier n'est jamais appliqué
-- automatiquement. Il n'est exécuté que sur décision explicite du QG.
--
-- Généré par extraction exacte des corps de fonctions des migrations
-- M1-A (20261024180000, 20261024190000), C1 (20261023160000) et Mission
-- 002 (20260829154000, 20260829157000) : l'état obtenu est celui que
-- grade supabase/checks/m1a_postflight.sql (prouvé par
-- scripts/db/test-local.sh).
--
-- Refuse de s'exécuter si une dérogation a été accordée (la supprimer
-- perdrait une trace administrative). Les échéances déjà posées sur des
-- brouillons ou avis existants (10 j, 7 j de récupération) ne sont PAS
-- recalculées : ce sont des faits enregistrés.

begin;

do $$
begin
  if exists (select 1 from public.free_publication_waivers) then
    raise exception 'free publication waivers exist; rollback refused, nothing changed'
      using errcode = 'HD500';
  end if;
end;
$$;

-- I. Messages
drop policy messages_insert_public on public.messages;
create policy messages_insert_public on messages
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public_memorial_publication_state(messages.memorial_id) s
      where s.status = 'published'
        and (
          (messages.message_type = 'condolence' and 'condolences' = any (s.enabled_sections))
          or (messages.message_type = 'testimonial' and 'testimonials' = any (s.enabled_sections))
          or (messages.message_type = 'memory_message' and 'memoryMessage' = any (s.enabled_sections))
        )
    )
  );

drop function public.public_memorial_message_allowed_v1(uuid, text);
alter table public.messages alter column visible set default true;

-- H. Visibilité
create or replace function public_memorial_publication_state(p_memorial_id uuid)
returns table (status text, enabled_sections text[])
language sql
security definer
set search_path = public
stable
as $$
  select status, enabled_sections from memorials where id = p_memorial_id;
$$;

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
drop function public.memorial_publicly_visible_v1(uuid, timestamptz);

-- G. Publication v2
drop function public.commit_memorial_publication_v2(uuid, uuid, bigint, text, timestamptz, text, text, text, text, text, jsonb, jsonb);

-- F. Copie publiée d'un avis
drop trigger memorial_published_snapshots_guard_avis on public.memorial_published_snapshots;
drop function public.guard_avis_published_snapshot_v1();

-- E. Galerie
create or replace function public.guard_free_gallery_quota_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  v_settings public.memorial_access_settings%rowtype;
  v_draft jsonb;
  v_snapshot jsonb;
  v_has_snapshot boolean;
  v_rows integer;
  v_counted integer;
  v_now timestamptz := clock_timestamp();
begin
  if new.purpose is distinct from 'gallery' then
    return new;
  end if;

  select m.access_level into v_level
    from public.memorials m
   where m.id = new.memorial_id
   for update;

  if v_level is distinct from 'avis' then
    return new;
  end if;

  select * into v_settings from public.memorial_access_settings where id;
  if not found then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;

  select d.content into v_draft from public.memorial_drafts d where d.memorial_id = new.memorial_id;
  select s.content into v_snapshot from public.memorial_published_snapshots s where s.memorial_id = new.memorial_id;
  v_has_snapshot := found;

  select count(*) into v_rows
    from public.media md
   where md.memorial_id = new.memorial_id
     and md.purpose = 'gallery';
  if v_rows >= v_settings.avis_gallery_rows_cap then
    raise exception 'free gallery storage cap reached' using errcode = 'HD413';
  end if;

  select count(*) into v_counted
    from public.media md
   where md.memorial_id = new.memorial_id
     and md.purpose = 'gallery'
     and (
       (md.status = 'pending' and md.created_at > v_now - v_settings.pending_media_window)
       or (md.status = 'ready'
           and not (v_has_snapshot
                    and public.memorial_content_references_media_v1(v_snapshot, md.id)
                    and not public.memorial_content_references_media_v1(v_draft, md.id)))
     );
  if v_counted >= v_settings.avis_gallery_limit then
    raise exception 'free gallery limit reached' using errcode = 'HD413';
  end if;

  return new;
end;
$$;

create or replace function public.guard_free_draft_gallery_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  v_limit integer;
  v_items jsonb;
begin
  select m.access_level into v_level from public.memorials m where m.id = new.memorial_id;
  if v_level is distinct from 'avis' then
    return new;
  end if;

  v_items := new.content #> '{gallery,items}';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    return new;
  end if;

  select s.avis_gallery_limit into v_limit from public.memorial_access_settings s where s.id;
  if v_limit is null then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;
  if jsonb_array_length(v_items) > v_limit then
    raise exception 'free gallery limit reached' using errcode = 'HD413';
  end if;
  return new;
end;
$$;

create trigger memorial_drafts_guard_free_gallery
before update of content on public.memorial_drafts
for each row execute function public.guard_free_draft_gallery_v1();


-- D. Fenêtre, quota, garde-fous
create or replace function public.memorials_inherit_access_level_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
begin
  select e.access_level into v_level
    from public.entitlements e
   where e.id = new.entitlement_id;

  if v_level is null then
    raise exception 'memorial access level missing on entitlement' using errcode = 'HD500';
  end if;
  if new.access_level is not null and new.access_level is distinct from v_level then
    raise exception 'memorial access level must equal its entitlement' using errcode = 'HD500';
  end if;

  new.access_level := v_level;
  new.access_level_changed_at := null;
  new.free_anchor_at := null;
  new.free_publish_until := null;
  new.free_draft_until := null;
  new.free_corrections_until := null;
  new.free_public_until := null;
  new.free_private_until := null;
  return new;
end;
$$;

create or replace function public.guard_free_first_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.memorial_access_settings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_previous integer;
begin
  if not (new.status = 'published'
          and old.first_published_at is null
          and new.first_published_at is not null) then
    return new;
  end if;

  if new.access_level is distinct from 'avis' then
    return new;
  end if;

  select * into v_settings from public.memorial_access_settings where id;
  if not found then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;

  if new.free_anchor_at is null then
    raise exception 'free publication requires a confirmed e-mail' using errcode = 'HD428';
  end if;
  if v_now >= new.free_publish_until then
    raise exception 'free publication window closed' using errcode = 'HD410';
  end if;

  -- Sérialise les premières publications gratuites d'un même propriétaire
  -- (ordre des verrous : memorial, puis owner).
  perform 1 from public.owners o where o.id = new.owner_id for update;

  select count(*) into v_previous
    from public.memorial_access_events ev
   where ev.owner_id = new.owner_id
     and ev.event = 'free.first_published'
     and ev.created_at > v_now - v_settings.free_publication_quota_window;
  if v_previous >= v_settings.free_publications_per_owner then
    raise exception 'free publication quota reached' using errcode = 'HD403';
  end if;

  new.free_corrections_until := new.first_published_at + v_settings.free_correction_window;
  new.free_public_until := new.first_published_at + v_settings.free_public_duration;
  new.free_private_until := new.free_public_until + v_settings.free_private_extension;

  insert into public.memorial_access_events (memorial_id, owner_id, event, from_level, to_level, created_at)
  values (new.id, new.owner_id, 'free.first_published', 'avis', 'avis', v_now);

  return new;
end;
$$;

create or replace function public.free_access_window_v1(p_owner_id uuid, p_now timestamptz)
returns table (window_opened_at timestamptz, publications integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select max(ev.created_at)
       from public.memorial_access_events ev
      where ev.owner_id = p_owner_id
        and ev.event = 'free.window_opened'
        and ev.created_at > p_now - s.free_publication_quota_window),
    (select count(*)::integer
       from public.memorial_access_events ev
      where ev.owner_id = p_owner_id
        and ev.event = 'free.first_published'
        and ev.created_at > p_now - s.free_publication_quota_window)
  from public.memorial_access_settings s
  where s.id;
$$;

create or replace function public.create_free_memorial_v1(
  p_owner_id uuid,
  p_skin_id text,
  p_skin_variant text
)
returns table (outcome text, memorial_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.memorial_access_settings%rowtype;
  v_active integer;
  v_window_opened_at timestamptz;
  v_publications integer;
  v_entitlement uuid;
  v_memorial uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_owner_id is null
     or p_skin_id is distinct from 'intemporel'
     or p_skin_variant is null
     or p_skin_variant not in ('light', 'dark') then
    raise exception 'invalid free memorial request' using errcode = '22023';
  end if;

  select * into v_settings from public.memorial_access_settings where id;
  if not found then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;

  perform 1 from public.owners o where o.id = p_owner_id for update;
  if not found then
    return query select 'refused'::text, null::uuid;
    return;
  end if;

  select count(*) into v_active
    from public.memorials m
   where m.owner_id = p_owner_id
     and m.access_level = 'avis'
     and m.first_published_at is null
     and m.status <> 'archived'
     and (m.free_draft_until is null or v_now < m.free_draft_until);
  if v_active >= v_settings.free_active_drafts_per_owner then
    return query select 'free_draft_limit'::text, null::uuid;
    return;
  end if;

  select w.window_opened_at, w.publications into v_window_opened_at, v_publications
    from public.free_access_window_v1(p_owner_id, v_now) w;
  if v_publications >= v_settings.free_publications_per_owner
     or (v_window_opened_at is not null
         and v_now >= v_window_opened_at + v_settings.free_publish_window) then
    return query select 'free_unavailable'::text, null::uuid;
    return;
  end if;

  insert into public.entitlements (source, offer_id, access_level)
  values ('direct', 'intemporel', 'avis')
  returning id into v_entitlement;

  select r.memorial_id into v_memorial
    from public.redeem_entitlement(v_entitlement, p_owner_id, 'person', p_skin_id, p_skin_variant) r;

  insert into public.memorial_access_events (memorial_id, owner_id, event, to_level, created_at)
  values (v_memorial, p_owner_id, 'free.created', 'avis', v_now);

  return query select 'created'::text, v_memorial;
end;
$$;

create or replace function public.anchor_free_memorial_v1(
  p_memorial_id uuid,
  p_owner_id uuid
)
returns table (outcome text, free_anchor_at timestamptz, free_publish_until timestamptz, free_draft_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_settings public.memorial_access_settings%rowtype;
  v_window_opened_at timestamptz;
  v_publications integer;
  v_anchor timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_memorial_id is null or p_owner_id is null then
    raise exception 'invalid free memorial anchor request' using errcode = '22023';
  end if;

  select * into v_memorial from public.memorials m where m.id = p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id or v_memorial.status = 'archived' then
    return query select 'refused'::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_memorial.access_level is distinct from 'avis' then
    return query select 'not_free'::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_memorial.free_anchor_at is not null then
    return query select 'already_anchored'::text, v_memorial.free_anchor_at,
                        v_memorial.free_publish_until, v_memorial.free_draft_until;
    return;
  end if;
  if v_memorial.first_published_at is not null then
    return query select 'refused'::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_settings from public.memorial_access_settings where id;
  if not found then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;

  -- Sérialise les ouvertures de fenêtre d'une même adresse.
  perform 1 from public.owners o where o.id = p_owner_id for update;

  select w.window_opened_at, w.publications into v_window_opened_at, v_publications
    from public.free_access_window_v1(p_owner_id, v_now) w;
  if v_publications >= v_settings.free_publications_per_owner
     or (v_window_opened_at is not null
         and v_now >= v_window_opened_at + v_settings.free_publish_window) then
    return query select 'free_unavailable'::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_window_opened_at is null then
    v_anchor := v_now;
    insert into public.memorial_access_events (memorial_id, owner_id, event, from_level, to_level, created_at)
    values (p_memorial_id, p_owner_id, 'free.window_opened', 'avis', 'avis', v_now);
  else
    v_anchor := v_window_opened_at;
  end if;

  update public.memorials
     set free_anchor_at = v_anchor,
         free_publish_until = v_anchor + v_settings.free_publish_window,
         free_draft_until = v_anchor + v_settings.free_draft_retention
   where id = p_memorial_id;

  insert into public.memorial_access_events (memorial_id, owner_id, event, from_level, to_level, created_at)
  values (p_memorial_id, p_owner_id, 'free.anchored', 'avis', 'avis', v_now);

  return query select 'anchored'::text, v_anchor,
                      v_anchor + v_settings.free_publish_window,
                      v_anchor + v_settings.free_draft_retention;
end;
$$;

comment on function public.free_access_window_v1(uuid, timestamptz) is
  'HERITAGE Direct M1-A, correctif 1. Ancre du cycle gratuit en cours d''une adresse (propriétaire) et nombre de premières publications gratuites sur 12 mois. Interne : exécutable par aucun rôle.';
comment on function public.create_free_memorial_v1(uuid, text, text) is
  'HERITAGE Direct M1-A. Crée un brouillon gratuit (droit direct « avis » + redeem_entitlement inchangée, une transaction). B6 : « free_draft_limit » si un brouillon gratuit est actif ; « free_unavailable » si l''adresse ne peut plus publier gratuitement dans son cycle. service_role seul.';
comment on function public.anchor_free_memorial_v1(uuid, uuid) is
  'HERITAGE Direct M1-A (B1). Ancre un brouillon gratuit sur la fenêtre de son ADRESSE : la première confirmation du cycle l''ouvre (heure de la base), les brouillons suivants en héritent ; +7 j publication gratuite, +45 j conservation. « free_unavailable » hors fenêtre ou quota consommé. Idempotente. service_role seul.';
drop function public.free_window_status_v1(uuid, timestamptz);

-- C. Dérogations
drop function public.grant_free_publication_waiver_v1(uuid, uuid, text, text);
drop function public.revoke_free_publication_waiver_v1(uuid, uuid);
drop table public.free_publication_waivers;
alter table public.memorial_access_events
  drop constraint memorial_access_events_event_check;
alter table public.memorial_access_events
  add constraint memorial_access_events_event_check
  check (event in ('free.created', 'free.window_opened', 'free.anchored',
                   'free.first_published', 'access.upgraded'));

-- B. Récupération du brouillon
drop trigger memorials_derive_free_recovery on public.memorials;
drop function public.memorials_derive_free_recovery_v1();
alter table public.memorials
  drop constraint memorials_free_draft_recovery_coherent,
  drop constraint memorials_free_publication_coherent;
alter table public.memorials drop column free_draft_recovery_until;
alter table public.memorials
  add constraint memorials_free_publication_coherent check (
    (free_corrections_until is null and free_public_until is null and free_private_until is null)
    or (first_published_at is not null
        and free_corrections_until > first_published_at
        and free_public_until > first_published_at
        and free_private_until > free_public_until)
  );

-- A. Réglages
alter table public.memorial_access_settings
  drop constraint memorial_access_settings_v8_coherent;
update public.memorial_access_settings
   set free_publish_window = interval '168 hours',
       free_private_extension = interval '720 hours',
       free_correction_window = interval '168 hours',
       avis_gallery_rows_cap = 12,
       updated_at = now()
 where id;
alter table public.memorial_access_settings
  drop column free_window_cycle,
  drop column avis_snapshot_keys,
  alter column free_correction_window set not null,
  alter column avis_gallery_rows_cap set not null,
  add constraint memorial_access_settings_positive check (
    free_publish_window > interval '0'
    and free_draft_retention > interval '0'
    and free_correction_window > interval '0'
    and free_public_duration > interval '0'
    and free_private_extension > interval '0'
    and free_publication_quota_window > interval '0'
    and pending_media_window > interval '0'
    and free_publications_per_owner > 0
    and free_active_drafts_per_owner > 0
    and avis_gallery_limit > 0
    and avis_gallery_rows_cap >= avis_gallery_limit
  );

-- Privilèges (identiques à M1-A)
revoke all on function public.memorials_inherit_access_level_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_free_first_publication_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_free_gallery_quota_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_free_draft_gallery_v1() from public, anon, authenticated, service_role;
revoke all on function public.free_access_window_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.create_free_memorial_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.anchor_free_memorial_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_free_memorial_v1(uuid, text, text) to service_role;
grant execute on function public.anchor_free_memorial_v1(uuid, uuid) to service_role;
revoke execute on function public.record_symbolic_offering_v1(text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_symbolic_offering_v1(text, text, uuid) to service_role;
revoke all on function public_memorial_publication_state(uuid) from public;
grant execute on function public_memorial_publication_state(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
