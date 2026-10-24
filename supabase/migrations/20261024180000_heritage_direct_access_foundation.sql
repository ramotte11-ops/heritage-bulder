-- HERITAGE Direct — M1-A : fondations du modèle gratuit / complet.
--
-- Contrat de référence : « Offre gratuite / complète — contrat produit et
-- dossier UX V2.1 », arbitrages PO B1, B6 et B14 inclus.
--
-- Additive. Aucune fonction existante n'est remplacée : la publication
-- (commit_memorial_publication_v1), l'échange des droits
-- (redeem_entitlement*) et les fonctions médias restent strictement
-- inchangés. Les nouvelles règles s'appliquent par triggers et par trois
-- fonctions service_role.
--
-- Ce que cette migration pose :
--   A. memorial_access_settings — durées et quotas, en DONNÉES (une ligne)
--   B. entitlements.access_level — le niveau accordé par le droit, toujours
--      explicite (D12) ; les droits existants sont repris en « complet »
--   C. colonnes d'accès sur memorials — niveau du mémorial et échéances
--      gratuites, écrites uniquement par le serveur
--   D. memorial_access_events — journal en ajout seul
--   E. triggers : niveau hérité du droit à la création, garde-fou de la
--      première publication gratuite, quota de 6 photos (médias et brouillon)
--   F. fonctions service_role : créer un brouillon gratuit, l'ancrer à la
--      confirmation de l'e-mail, passer au complet
--
-- Échéances (B14) : durées réelles (7 j = 168 h, 45 j = 1080 h, 30 j =
-- 720 h), calculées depuis l'événement, jamais arrondies. L'affichage en
-- heure de Paris relève de l'application.
--
-- Transition D12 : entitlements.access_level reste NULLABLE dans cette
-- migration, le temps que le code qui le fournit explicitement soit
-- déployé ; une migration ultérieure (M1-B) posera NOT NULL après
-- contrôle. Pendant cette fenêtre, un droit sans niveau ne peut créer
-- AUCUN mémorial : le trigger de la section E refuse la création.

-- ---------------------------------------------------------------------
-- A. memorial_access_settings
-- ---------------------------------------------------------------------

create table public.memorial_access_settings (
  id boolean primary key default true check (id),
  free_publish_window interval not null,
  free_draft_retention interval not null,
  free_correction_window interval not null,
  free_public_duration interval not null,
  free_private_extension interval not null,
  free_publication_quota_window interval not null,
  free_publications_per_owner integer not null,
  free_active_drafts_per_owner integer not null,
  avis_gallery_limit integer not null,
  avis_gallery_rows_cap integer not null,
  pending_media_window interval not null,
  updated_at timestamptz not null default now(),

  constraint memorial_access_settings_positive check (
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
  )
);

insert into public.memorial_access_settings (
  free_publish_window, free_draft_retention, free_correction_window,
  free_public_duration, free_private_extension,
  free_publication_quota_window, free_publications_per_owner, free_active_drafts_per_owner,
  avis_gallery_limit, avis_gallery_rows_cap, pending_media_window
) values (
  interval '168 hours', interval '1080 hours', interval '168 hours',
  interval '1080 hours', interval '720 hours',
  interval '12 months', 1, 1,
  6, 12, interval '3 hours'
);

comment on table public.memorial_access_settings is
  'HERITAGE Direct M1-A. Une seule ligne : durées de l''offre gratuite (réelles, en heures) et quotas (B6 : 1 publication gratuite par propriétaire sur 12 mois, 1 brouillon gratuit actif ; 6 photos de galerie en avis). Lue par les triggers et fonctions M1-A ; ligne absente = refus. Modifiée uniquement par SQL relu.';

alter table public.memorial_access_settings enable row level security;
revoke all privileges on table public.memorial_access_settings from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- B. entitlements.access_level
-- ---------------------------------------------------------------------

alter table public.entitlements add column access_level text;

