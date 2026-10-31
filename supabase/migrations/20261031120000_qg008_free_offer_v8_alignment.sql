-- HERITAGE HOMMAGE — QG 008, Lot 1 : alignement V8 des droits gratuit / complet.
--
-- Autorité produit : Roadmap Maître V8.0 (§3, §4, §5, §6) et décision PO
-- QG 008 (une publication gratuite par adresse e-mail vérifiée sur 12 mois
-- glissants ; dérogation administrative tracée).
--
-- Additive : aucune migration existante n'est modifiée. Cette migration
-- s'applique APRÈS les trois migrations HERITAGE Direct M1-A
-- (20261024180000, 20261024190000, 20261024200000), dont elle corrige les
-- valeurs et comportements incompatibles avec la V8. Elle est réversible
-- par supabase/rollbacks/20261031120000_qg008_free_offer_v8_alignment.down.sql
-- tant qu'aucune dérogation n'a été accordée et qu'aucun avis gratuit n'a
-- été publié sous les nouvelles règles.
--
-- Ce que cette migration change :
--   A. Réglages : fenêtre de publication gratuite 10 j (240 h) ; récupération
--      7 j (168 h) après expiration ; fenêtre de correction retirée (L06 non
--      tranché) ; cycle d'ouverture de fenêtre distinct du quota (même
--      valeur, 12 mois) ; plafond de stockage galerie avis retiré (L09) ;
--      liste des rubriques publiables en avis, en DONNÉES.
--   B. Récupération du brouillon gratuit : échéance dérivée, 7 j après la
--      fin de préparation (45 j).
--   C. Dérogation administrative (une publication gratuite supplémentaire
--      pour une adresse) : table, octroi et révocation tracés, consommée
--      uniquement par une publication gratuite réussie.
--   D. Fenêtre et quota : création, ancrage et garde-fou de publication
--      réécrits autour d'une règle unique, dérogation comprise.
--   E. Galerie : la préparation n'est plus limitée ; la limite de 6 photos
--      s'applique à la copie PUBLIÉE d'un avis.
--   F. Copie publiée d'un avis : seules les rubriques autorisées, 6 photos
--      au plus, issues du brouillon.
--   G. commit_memorial_publication_v2 : publie la projection calculée par le
--      serveur, après relecture du niveau d'accès sous verrou.
--   H. Visibilité publique bornée : un avis n'est plus public après
--      free_public_until (45 j), sans tâche planifiée.
--   I. Messages : modération préalable par défaut ; condoléances seules en
--      avis ; contributions enrichies réservées au complet.
--
-- Rien ici n'expose de nouvelle surface à anon ou authenticated, hors la
-- fonction booléenne utilisée par la politique d'insertion des messages,
-- déjà fermée par l'absence de privilège de table.

-- ---------------------------------------------------------------------
-- A. Réglages
-- ---------------------------------------------------------------------
alter table public.memorial_access_settings
  add column free_window_cycle interval,
  add column avis_snapshot_keys text[],
  alter column free_correction_window drop not null,
  alter column avis_gallery_rows_cap drop not null;

alter table public.memorial_access_settings
  drop constraint memorial_access_settings_positive;

update public.memorial_access_settings
   set free_publish_window = interval '240 hours',
       free_private_extension = interval '168 hours',
       free_correction_window = null,
       avis_gallery_rows_cap = null,
       free_window_cycle = free_publication_quota_window,
       avis_snapshot_keys = array[
         'hero', 'deathNotice', 'ceremony', 'traditions',
         'personWords', 'lovedThings', 'legacy', 'gallery',
         'guidedFlow', 'presentation'
       ],
       updated_at = now()
 where id;

alter table public.memorial_access_settings
  alter column free_window_cycle set not null,
  alter column avis_snapshot_keys set not null,
  add constraint memorial_access_settings_v8_coherent check (
    free_publish_window > interval '0'
    and free_draft_retention > interval '0'
    and free_publish_window <= free_draft_retention
    and (free_correction_window is null or free_correction_window > interval '0')
    and free_public_duration > interval '0'
    and free_private_extension > interval '0'
    and free_publication_quota_window > interval '0'
    and free_window_cycle > interval '0'
    and pending_media_window > interval '0'
    and free_publications_per_owner > 0
    and free_active_drafts_per_owner > 0
    and avis_gallery_limit > 0
    and (avis_gallery_rows_cap is null or avis_gallery_rows_cap >= avis_gallery_limit)
    and cardinality(avis_snapshot_keys) > 0
  );

comment on table public.memorial_access_settings is
  'HERITAGE Direct M1-A, aligné V8 par QG 008. Une seule ligne. Durées réelles : publication gratuite 240 h (10 j) après l''ancre ; préparation 1080 h (45 j) après l''ancre ; visibilité 1080 h (45 j) après la première publication ; récupération 168 h (7 j) après chaque expiration. Quota : 1 publication gratuite par adresse sur 12 mois glissants. Lue par les triggers et fonctions ; ligne absente = refus. Modifiée uniquement par SQL relu.';
comment on column public.memorial_access_settings.free_private_extension is
  'QG 008. Période de récupération après expiration (V8 §4.3 : 7 jours), appliquée à la fin de visibilité d''un avis publié ET à la fin de préparation d''un brouillon gratuit. Ne porte aucune règle d''affichage ni de modification.';
comment on column public.memorial_access_settings.free_correction_window is
  'QG 008. NULL : aucune fenêtre de correction après publication n''est décidée (litige L06). Une valeur non NULL ne ferait que poser memorials.free_corrections_until, sans aucun contrôle associé.';
comment on column public.memorial_access_settings.free_window_cycle is
  'QG 008. Durée d''un cycle de fenêtre gratuite d''une adresse : une fois la fenêtre de 10 jours ouverte, elle ne se rouvre pas avant ce délai (un brouillon remplacé ne renouvelle pas les délais). Égale au quota (12 mois) ; séparée pour permettre un arbitrage PO ultérieur sans code.';
comment on column public.memorial_access_settings.avis_gallery_rows_cap is
  'QG 008. NULL : aucun plafond de stockage propre à l''avis (V8 §3.2 : la préparation n''est pas bloquée ; limites galerie complète = litige L09). Une valeur non NULL rétablit un plafond de lignes média galerie par brouillon avis.';
comment on column public.memorial_access_settings.avis_snapshot_keys is
  'QG 008. Rubriques (clés de premier niveau du contenu) qu''une copie publiée d''un avis peut contenir. Toute autre clé est refusée par la base. Miroir de lib/memorial/publication-policy.ts (AVIS_SNAPSHOT_KEYS). La liste éditoriale exacte de l''offre gratuite (L09) se décide ici, en données.';

-- ---------------------------------------------------------------------
-- B. Récupération du brouillon gratuit (dérivée)
-- ---------------------------------------------------------------------
alter table public.memorials add column free_draft_recovery_until timestamptz;

comment on column public.memorials.free_draft_recovery_until is
  'QG 008. Fin de la période de récupération d''un brouillon gratuit : free_draft_until + 7 jours (V8 §4.3). Dérivée par trigger à chaque pose ou déplacement de free_draft_until ; jamais écrite directement.';

alter table public.memorials disable trigger memorials_set_updated_at;
update public.memorials m
   set free_draft_recovery_until = m.free_draft_until + s.free_private_extension
  from public.memorial_access_settings s
 where s.id and m.free_draft_until is not null;
alter table public.memorials enable trigger memorials_set_updated_at;

alter table public.memorials
  add constraint memorials_free_draft_recovery_coherent check (
    (free_draft_until is null and free_draft_recovery_until is null)
    or (free_draft_until is not null and free_draft_recovery_until > free_draft_until)
  ),
  drop constraint memorials_free_publication_coherent,
  add constraint memorials_free_publication_coherent check (
    (free_corrections_until is null and free_public_until is null and free_private_until is null)
    or (first_published_at is not null
        and free_public_until is not null
        and free_private_until is not null
        and free_public_until > first_published_at
        and free_private_until > free_public_until
        and (free_corrections_until is null or free_corrections_until > first_published_at))
  );

create or replace function public.memorials_derive_free_recovery_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovery interval;
begin
  if new.free_draft_until is null then
    new.free_draft_recovery_until := null;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.free_draft_until is not distinct from old.free_draft_until
     and old.free_draft_recovery_until is not null then
    new.free_draft_recovery_until := old.free_draft_recovery_until;
    return new;
  end if;
  select s.free_private_extension into v_recovery from public.memorial_access_settings s where s.id;
  if v_recovery is null then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;
  new.free_draft_recovery_until := new.free_draft_until + v_recovery;
  return new;
end;
$$;

create trigger memorials_derive_free_recovery
before insert or update on public.memorials
for each row execute function public.memorials_derive_free_recovery_v1();

-- ---------------------------------------------------------------------
-- C. Dérogation administrative
-- ---------------------------------------------------------------------
create table public.free_publication_waivers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners (id) on delete restrict,
  granted_by_admin uuid not null,
  reference text not null,
  reason text not null,
  granted_at timestamptz not null default clock_timestamp(),
  window_opened_at timestamptz,
  consumed_at timestamptz,
  consumed_memorial_id uuid references public.memorials (id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_admin uuid,
  constraint free_publication_waivers_reference_format
    check (nullif(btrim(reference), '') is not null and char_length(reference) <= 200),
  constraint free_publication_waivers_reason_format
    check (nullif(btrim(reason), '') is not null and char_length(reason) <= 500),
  constraint free_publication_waivers_consumed_coherent
    check ((consumed_at is null) = (consumed_memorial_id is null)),
  constraint free_publication_waivers_revoked_coherent
    check ((revoked_at is null) = (revoked_by_admin is null)),
  constraint free_publication_waivers_single_outcome
    check (not (consumed_at is not null and revoked_at is not null))
);