-- Reprise explicite : avant HERITAGE Direct, tout droit est un droit
-- payant (Etsy, clé d'activation, provisionnement support). updated_at est
-- volontairement préservé : la reprise n'est pas une modification du droit.
alter table public.entitlements disable trigger entitlements_set_updated_at;
update public.entitlements set access_level = 'complet' where access_level is null;
alter table public.entitlements enable trigger entitlements_set_updated_at;

alter table public.entitlements
  add constraint entitlements_access_level_check
    check (access_level in ('avis', 'complet')),
  add constraint entitlements_etsy_is_complete
    check (source <> 'etsy' or access_level = 'complet'),
  add constraint entitlements_avis_is_direct_and_keyless
    check (access_level is distinct from 'avis'
           or (source = 'direct' and external_order_id is null and activation_key_hash is null));

comment on column public.entitlements.access_level is
  'HERITAGE Direct M1-A. Niveau accordé par ce droit : avis (gratuit, direct, sans clé ni commande) ou complet. Toujours fourni explicitement (D12) ; jamais de valeur par défaut. NULL seulement pendant la transition M1-A → M1-B, et alors aucun mémorial ne peut être créé depuis ce droit.';

-- ---------------------------------------------------------------------
-- C. Colonnes d'accès sur memorials
-- ---------------------------------------------------------------------

alter table public.memorials
  add column access_level text,
  add column access_level_changed_at timestamptz,
  add column free_anchor_at timestamptz,
  add column free_publish_until timestamptz,
  add column free_draft_until timestamptz,
  add column free_corrections_until timestamptz,
  add column free_public_until timestamptz,
  add column free_private_until timestamptz;

alter table public.memorials disable trigger memorials_set_updated_at;
update public.memorials m
   set access_level = e.access_level
  from public.entitlements e
 where e.id = m.entitlement_id
   and m.access_level is null;
alter table public.memorials enable trigger memorials_set_updated_at;

alter table public.memorials
  alter column access_level set not null,
  add constraint memorials_access_level_check
    check (access_level in ('avis', 'complet')),
  add constraint memorials_free_anchor_coherent check (
    (free_anchor_at is null and free_publish_until is null and free_draft_until is null)
    or (free_anchor_at is not null
        and free_publish_until > free_anchor_at
        and free_draft_until > free_anchor_at)
  ),
  add constraint memorials_free_publication_coherent check (
    (free_corrections_until is null and free_public_until is null and free_private_until is null)
    or (first_published_at is not null
        and free_corrections_until > first_published_at
        and free_public_until > first_published_at
        and free_private_until > free_public_until)
  );

comment on column public.memorials.access_level is
  'HERITAGE Direct M1-A. Niveau effectif du mémorial (avis | complet). Hérité du droit à la création (trigger), puis modifiable uniquement par upgrade_memorial_access_v1(). Aucun rôle client ne peut l''écrire.';
comment on column public.memorials.free_anchor_at is
  'HERITAGE Direct M1-A (B1). Première confirmation effective de l''e-mail pour ce brouillon gratuit, enregistrée une seule fois par anchor_free_memorial_v1(). Point de départ des délais de 7 jours (publication gratuite) et de 45 jours (conservation du brouillon).';
comment on column public.memorials.free_public_until is
  'HERITAGE Direct M1-A. Fin de la consultation publique d''un avis gratuit : première publication + 45 jours réels. Posée par le trigger de première publication ; jamais réinitialisée.';

-- ---------------------------------------------------------------------
-- D. memorial_access_events — journal en ajout seul
-- ---------------------------------------------------------------------

create table public.memorial_access_events (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials (id) on delete restrict,
  owner_id uuid not null references public.owners (id) on delete restrict,
  event text not null check (event in ('free.created', 'free.anchored', 'free.first_published', 'access.upgraded')),
  from_level text check (from_level in ('avis', 'complet')),
  to_level text not null check (to_level in ('avis', 'complet')),
  source text,
  external_reference text,
  created_at timestamptz not null default clock_timestamp(),

  constraint memorial_access_events_upgrade_traced check (
    event <> 'access.upgraded'
    or (source is not null and nullif(btrim(external_reference), '') is not null)
  )
);

create unique index memorial_access_events_reference_key
  on public.memorial_access_events (source, external_reference)
  where external_reference is not null;
create index memorial_access_events_owner_event_idx
  on public.memorial_access_events (owner_id, event, created_at desc);
create index memorial_access_events_memorial_idx
  on public.memorial_access_events (memorial_id, created_at desc);

comment on table public.memorial_access_events is
  'HERITAGE Direct M1-A. Journal en ajout seul des événements d''accès : création d''un brouillon gratuit, ancrage, première publication gratuite (base du quota B6), passage au complet (référence externe unique : un paiement ne sert qu''une fois). Aucune donnée personnelle. Écrit uniquement par les fonctions M1-A ; aucun rôle applicatif n''y a accès.';

alter table public.memorial_access_events enable row level security;
revoke all privileges on table public.memorial_access_events from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- E. Triggers
-- ---------------------------------------------------------------------

-- E1. Le niveau d'un mémorial est celui de son droit, jamais une valeur
-- fournie ou supposée. Les échéances gratuites ne peuvent pas être
-- posées à l'insertion.
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

create trigger memorials_inherit_access_level
before insert on public.memorials
for each row execute function public.memorials_inherit_access_level_v1();

-- E2. Première publication gratuite : e-mail confirmé (ancre), délai de
-- 7 jours, quota B6, puis échéances posées dans la même transaction. Le
-- trigger ne fait rien pour un mémorial complet ni pour une republication.
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

create trigger memorials_guard_free_first_publication
before update of status, first_published_at on public.memorials
for each row execute function public.guard_free_first_publication_v1();

-- E3. Quota de photos de galerie en avis, sur TOUT chemin d'insertion.
-- Compte les photos prêtes du mémorial (sauf celles que seule la copie
-- publiée retient encore) et les envois en cours non expirés, sous le
-- verrou du mémorial : deux envois simultanés ne peuvent pas obtenir la
-- dernière place ensemble.
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

create trigger media_guard_free_gallery_quota
before insert on public.media
for each row execute function public.guard_free_gallery_quota_v1();

-- E4. Le brouillon d'un avis ne peut pas référencer plus de 6 photos de
-- galerie, quel que soit le chemin d'écriture.
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

-- ---------------------------------------------------------------------
-- F. Fonctions service_role
-- ---------------------------------------------------------------------

-- F1. Crée un brouillon gratuit pour un propriétaire déjà résolu côté
-- serveur : droit direct « avis » puis échange par redeem_entitlement
-- (inchangée), dans une seule transaction. B6 : un seul brouillon gratuit
-- actif à la fois. Les refus sont RENVOYÉS ; seul un appel malformé lève.
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

-- F2. Ancre le brouillon gratuit à la première confirmation effective de
-- l'e-mail (B1). Appelée par le serveur après vérification ; l'heure est
-- celle de la base. Idempotente : un second appel ne déplace jamais les
-- échéances.
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

  update public.memorials
     set free_anchor_at = v_now,
         free_publish_until = v_now + v_settings.free_publish_window,
         free_draft_until = v_now + v_settings.free_draft_retention
   where id = p_memorial_id;

  insert into public.memorial_access_events (memorial_id, owner_id, event, from_level, to_level, created_at)
  values (p_memorial_id, p_owner_id, 'free.anchored', 'avis', 'avis', v_now);

  return query select 'anchored'::text, v_now,
                      v_now + v_settings.free_publish_window,
                      v_now + v_settings.free_draft_retention;
end;
$$;

-- F3. Passage au complet du MÊME mémorial. Ne touche ni le brouillon, ni
-- la copie publiée, ni les médias, ni les messages, ni le statut, ni le
-- slug. Idempotente sur (source, external_reference).
create or replace function public.upgrade_memorial_access_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_source text,
  p_external_reference text
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_existing uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_memorial_id is null or p_owner_id is null
     or p_source is null or p_source not in ('direct_payment', 'admin')
     or nullif(btrim(p_external_reference), '') is null then
    raise exception 'invalid memorial upgrade request' using errcode = '22023';
  end if;

  select * into v_memorial from public.memorials m where m.id = p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id or v_memorial.status = 'archived' then
    return query select 'refused'::text;
    return;
  end if;

  select ev.memorial_id into v_existing
    from public.memorial_access_events ev
   where ev.source = p_source and ev.external_reference = p_external_reference;
  if found then
    if v_existing = p_memorial_id then
      return query select 'already_complete'::text;
    else
      return query select 'refused'::text;
    end if;
    return;
  end if;

  if v_memorial.access_level = 'complet' then
    return query select 'already_complete'::text;
    return;
  end if;

  update public.memorials
     set access_level = 'complet',
         access_level_changed_at = v_now
   where id = p_memorial_id;

  begin
    insert into public.memorial_access_events
      (memorial_id, owner_id, event, from_level, to_level, source, external_reference, created_at)
    values
      (p_memorial_id, p_owner_id, 'access.upgraded', 'avis', 'complet', p_source, p_external_reference, v_now);
  exception when unique_violation then
    -- La même référence vient d'être consommée par une autre transaction :
    -- rien n'est conservé de ce passage-ci.
    raise exception 'external reference already used' using errcode = 'HD409';
  end;

  return query select 'upgraded'::text;
end;
$$;

-- ---------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------

revoke all on function public.memorials_inherit_access_level_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_free_first_publication_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_free_gallery_quota_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_free_draft_gallery_v1() from public, anon, authenticated, service_role;

revoke all on function public.create_free_memorial_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.anchor_free_memorial_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.upgrade_memorial_access_v1(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.create_free_memorial_v1(uuid, text, text) to service_role;
grant execute on function public.anchor_free_memorial_v1(uuid, uuid) to service_role;
grant execute on function public.upgrade_memorial_access_v1(uuid, uuid, text, text) to service_role;

comment on function public.create_free_memorial_v1(uuid, text, text) is
  'HERITAGE Direct M1-A. Crée un brouillon gratuit (droit direct « avis » + redeem_entitlement inchangée, une transaction). B6 : refus « free_draft_limit » si le propriétaire a déjà un brouillon gratuit actif. service_role seul.';
comment on function public.anchor_free_memorial_v1(uuid, uuid) is
  'HERITAGE Direct M1-A (B1). Pose une seule fois l''ancre du brouillon gratuit (heure de la base) et ses échéances : +7 j (publication gratuite), +45 j (conservation). Idempotente. service_role seul.';
comment on function public.upgrade_memorial_access_v1(uuid, uuid, text, text) is
  'HERITAGE Direct M1-A. Passe le même mémorial au complet, journalisé, idempotent sur (source, référence externe). Ne touche aucun contenu. service_role seul.';