create unique index free_publication_waivers_reference_key
  on public.free_publication_waivers (reference);
create unique index free_publication_waivers_one_active_per_owner
  on public.free_publication_waivers (owner_id)
  where consumed_at is null and revoked_at is null;

comment on table public.free_publication_waivers is
  'QG 008. Dérogation exceptionnelle accordée par l''administration HERITAGE : UNE publication gratuite supplémentaire pour une adresse vérifiée (propriétaire), au-delà du quota de 12 mois, avec une nouvelle fenêtre de 10 jours si celle de l''adresse est close. Une seule dérogation active par adresse. Consommée uniquement par une publication gratuite réussie ; révocable tant qu''elle n''est pas consommée. Écrite uniquement par les fonctions QG 008 ; aucun rôle applicatif n''y a accès. Octroi et révocation journalisés dans admin_audit_events.';
comment on column public.free_publication_waivers.reason is
  'Motif administratif court. Ne doit contenir ni contenu d''hommage, ni donnée de santé, ni coordonnées.';
comment on column public.free_publication_waivers.window_opened_at is
  'Instant où la dérogation a ouvert une nouvelle fenêtre de 10 jours (premier ancrage qui en a eu besoin). Une dérogation n''ouvre qu''une fenêtre.';

alter table public.free_publication_waivers enable row level security;
revoke all privileges on table public.free_publication_waivers from public, anon, authenticated, service_role;

alter table public.memorial_access_events
  drop constraint memorial_access_events_event_check;
alter table public.memorial_access_events
  add constraint memorial_access_events_event_check
  check (event in ('free.created', 'free.window_opened', 'free.anchored',
                   'free.first_published', 'free.waiver_used', 'access.upgraded'));

create or replace function public.grant_free_publication_waiver_v1(
  p_owner_id uuid,
  p_admin_auth_user_id uuid,
  p_reference text,
  p_reason text
)
returns table (outcome text, waiver_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.free_publication_waivers%rowtype;
  v_id uuid;
begin
  if p_owner_id is null or p_admin_auth_user_id is null
     or nullif(btrim(p_reference), '') is null or char_length(p_reference) > 200
     or nullif(btrim(p_reason), '') is null or char_length(p_reason) > 500 then
    raise exception 'invalid free publication waiver request' using errcode = '22023';
  end if;
  perform 1 from public.owners o where o.id = p_owner_id for update;
  if not found then
    return query select 'refused'::text, null::uuid;
    return;
  end if;
  select * into v_existing from public.free_publication_waivers w where w.reference = p_reference;
  if found then
    if v_existing.owner_id = p_owner_id then
      return query select 'already_granted'::text, v_existing.id;
    else
      return query select 'reference_conflict'::text, null::uuid;
    end if;
    return;
  end if;
  if exists (
    select 1 from public.free_publication_waivers w
     where w.owner_id = p_owner_id and w.consumed_at is null and w.revoked_at is null
  ) then
    return query select 'active_waiver_exists'::text, null::uuid;
    return;
  end if;
  insert into public.free_publication_waivers (owner_id, granted_by_admin, reference, reason)
  values (p_owner_id, p_admin_auth_user_id, p_reference, btrim(p_reason))
  returning id into v_id;
  insert into public.admin_audit_events (admin_auth_user_id, action, target_type, target_id, context)
  values (p_admin_auth_user_id, 'free_publication_waiver.granted', 'owner', p_owner_id,
          jsonb_build_object('waiver_id', v_id));
  return query select 'granted'::text, v_id;
end;
$$;

create or replace function public.revoke_free_publication_waiver_v1(
  p_waiver_id uuid,
  p_admin_auth_user_id uuid
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_waiver public.free_publication_waivers%rowtype;
begin
  if p_waiver_id is null or p_admin_auth_user_id is null then
    raise exception 'invalid free publication waiver request' using errcode = '22023';
  end if;
  select w.owner_id into v_waiver.owner_id from public.free_publication_waivers w where w.id = p_waiver_id;
  if not found then
    return query select 'not_found'::text;
    return;
  end if;
  -- Même ordre de verrous que l'ancrage et la publication : propriétaire, puis dérogation.
  perform 1 from public.owners o where o.id = v_waiver.owner_id for update;
  select * into v_waiver from public.free_publication_waivers w where w.id = p_waiver_id for update;
  if v_waiver.revoked_at is not null then
    return query select 'already_revoked'::text;
    return;
  end if;
  if v_waiver.consumed_at is not null then
    return query select 'already_consumed'::text;
    return;
  end if;
  update public.free_publication_waivers
     set revoked_at = clock_timestamp(), revoked_by_admin = p_admin_auth_user_id
   where id = p_waiver_id;
  insert into public.admin_audit_events (admin_auth_user_id, action, target_type, target_id, context)
  values (p_admin_auth_user_id, 'free_publication_waiver.revoked', 'owner', v_waiver.owner_id,
          jsonb_build_object('waiver_id', p_waiver_id, 'had_opened_window', v_waiver.window_opened_at is not null));
  return query select 'revoked'::text;
end;
$$;

-- ---------------------------------------------------------------------
-- D. Fenêtre gratuite d'une adresse, quota et dérogation
-- ---------------------------------------------------------------------
-- D1. Même signature que le correctif 1 : l'ouverture de fenêtre se lit
-- sur le cycle (free_window_cycle), les publications sur le quota.
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
        and ev.created_at > p_now - s.free_window_cycle),
    (select count(*)::integer
       from public.memorial_access_events ev
      where ev.owner_id = p_owner_id
        and ev.event = 'free.first_published'
        and ev.created_at > p_now - s.free_publication_quota_window)
  from public.memorial_access_settings s
  where s.id;
$$;

-- D2. La règle unique : l'adresse peut-elle encore publier gratuitement,
-- et sur quelle ancre ? À appeler sous le verrou du propriétaire.
--   open_new        aucune fenêtre dans le cycle, quota libre : ancre = maintenant
--   inherit         fenêtre du cycle encore ouverte, quota libre : ancre héritée
--   waiver_new      dérogation active, pas encore de fenêtre : ancre = maintenant
--   waiver_inherit  fenêtre ouverte par la dérogation, encore ouverte
--   unavailable     rien de tout cela
create or replace function public.free_window_status_v1(p_owner_id uuid, p_now timestamptz)
returns table (outcome text, anchor_at timestamptz, waiver_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.memorial_access_settings%rowtype;
  v_window_opened_at timestamptz;
  v_publications integer;
  v_waiver public.free_publication_waivers%rowtype;
begin
  select * into v_settings from public.memorial_access_settings where id;
  if not found then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;
  select w.window_opened_at, w.publications into v_window_opened_at, v_publications
    from public.free_access_window_v1(p_owner_id, p_now) w;
  if v_publications < v_settings.free_publications_per_owner then
    if v_window_opened_at is null then
      return query select 'open_new'::text, p_now, null::uuid;
      return;
    end if;
    if p_now < v_window_opened_at + v_settings.free_publish_window then
      return query select 'inherit'::text, v_window_opened_at, null::uuid;
      return;
    end if;
  end if;
  select * into v_waiver
    from public.free_publication_waivers w
   where w.owner_id = p_owner_id and w.consumed_at is null and w.revoked_at is null;
  if not found then
    return query select 'unavailable'::text, null::timestamptz, null::uuid;
    return;
  end if;
  if v_waiver.window_opened_at is null then
    return query select 'waiver_new'::text, p_now, v_waiver.id;
    return;
  end if;
  if p_now < v_waiver.window_opened_at + v_settings.free_publish_window then
    return query select 'waiver_inherit'::text, v_waiver.window_opened_at, v_waiver.id;
    return;
  end if;
  return query select 'unavailable'::text, null::timestamptz, null::uuid;
end;
$$;

-- D3. Création d'un brouillon gratuit. Même contrat que M1-A
-- (created | free_draft_limit | free_unavailable | refused) ; la
-- disponibilité vient désormais de free_window_status_v1 (dérogation
-- comprise). Créer un brouillon ne consomme rien et n'ouvre aucune fenêtre.
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
  v_status text;
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
  select s.outcome into v_status from public.free_window_status_v1(p_owner_id, v_now) s;
  if v_status = 'unavailable' then
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

-- D4. Ancrage (premier enregistrement durable après vérification de
-- l'adresse). L'ancre est celle de l'ADRESSE (correctif 1) ou, si
-- l'adresse n'a plus de fenêtre, celle de sa dérogation active. Un
-- brouillon remplacé hérite toujours de l'ancre existante : aucun délai
-- n'est renouvelé. Idempotente.
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
  v_status text;
  v_anchor timestamptz;
  v_waiver uuid;
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
  -- Verrous : mémorial, propriétaire, puis dérogation.
  perform 1 from public.owners o where o.id = p_owner_id for update;
  select s.outcome, s.anchor_at, s.waiver_id into v_status, v_anchor, v_waiver
    from public.free_window_status_v1(p_owner_id, v_now) s;
  if v_status = 'unavailable' then
    return query select 'free_unavailable'::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_status in ('open_new', 'waiver_new') then
    insert into public.memorial_access_events (memorial_id, owner_id, event, from_level, to_level, created_at)
    values (p_memorial_id, p_owner_id, 'free.window_opened', 'avis', 'avis', v_now);
  end if;
  if v_status = 'waiver_new' then
    update public.free_publication_waivers
       set window_opened_at = v_anchor
     where id = v_waiver and window_opened_at is null and consumed_at is null and revoked_at is null;
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

-- D5. Garde-fou de la première publication gratuite. Le quota n'est
-- consommé (événement free.first_published) que dans la transaction d'une
-- publication réussie : un refus, un brouillon abandonné ou remplacé ne
-- consomment rien. Au-delà du quota, seule une dérogation active permet
-- de publier ; elle est alors consommée dans la même transaction. Une
-- dérogation qui a ouvert la fenêtre de ce brouillon est aussi consommée.
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
  v_waiver public.free_publication_waivers%rowtype;
  v_use_waiver boolean := false;
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
  -- Ordre des verrous : mémorial (déjà tenu), propriétaire, dérogation.
  perform 1 from public.owners o where o.id = new.owner_id for update;
  select count(*) into v_previous
    from public.memorial_access_events ev
   where ev.owner_id = new.owner_id
     and ev.event = 'free.first_published'
     and ev.created_at > v_now - v_settings.free_publication_quota_window;
  select * into v_waiver
    from public.free_publication_waivers w
   where w.owner_id = new.owner_id and w.consumed_at is null and w.revoked_at is null
   for update;
  if v_previous >= v_settings.free_publications_per_owner then
    if v_waiver.id is null then
      raise exception 'free publication quota reached' using errcode = 'HD403';
    end if;
    v_use_waiver := true;
  elsif v_waiver.id is not null
        and v_waiver.window_opened_at is not null
        and v_waiver.window_opened_at = new.free_anchor_at then
    v_use_waiver := true;
  end if;
  new.free_corrections_until := case
    when v_settings.free_correction_window is null then null
    else new.first_published_at + v_settings.free_correction_window
  end;
  new.free_public_until := new.first_published_at + v_settings.free_public_duration;
  new.free_private_until := new.free_public_until + v_settings.free_private_extension;
  insert into public.memorial_access_events (memorial_id, owner_id, event, from_level, to_level, created_at)
  values (new.id, new.owner_id, 'free.first_published', 'avis', 'avis', v_now);
  if v_use_waiver then
    update public.free_publication_waivers
       set consumed_at = v_now, consumed_memorial_id = new.id
     where id = v_waiver.id;
    insert into public.memorial_access_events
      (memorial_id, owner_id, event, from_level, to_level, source, external_reference, created_at)
    values
      (new.id, new.owner_id, 'free.waiver_used', 'avis', 'avis', 'admin_waiver', v_waiver.id::text, v_now);
  end if;
  return new;
end;
$$;

-- D6. Le niveau hérité à l'insertion remet aussi l'échéance de
-- récupération à zéro (aucune échéance ne peut être fournie à l'insertion).
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
  new.free_draft_recovery_until := null;
  new.free_corrections_until := null;
  new.free_public_until := null;
  new.free_private_until := null;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- E. Galerie : la préparation n'est plus limitée en avis
-- ---------------------------------------------------------------------
-- Le brouillon d'un avis peut préparer plus de 6 photos (V8 §3.2) ; la
-- limite s'applique à la copie publiée (section F). Le trigger d'envoi
-- ne garde qu'un plafond de stockage OPTIONNEL (avis_gallery_rows_cap,
-- NULL par défaut) pour qu'un arbitrage de coût (L09, QG 017) puisse
-- être posé en données.
drop trigger memorial_drafts_guard_free_gallery on public.memorial_drafts;
drop function public.guard_free_draft_gallery_v1();

create or replace function public.guard_free_gallery_quota_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  v_cap integer;
  v_rows integer;
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
  if not exists (select 1 from public.memorial_access_settings s where s.id) then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;
  select s.avis_gallery_rows_cap into v_cap from public.memorial_access_settings s where s.id;
  if v_cap is null then
    return new;
  end if;
  select count(*) into v_rows
    from public.media md
   where md.memorial_id = new.memorial_id
     and md.purpose = 'gallery';
  if v_rows >= v_cap then
    raise exception 'free gallery storage cap reached' using errcode = 'HD413';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- F. Copie publiée d'un avis
-- ---------------------------------------------------------------------
-- Quel que soit le chemin d'écriture (v1, v2, SQL de service), la copie
-- publiée d'un mémorial avis ne contient que les rubriques autorisées et
-- au plus 6 photos de galerie. Le contenu premium préparé reste dans le
-- brouillon privé.
create or replace function public.guard_avis_published_snapshot_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  v_settings public.memorial_access_settings%rowtype;
  v_key text;
  v_gallery jsonb;
  v_items jsonb;
begin
  select m.access_level into v_level from public.memorials m where m.id = new.memorial_id;
  if v_level is distinct from 'avis' then
    return new;
  end if;
  select * into v_settings from public.memorial_access_settings where id;
  if not found then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;
  if jsonb_typeof(new.content) is distinct from 'object' then
    raise exception 'free publication content refused' using errcode = 'HD403';
  end if;
  for v_key in select jsonb_object_keys(new.content) loop
    if not (v_key = any (v_settings.avis_snapshot_keys)) then
      raise exception 'free publication cannot include %', v_key using errcode = 'HD403';
    end if;
  end loop;
  if new.content ? 'gallery' then
    v_gallery := new.content -> 'gallery';
    v_items := v_gallery -> 'items';
    if jsonb_typeof(v_gallery) is distinct from 'object'
       or jsonb_typeof(v_items) is distinct from 'array' then
      raise exception 'free publication gallery malformed' using errcode = 'HD403';
    end if;
    if jsonb_array_length(v_items) > v_settings.avis_gallery_limit then
      raise exception 'free gallery limit reached' using errcode = 'HD413';
    end if;
  end if;
  return new;
end;
$$;

create trigger memorial_published_snapshots_guard_avis
before insert or update of content on public.memorial_published_snapshots
for each row execute function public.guard_avis_published_snapshot_v1();

-- ---------------------------------------------------------------------
-- G. commit_memorial_publication_v2 — publication de la projection
-- ---------------------------------------------------------------------
-- Identique à v1 (verrous, CAS propriétaire / cycle de vie / configuration
-- / contenu du brouillon, blocage des retraits Hero en cours), plus :
--   * le niveau d'accès est relu sous le verrou du mémorial et doit être
--     celui pour lequel le serveur a calculé la projection ;
--   * la copie publiée est p_published_content (projection), jamais le
--     brouillon brut ;
--   * chaque photo de galerie publiée doit provenir de la galerie du
--     brouillon verrouillé.
create or replace function public.commit_memorial_publication_v2(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_expected_revision bigint,
  p_expected_status text,
  p_expected_first_published_at timestamptz,
  p_expected_language text,
  p_expected_skin text,
  p_expected_skin_variant text,
  p_expected_slug text,
  p_expected_access_level text,
  p_expected_content jsonb,
  p_published_content jsonb
)
returns table (published_at timestamptz, first_published_at timestamptz, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_content jsonb;
  v_revision bigint;
  v_now timestamptz := clock_timestamp();
  v_first_published_at timestamptz;
  v_published_ids text[];
  v_draft_ids text[];
begin
  if p_expected_revision is null
     or p_expected_language is null
     or p_expected_skin is null
     or p_expected_skin_variant is null
     or nullif(btrim(p_expected_slug), '') is null
     or p_expected_access_level is null
     or p_expected_access_level not in ('avis', 'complet')
     or p_expected_content is null
     or p_published_content is null
     or jsonb_typeof(p_published_content) is distinct from 'object' then
    raise exception 'invalid memorial publication request' using errcode = '22023';
  end if;
  select * into v_memorial
    from public.memorials
   where id = p_memorial_id
   for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'memorial publication refused' using errcode = '42501';
  end if;
  if v_memorial.status is distinct from p_expected_status
     or v_memorial.first_published_at is distinct from p_expected_first_published_at then
    raise exception 'memorial lifecycle changed' using errcode = '40001';
  end if;
  if v_memorial.access_level is distinct from p_expected_access_level then
    raise exception 'memorial access level changed' using errcode = '40001';
  end if;
  if v_memorial.language is distinct from p_expected_language
     or v_memorial.skin_id is distinct from p_expected_skin
     or v_memorial.skin_variant is distinct from p_expected_skin_variant
     or v_memorial.slug is distinct from p_expected_slug then
    raise exception 'memorial publication configuration changed' using errcode = '40001';
  end if;
  if not (
    (v_memorial.status = 'ready' and v_memorial.first_published_at is null)
    or (v_memorial.status = 'editing' and v_memorial.first_published_at is not null)
  ) then
    raise exception 'memorial publication transition refused' using errcode = '23514';
  end if;
  if v_memorial.language is null or nullif(btrim(v_memorial.slug), '') is null then
    raise exception 'memorial publication data incomplete' using errcode = '23514';
  end if;
  select d.content, d.revision into v_content, v_revision
    from public.memorial_drafts as d
   where d.memorial_id = p_memorial_id
   for update;
  if not found
     or v_revision is distinct from p_expected_revision
     or v_content is distinct from p_expected_content then
    raise exception 'memorial draft changed' using errcode = '40001';
  end if;
  if exists (
    select 1
      from public.hero_media_retirement_leases
     where memorial_id = p_memorial_id
       and completed_at is null
       and cancelled_at is null
  ) then
    raise exception 'hero media retirement in progress' using errcode = '40001';
  end if;
  if p_published_content ? 'gallery' then
    if jsonb_typeof(p_published_content #> '{gallery,items}') is distinct from 'array' then
      raise exception 'published gallery malformed' using errcode = '23514';
    end if;
    select coalesce(array_agg(i ->> 'mediaId'), array[]::text[]) into v_published_ids
      from jsonb_array_elements(p_published_content #> '{gallery,items}') i;
    select coalesce(array_agg(i ->> 'mediaId'), array[]::text[]) into v_draft_ids
      from jsonb_array_elements(
        case when jsonb_typeof(v_content #> '{gallery,items}') = 'array'
             then v_content #> '{gallery,items}' else '[]'::jsonb end
      ) i;
    if exists (select 1 from unnest(v_published_ids) p where p is null or not (p = any (v_draft_ids))) then
      raise exception 'published gallery must come from the draft' using errcode = '23514';
    end if;
  end if;
  insert into public.memorial_published_snapshots (memorial_id, content, published_at)
  values (p_memorial_id, p_published_content, v_now)
  on conflict (memorial_id) do update
    set content = excluded.content,
        published_at = excluded.published_at;
  v_first_published_at := coalesce(v_memorial.first_published_at, v_now);
  update public.memorials
     set status = 'published',
         first_published_at = v_first_published_at
   where id = p_memorial_id;
  return query select v_now, v_first_published_at, v_revision;
end;
$$;

comment on function public.commit_memorial_publication_v2(uuid, uuid, bigint, text, timestamptz, text, text, text, text, text, jsonb, jsonb) is
  'QG 008. Transaction de publication : mêmes verrous et CAS que v1, plus relecture du niveau d''accès sous verrou ; la copie publiée est la projection calculée côté serveur (lib/memorial/publication-policy.ts), jamais le brouillon brut ; les photos publiées proviennent du brouillon. Les garde-fous de premier niveau gratuit (fenêtre, quota, dérogation) et de copie avis (rubriques, 6 photos) s''appliquent par triggers. service_role seul.';

-- ---------------------------------------------------------------------
-- H. Visibilité publique bornée dans le temps
-- ---------------------------------------------------------------------
-- Un avis publié n'est public que jusqu'à free_public_until (première
-- publication + 45 j). Un complet n'est pas borné ici : sa durée de cinq
-- ans reste à définir (L05). Interne : appelée par des fonctions SECURITY
-- DEFINER uniquement.
create or replace function public.memorial_publicly_visible_v1(p_memorial_id uuid, p_now timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select m.status = 'published'
           and (m.access_level = 'complet'
                or (m.access_level = 'avis'
                    and m.free_public_until is not null
                    and p_now < m.free_public_until))
      from public.memorials m
     where m.id = p_memorial_id
  ), false);
$$;

-- Même signature, mêmes privilèges (anon, authenticated) : ce sont les
-- politiques publiques des copies publiées et des messages qui s'en
-- servent. Un avis expiré ne renvoie plus de ligne : ni lecture publique
-- de sa copie, ni message.
create or replace function public.public_memorial_publication_state(p_memorial_id uuid)
returns table (status text, enabled_sections text[])
language sql
security definer
set search_path = public
stable
as $$
  select m.status, m.enabled_sections
    from public.memorials m
   where m.id = p_memorial_id
     and (m.status <> 'published' or public.memorial_publicly_visible_v1(m.id, now()));
$$;

-- H2. Offrandes : mêmes règles que C1, plus la visibilité publique bornée.
-- Le corps est celui de 20261023160000_symbolic_offerings_v1.sql, à une
-- condition près (memorial_publicly_visible_v1). Les gestes restent
-- ouverts aux deux niveaux (V8 §6) : aucune condition de niveau ici ;
-- l'ouverture effective par mémorial reste symbolic_offering_eligibility
-- (QG 012).
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
  if v_memorial_id is null or v_status is distinct from 'published' or v_skin is distinct from 'intemporel'
     or not public.memorial_publicly_visible_v1(v_memorial_id, v_now) then
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


-- ---------------------------------------------------------------------
-- I. Messages : droits par offre et modération préalable
-- ---------------------------------------------------------------------
-- La table reste fermée (aucun privilège de table pour anon /
-- authenticated) : rien de ceci n'ouvre les contributions, qui relèvent de
-- QG 013 / QG 014. Ce sont les règles de droit que ces missions trouveront
-- en place :
--   * aucun message n'est visible avant approbation (V8 §5.4) ;
--   * condoléances courtes : avis et complet, si la famille a activé la
--     rubrique ;
--   * contributions enrichies (testimonial, memory_message) : complet
--     seulement, si la famille a activé la rubrique ;
--   * jamais sur un hommage qui n'est plus public.
-- La longueur maximale d'une condoléance « courte » n'est pas décidée :
-- aucune limite n'est inventée ici.
alter table public.messages alter column visible set default false;

create or replace function public.public_memorial_message_allowed_v1(p_memorial_id uuid, p_message_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.memorial_publicly_visible_v1(m.id, now())
           and case p_message_type
                 when 'condolence' then 'condolences' = any (m.enabled_sections)
                 when 'testimonial' then m.access_level = 'complet' and 'testimonials' = any (m.enabled_sections)
                 when 'memory_message' then m.access_level = 'complet' and 'memoryMessage' = any (m.enabled_sections)
                 else false
               end
      from public.memorials m
     where m.id = p_memorial_id
  ), false);
$$;

drop policy messages_insert_public on public.messages;
create policy messages_insert_public on public.messages
  for insert
  to anon, authenticated
  with check (
    visible = false
    and public.public_memorial_message_allowed_v1(memorial_id, message_type)
  );

-- ---------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------
revoke all on function public.memorials_derive_free_recovery_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_avis_published_snapshot_v1() from public, anon, authenticated, service_role;
revoke all on function public.free_window_status_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.memorial_publicly_visible_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
-- create or replace conserve les privilèges ; réaffirmés ici.
revoke all on function public.free_access_window_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.guard_free_first_publication_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_free_gallery_quota_v1() from public, anon, authenticated, service_role;
revoke all on function public.memorials_inherit_access_level_v1() from public, anon, authenticated, service_role;
revoke all on function public.create_free_memorial_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.anchor_free_memorial_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.grant_free_publication_waiver_v1(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_free_publication_waiver_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.commit_memorial_publication_v2(uuid, uuid, bigint, text, timestamptz, text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.public_memorial_message_allowed_v1(uuid, text) from public;
revoke execute on function public.record_symbolic_offering_v1(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_free_memorial_v1(uuid, text, text) to service_role;
grant execute on function public.anchor_free_memorial_v1(uuid, uuid) to service_role;
grant execute on function public.grant_free_publication_waiver_v1(uuid, uuid, text, text) to service_role;
grant execute on function public.revoke_free_publication_waiver_v1(uuid, uuid) to service_role;
grant execute on function public.commit_memorial_publication_v2(uuid, uuid, bigint, text, timestamptz, text, text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.record_symbolic_offering_v1(text, text, uuid) to service_role;
-- Comme public_memorial_publication_state : évaluée par la politique
-- d'insertion publique des messages, dans le rôle du visiteur.
grant execute on function public.public_memorial_message_allowed_v1(uuid, text) to anon, authenticated;

comment on function public.free_window_status_v1(uuid, timestamptz) is
  'QG 008. Règle unique de disponibilité gratuite d''une adresse : fenêtre du cycle, quota de 12 mois glissants, dérogation active. À appeler sous le verrou du propriétaire. Interne : exécutable par aucun rôle.';
comment on function public.create_free_memorial_v1(uuid, text, text) is
  'HERITAGE Direct M1-A, aligné V8 (QG 008). Crée un brouillon gratuit (droit direct « avis » + redeem_entitlement, une transaction). « free_draft_limit » si un brouillon gratuit est actif ; « free_unavailable » si l''adresse ne peut plus publier gratuitement (fenêtre close ou quota consommé, sans dérogation active). Ne consomme rien. service_role seul.';
comment on function public.anchor_free_memorial_v1(uuid, uuid) is
  'HERITAGE Direct M1-A, aligné V8 (QG 008). Premier enregistrement durable après vérification : ancre le brouillon sur la fenêtre de son ADRESSE (ou de sa dérogation active) ; +10 j publication gratuite, +45 j préparation, +52 j récupération. Un brouillon remplacé hérite de l''ancre : aucun délai renouvelé. Idempotente. service_role seul.';
comment on function public.grant_free_publication_waiver_v1(uuid, uuid, text, text) is
  'QG 008. Accorde une dérogation (une publication gratuite supplémentaire) à une adresse. Idempotente sur la référence ; une seule dérogation active par adresse ; journalisée dans admin_audit_events. L''identité administrateur est vérifiée par le serveur appelant. service_role seul ; aucun écran ne l''appelle encore.';
comment on function public.revoke_free_publication_waiver_v1(uuid, uuid) is
  'QG 008. Révoque une dérogation non consommée ; journalisée dans admin_audit_events. service_role seul.';
comment on function public.memorial_publicly_visible_v1(uuid, timestamptz) is
  'QG 008. Un mémorial est public s''il est publié et, pour un avis, avant free_public_until (45 j). Interne.';
comment on function public.public_memorial_message_allowed_v1(uuid, text) is
  'QG 008. Droit de déposer un message : hommage public, rubrique activée par la famille, contributions enrichies réservées au complet. Exécutée par la politique messages_insert_public.';

notify pgrst, 'reload schema';
