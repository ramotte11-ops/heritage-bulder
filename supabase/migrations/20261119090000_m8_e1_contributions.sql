-- HERITAGE HOMMAGE — M8-E1 : Contributions des proches (données et RPC).
--
-- Contrat : M8-P final, § 14 (GO technique E1 du QG : Q1, Q2, Q7-B).
-- Écrite et testée en local (npm run db:test) ; NON appliquée. Son
-- application sur nudqzbdfnjzlnyffllgs relève de E6, sous un GO distinct.
-- Préflight : supabase/verifications/m8_e1_preflight.sql.
-- Postflight : supabase/verifications/m8_e1_postflight.sql.
-- Retour arrière : supabase/rollbacks/20261119090000_m8_e1_contributions.down.sql.
--
-- Additive : aucune colonne, table, politique ni fonction existante n'est
-- supprimée. Deux fonctions QG 017 reçoivent une nouvelle version (Q7-B) ;
-- le retour arrière restaure leur version QG 017 à l'identique.
--
-- Écarts au § 14.3, imposés par l'existant et signalés au rapport E1 :
--  * Les politiques messages_insert_public et messages_moderate_own sont
--    CONSERVÉES (le contrat prévoyait leur suppression). Sans privilège de
--    table client sur messages (Mission 013C), elles sont inertes ; les
--    supprimer casserait des blocs historiques du harnais (Mission 002,
--    QG 008) que le GO interdit de toucher. Pour la même raison,
--    public_memorial_message_allowed_v1 garde son ACL C3 (anon,
--    authenticated) : la politique conservée l'évalue.
--  * Les RPC familiales sont service_role avec p_owner_id résolu côté
--    serveur (modèle de commit_memorial_draft_edit_v1), et non
--    authenticated avec current_owner_id() : le durcissement C3 (test C5)
--    n'autorise que trois fonctions publiques exécutables par un client.
--
-- Ordre des verrous (inchangé) : memorials, puis brouillon, média,
-- catégories ; un dépôt de visiteur ne prend jamais de verrou sur
-- memorials (seulement le verrou consultatif de l'hommage et la ligne de
-- plafond), si bien qu'aucun cycle n'est possible avec la publication.

begin;

-- =====================================================================
-- 1. messages : extension additive
-- =====================================================================

alter table public.messages
  add column status text not null default 'pending',
  add column caption text,
  add column media_id uuid references public.media (id),
  add column idempotency_key uuid,
  add column published_at timestamptz,
  add column moderated_at timestamptz;

-- Reprise des lignes historiques selon visible (E0 : table vide en
-- production ; la reprise reste correcte si des lignes existent).
update public.messages
   set status = case when visible then 'published' else 'pending' end,
       published_at = case when visible then created_at end;

alter table public.messages
  add constraint messages_status_check
  check (status in ('pending', 'published', 'hidden', 'rejected'));

alter table public.messages drop constraint messages_message_type_check;
alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('condolence', 'memory_message', 'testimonial', 'photo'));

-- Une photo n'a pas de texte : la colonne devient facultative ; la
-- contrainte historique messages_content_check (texte non vide) reste en
-- place et continue de s'appliquer à tout texte présent.
alter table public.messages alter column content drop not null;

alter table public.messages
  add constraint messages_shape_check
  check (
    case when message_type = 'photo'
      then content is null and media_id is not null
      else content is not null and media_id is null and caption is null
    end
  );

alter table public.messages
  add constraint messages_visible_matches_status
  check (visible = (status = 'published'));

alter table public.messages
  add constraint messages_published_at_required
  check (status not in ('published', 'hidden') or published_at is not null);

-- Q2 : filet en points de code (10 N, jamais plus strict que le compteur
-- de caractères visibles de l'application), forme NFC, aucun \r.
-- memory_message (offre complète, hors Contributions) est inchangé.
alter table public.messages
  add constraint messages_author_name_q2
  check (
    message_type = 'memory_message'
    or (char_length(author_name) <= 600
        and author_name is nfc normalized
        and strpos(author_name, chr(13)) = 0)
  );

alter table public.messages
  add constraint messages_content_q2
  check (
    message_type in ('memory_message', 'photo')
    or (content is nfc normalized
        and strpos(content, chr(13)) = 0
        and char_length(content) <= case message_type when 'condolence' then 5000 else 20000 end)
  );

alter table public.messages
  add constraint messages_caption_q2
  check (
    caption is null
    or (char_length(btrim(caption)) > 0
        and char_length(caption) <= 1500
        and caption is nfc normalized
        and strpos(caption, chr(13)) = 0)
  );

alter table public.messages
  add constraint messages_memorial_idempotency_key unique (memorial_id, idempotency_key);
alter table public.messages
  add constraint messages_media_id_key unique (media_id);

create index messages_memorial_status_published_idx
  on public.messages (memorial_id, status, published_at desc, id desc);
create index messages_memorial_created_idx
  on public.messages (memorial_id, message_type, created_at desc);

-- visible suit status. Une modération passe par status (les RPC) ; si une
-- écriture historique ne change que visible, status suit (true :
-- publiée ; false : masquée si elle l'était, sinon inchangée).
create or replace function public.messages_align_visible_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.visible := new.status = 'published';
  elsif new.visible is distinct from old.visible then
    new.status := case
                    when new.visible then 'published'
                    when old.status = 'published' then 'hidden'
                    else old.status
                  end;
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger messages_align_visible
  before update of status, visible on public.messages
  for each row execute function public.messages_align_visible_v1();

comment on column public.messages.status is
  'M8-E1. pending (à examiner), published, hidden (masquée par la famille, réaffichable), rejected. visible = (status = published), contrainte messages_visible_matches_status.';
comment on column public.messages.media_id is
  'M8-E1. Photo d''un proche : média purpose = contribution (une photo par message). NULL pour un texte.';
comment on column public.messages.idempotency_key is
  'M8-E1. Clé de dépôt du navigateur, unique par hommage. NULL pour les lignes antérieures. Jamais lisible par un client.';
comment on column public.messages.published_at is
  'M8-E1. Première mise en ligne ; conservée par un masquage, pour qu''un réaffichage retrouve sa place (ordre P1 : published_at desc, id desc).';

-- =====================================================================
-- 2. media : purpose contribution
-- =====================================================================

alter table public.media drop constraint media_purpose_check;
alter table public.media
  add constraint media_purpose_check check (purpose in ('hero', 'gallery', 'contribution'));

comment on column public.media.purpose is
  'What this media is for: hero, gallery or contribution (photo d''un proche, M8-E1). Mirrors MEDIA_PURPOSES in config/media.ts. A label only — it never changes how the object is stored, pathed, authorized or validated (Mission 030).';

-- =====================================================================
-- 3. Plafonds R2 et R3
-- =====================================================================

create table public.contribution_settings (
  id boolean primary key default true check (id),
  condolences_per_hour integer not null check (condolences_per_hour > 0),
  condolences_per_day integer not null check (condolences_per_day > 0),
  stories_per_hour integer not null check (stories_per_hour > 0),
  stories_per_day integer not null check (stories_per_day > 0),
  photo_reservations_per_hour integer not null check (photo_reservations_per_hour > 0),
  photo_reservations_per_day integer not null check (photo_reservations_per_day > 0),
  max_pending_photos integer not null check (max_pending_photos > 0),
  duplicate_window interval not null check (duplicate_window > interval '0'),
  photo_reservation_window interval not null check (photo_reservation_window > interval '0'),
  max_photo_bytes bigint not null check (max_photo_bytes > 0),
  updated_at timestamptz not null default now(),
  constraint contribution_settings_hour_within_day check (
    condolences_per_hour <= condolences_per_day
    and stories_per_hour <= stories_per_day
    and photo_reservations_per_hour <= photo_reservations_per_day)
);

insert into public.contribution_settings (
  condolences_per_hour, condolences_per_day, stories_per_hour, stories_per_day,
  photo_reservations_per_hour, photo_reservations_per_day, max_pending_photos,
  duplicate_window, photo_reservation_window, max_photo_bytes)
values (120, 1000, 60, 400, 30, 200, 200, interval '10 minutes', interval '1 hour', 15728640);

-- Réglage par hommage (R2) : NULL = valeur générale. Modifiable seulement
-- par SQL revu ou un outil QG ; aucune RPC ne l'écrit.
create table public.contribution_limits_override (
  memorial_id uuid primary key references public.memorials (id) on delete cascade,
  condolences_per_hour integer check (condolences_per_hour > 0),
  condolences_per_day integer check (condolences_per_day > 0),
  stories_per_hour integer check (stories_per_hour > 0),
  stories_per_day integer check (stories_per_day > 0),
  photo_reservations_per_hour integer check (photo_reservations_per_hour > 0),
  photo_reservations_per_day integer check (photo_reservations_per_day > 0),
  max_pending_photos integer check (max_pending_photos > 0),
  reason text,
  updated_at timestamptz not null default now()
);

-- Fenêtres fixes par hommage et par type (R1 : jamais par source).
create table public.contribution_rate_limits (
  memorial_id uuid not null references public.memorials (id) on delete cascade,
  kind text not null check (kind in ('condolence', 'story', 'photo')),
  hour_window_started_at timestamptz not null,
  hour_count integer not null default 0 check (hour_count >= 0),
  day_window_started_at timestamptz not null,
  day_count integer not null default 0 check (day_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (memorial_id, kind)
);

alter table public.contribution_settings enable row level security;
alter table public.contribution_limits_override enable row level security;
alter table public.contribution_rate_limits enable row level security;

comment on table public.contribution_settings is
  'M8-E1, R2/R3. Valeurs générales des plafonds techniques des Contributions (une ligne). Aucun privilège client.';
comment on table public.contribution_limits_override is
  'M8-E1, R2. Réglage par hommage (NULL = valeur générale). Écrit seulement par SQL revu ou outil QG.';
comment on table public.contribution_rate_limits is
  'M8-E1, R2. Compteurs à fenêtres fixes (heure, jour) par hommage et par type. Un refus n''est jamais compté.';

-- =====================================================================
-- 4. Catégories en vigueur (O9, Q1)
-- =====================================================================

create table public.memorial_contribution_categories (
  memorial_id uuid primary key references public.memorials (id) on delete cascade,
  condolences boolean not null,
  stories boolean not null,
  photos boolean not null,
  updated_at timestamptz not null default now(),
  -- NULL : posé par une publication ; sinon le propriétaire qui l'a changé.
  updated_by uuid references public.owners (id)
);

alter table public.memorial_contribution_categories enable row level security;

comment on table public.memorial_contribution_categories is
  'M8-E1, O9/Q1. Réglage EN VIGUEUR des trois catégories, lu par les dépôts et la lecture publique. Initialisé par la publication (déclencheur), changé immédiatement par set_contribution_categories_v1 ; la copie publiée n''est jamais réécrite. Sans ligne : les choix de la copie publiée.';

-- Lecture défensive de content.contributions.features, miroir exact de
-- inspectContributionsSettings (lib/memorial/contributions/contributions-settings.ts) :
-- absent = tout fermé ; mal formé = NULL (aucune écriture, tout fermé).
create or replace function public.contribution_features_v1(p_content jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_raw jsonb;
  v_features jsonb;
  v_out jsonb := '{"condolences": false, "stories": false, "photos": false}'::jsonb;
  v_key text;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return null;
  end if;
  if not (p_content ? 'contributions') then
    return v_out;
  end if;
  v_raw := p_content -> 'contributions';
  if jsonb_typeof(v_raw) <> 'object' then
    return null;
  end if;
  v_features := v_raw -> 'features';
  if v_features is null or jsonb_typeof(v_features) <> 'object' then
    return null;
  end if;
  foreach v_key in array array['condolences', 'stories', 'photos'] loop
    if v_features ? v_key then
      if jsonb_typeof(v_features -> v_key) <> 'boolean' then
        return null;
      end if;
      v_out := jsonb_set(v_out, array[v_key], v_features -> v_key);
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.sync_contribution_categories_on_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := public.contribution_features_v1(new.content);
begin
  if v_new is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.memorial_contribution_categories (memorial_id, condolences, stories, photos)
    values (new.memorial_id, (v_new ->> 'condolences')::boolean, (v_new ->> 'stories')::boolean, (v_new ->> 'photos')::boolean)
    on conflict (memorial_id) do nothing;
  elsif v_new is distinct from public.contribution_features_v1(old.content) then
    -- Republication explicite de nouveaux choix : elle l'emporte. Sinon
    -- rien ne change, et un réglage immédiat O9 est préservé.
    insert into public.memorial_contribution_categories (memorial_id, condolences, stories, photos)
    values (new.memorial_id, (v_new ->> 'condolences')::boolean, (v_new ->> 'stories')::boolean, (v_new ->> 'photos')::boolean)
    on conflict (memorial_id) do update
      set condolences = excluded.condolences,
          stories = excluded.stories,
          photos = excluded.photos,
          updated_at = now(),
          updated_by = null;
  end if;
  return null;
end;
$$;

create trigger memorial_published_snapshots_sync_contribution_categories
  after insert or update of content on public.memorial_published_snapshots
  for each row execute function public.sync_contribution_categories_on_publication_v1();

-- Hommage publié et public, copie publiée présente, rubrique non masquée.
create or replace function public.contributions_rubric_public_v1(p_memorial_id uuid, p_now timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.memorial_publicly_visible_v1(s.memorial_id, p_now)
           and not coalesce(jsonb_typeof(s.content #> '{presentation,hiddenSections}') = 'array'
                            and (s.content #> '{presentation,hiddenSections}') ? 'testimonials', false)
      from public.memorial_published_snapshots s
     where s.memorial_id = p_memorial_id
  ), false);
$$;

-- Réglage en vigueur : la ligne O9, sinon les choix de la copie publiée,
-- sinon tout fermé.
create or replace function public.contribution_categories_in_effect_v1(p_memorial_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('condolences', c.condolences, 'stories', c.stories, 'photos', c.photos)
       from public.memorial_contribution_categories c
      where c.memorial_id = p_memorial_id),
    (select public.contribution_features_v1(s.content)
       from public.memorial_published_snapshots s
      where s.memorial_id = p_memorial_id),
    '{"condolences": false, "stories": false, "photos": false}'::jsonb);
$$;

-- =====================================================================
-- 5. Q7-B : les photos des proches hors du budget gratuit de 300 Mo
-- =====================================================================
-- Seule différence avec la version QG 017 : purpose = 'contribution' est
-- ignoré. La règle reste entière pour les médias de la famille.

create or replace function public.owner_free_storage_bytes_v1(p_owner_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(md.size_bytes), 0)::bigint
    from public.media md
    join public.memorials m on m.id = md.memorial_id
   where m.owner_id = p_owner_id
     and m.access_level = 'avis'
     and md.status = 'ready'
     and md.purpose <> 'contribution';
$$;

create or replace function public.guard_free_storage_budget_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_level text;
  v_budget bigint;
  v_used bigint;
begin
  if new.purpose = 'contribution' then
    return new;
  end if;
  if tg_op = 'UPDATE' and not (old.status = 'pending' and new.status = 'ready') then
    return new;
  end if;
  select m.owner_id, m.access_level into v_owner, v_level
    from public.memorials m where m.id = new.memorial_id;
  if v_level is distinct from 'avis' or v_owner is null then
    return new;
  end if;
  select s.free_storage_bytes_per_owner into v_budget
    from public.memorial_access_settings s where s.id;
  if v_budget is null then
    return new;
  end if;
  -- Sérialise les finalisations d'un même compte (verrou dédié : aucun
  -- autre verrou n'est pris dans un ordre différent).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('heritage-owner-storage:' || v_owner::text, 0));
  v_used := public.owner_free_storage_bytes_v1(v_owner);
  if tg_op = 'INSERT' then
    -- Pré-contrôle à la réservation : budget déjà épuisé, inutile d'envoyer.
    if v_used >= v_budget then
      raise exception 'free storage budget reached' using errcode = 'HD507';
    end if;
  elsif v_used + coalesce(new.size_bytes, 0) > v_budget then
    raise exception 'free storage budget reached' using errcode = 'HD507';
  end if;
  return new;
end;
$$;

-- =====================================================================
-- 6. Offre gratuite (D1) : la copie « avis » peut porter contributions
-- =====================================================================

update public.memorial_access_settings
   set avis_snapshot_keys = array_append(avis_snapshot_keys, 'contributions'),
       updated_at = now()
 where id
   and not ('contributions' = any (avis_snapshot_keys));

-- =====================================================================
-- 7. Autorisation de dépôt v2
-- =====================================================================
-- Hommage public, rubrique non masquée, catégorie en vigueur ; les trois
-- types des Contributions dans les deux offres ; memory_message garde la
-- règle QG 008 (offre complète, rubrique activée). La v1 est conservée
-- (politique historique), sans changement.

create or replace function public.public_memorial_message_allowed_v2(p_memorial_id uuid, p_message_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_message_type
             when 'memory_message' then
               public.memorial_publicly_visible_v1(m.id, now())
               and m.access_level = 'complet'
               and 'memoryMessage' = any (m.enabled_sections)
             when 'condolence' then
               public.contributions_rubric_public_v1(m.id, now())
               and (public.contribution_categories_in_effect_v1(m.id) ->> 'condolences')::boolean
             when 'testimonial' then
               public.contributions_rubric_public_v1(m.id, now())
               and (public.contribution_categories_in_effect_v1(m.id) ->> 'stories')::boolean
             when 'photo' then
               public.contributions_rubric_public_v1(m.id, now())
               and (public.contribution_categories_in_effect_v1(m.id) ->> 'photos')::boolean
             else false
           end
      from public.memorials m
     where m.id = p_memorial_id
  ), false);
$$;

-- =====================================================================
-- 8. Dépôts des visiteurs (service_role)
-- =====================================================================

-- Texte conforme au filet Q2 (le serveur applicatif a déjà normalisé et
-- compté les caractères visibles).
create or replace function public.contribution_text_valid_v1(p_text text, p_max_code_points integer)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_text is not null
         and char_length(btrim(p_text)) > 0
         and char_length(p_text) <= p_max_code_points
         and p_text is nfc normalized
         and strpos(p_text, chr(13)) = 0;
$$;

-- Plafonds applicables à un hommage pour un type (réglage par hommage,
-- sinon valeur générale).
create or replace function public.contribution_limits_v1(p_memorial_id uuid, p_kind text)
returns table (per_hour integer, per_day integer, max_pending_photos integer)
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
           when 'condolence' then coalesce(o.condolences_per_hour, s.condolences_per_hour)
           when 'story' then coalesce(o.stories_per_hour, s.stories_per_hour)
           when 'photo' then coalesce(o.photo_reservations_per_hour, s.photo_reservations_per_hour)
         end,
         case p_kind
           when 'condolence' then coalesce(o.condolences_per_day, s.condolences_per_day)
           when 'story' then coalesce(o.stories_per_day, s.stories_per_day)
           when 'photo' then coalesce(o.photo_reservations_per_day, s.photo_reservations_per_day)
         end,
         coalesce(o.max_pending_photos, s.max_pending_photos)
    from public.contribution_settings s
    left join public.contribution_limits_override o on o.memorial_id = p_memorial_id
   where s.id;
$$;

-- R2 : verrouille la ligne (hommage, type), remet les fenêtres échues à
-- zéro et dit si un dépôt de plus est permis. Ne compte rien.
create or replace function public.contribution_rate_open_v1(p_memorial_id uuid, p_kind text, p_now timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.contribution_rate_limits%rowtype;
  v_per_hour integer;
  v_per_day integer;
begin
  select l.per_hour, l.per_day into v_per_hour, v_per_day
    from public.contribution_limits_v1(p_memorial_id, p_kind) l;
  if v_per_hour is null or v_per_day is null then
    return false;
  end if;
  insert into public.contribution_rate_limits (memorial_id, kind, hour_window_started_at, day_window_started_at)
  values (p_memorial_id, p_kind, p_now, p_now)
  on conflict (memorial_id, kind) do nothing;
  select * into v_row from public.contribution_rate_limits
   where memorial_id = p_memorial_id and kind = p_kind
   for update;
  if v_row.hour_window_started_at <= p_now - interval '1 hour' then
    v_row.hour_window_started_at := p_now;
    v_row.hour_count := 0;
  end if;
  if v_row.day_window_started_at <= p_now - interval '1 day' then
    v_row.day_window_started_at := p_now;
    v_row.day_count := 0;
  end if;
  update public.contribution_rate_limits
     set hour_window_started_at = v_row.hour_window_started_at,
         hour_count = v_row.hour_count,
         day_window_started_at = v_row.day_window_started_at,
         day_count = v_row.day_count,
         updated_at = p_now
   where memorial_id = p_memorial_id and kind = p_kind;
  return v_row.hour_count < v_per_hour and v_row.day_count < v_per_day;
end;
$$;

create or replace function public.contribution_rate_count_v1(p_memorial_id uuid, p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.contribution_rate_limits
     set hour_count = hour_count + 1,
         day_count = day_count + 1
   where memorial_id = p_memorial_id and kind = p_kind;
$$;

-- R3 : photos en attente d'examen + réservations encore actives (ni
-- finalisées, ni réclamées pour nettoyage, plus récentes que la fenêtre).
create or replace function public.contribution_pending_photos_v1(p_memorial_id uuid, p_now timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.messages msg
      where msg.memorial_id = p_memorial_id
        and msg.message_type = 'photo'
        and msg.status = 'pending')
    +
    (select count(*) from public.media md
      where md.memorial_id = p_memorial_id
        and md.purpose = 'contribution'
        and md.status = 'pending'
        and md.created_at > p_now - (select s.photo_reservation_window from public.contribution_settings s where s.id)
        and not exists (select 1 from public.messages msg where msg.media_id = md.id)
        and not exists (select 1 from public.pending_media_cleanup_claims c
                         where c.media_id = md.id and c.completed_at is null))
  )::integer;
$$;

-- Dépôt d'un texte : condoléance (publiée tout de suite, D2) ou récit
-- (en attente d'approbation). Contrôles dans l'ordre du contrat § 2.
-- Résultats : published, pending, duplicate (avec l'état de la première),
-- rate_limited, refused. Une demande mal formée lève 22023.
create or replace function public.submit_contribution_v1(
  p_slug text,
  p_message_type text,
  p_author_name text,
  p_content text,
  p_idempotency_key uuid
)
returns table (outcome text, contribution_id uuid, contribution_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_memorial_id uuid;
  v_kind text;
  v_existing public.messages%rowtype;
  v_window interval;
  v_status text;
  v_id uuid;
begin
  if nullif(btrim(p_slug), '') is null
     or p_message_type is null
     or p_message_type not in ('condolence', 'testimonial')
     or p_idempotency_key is null then
    raise exception 'invalid contribution request' using errcode = '22023';
  end if;

  select m.id into v_memorial_id from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null
     or not public.public_memorial_message_allowed_v2(v_memorial_id, p_message_type) then
    return query select 'refused'::text, null::uuid, null::text;
    return;
  end if;

  if not public.contribution_text_valid_v1(p_author_name, 600)
     or not public.contribution_text_valid_v1(p_content, case p_message_type when 'condolence' then 5000 else 20000 end) then
    raise exception 'invalid contribution request' using errcode = '22023';
  end if;

  -- Un dépôt à la fois par hommage, jusqu'à la fin de la transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('heritage-contributions:' || v_memorial_id::text, 0));

  select * into v_existing from public.messages
   where memorial_id = v_memorial_id and idempotency_key = p_idempotency_key;
  if found then
    return query select 'duplicate'::text, v_existing.id, v_existing.status;
    return;
  end if;

  select s.duplicate_window into v_window from public.contribution_settings s where s.id;
  select * into v_existing from public.messages
   where memorial_id = v_memorial_id
     and message_type = p_message_type
     and author_name = p_author_name
     and content = p_content
     and created_at > v_now - v_window
   order by created_at desc
   limit 1;
  if found then
    return query select 'duplicate'::text, v_existing.id, v_existing.status;
    return;
  end if;

  v_kind := case p_message_type when 'condolence' then 'condolence' else 'story' end;
  if not public.contribution_rate_open_v1(v_memorial_id, v_kind, v_now) then
    return query select 'rate_limited'::text, null::uuid, null::text;
    return;
  end if;
  perform public.contribution_rate_count_v1(v_memorial_id, v_kind);

  v_status := case p_message_type when 'condolence' then 'published' else 'pending' end;
  insert into public.messages
    (memorial_id, message_type, author_name, content, status, visible, published_at, idempotency_key, created_at)
  values
    (v_memorial_id, p_message_type, p_author_name, p_content, v_status, v_status = 'published',
     case when v_status = 'published' then v_now end, p_idempotency_key, v_now)
  returning id into v_id;

  return query select v_status, v_id, v_status;
end;
$$;

-- Réservation d'une photo : R2 (réservations) et R3 (en attente), puis
-- un média contribution pending sous <memorial_id>/<media_id>/original.*.
-- Résultats : reserved (avec memorial_id), rate_limited, pending_full,
-- refused. Rejouer la même réservation renvoie reserved, sans doublon.
create or replace function public.reserve_contribution_photo_v1(
  p_slug text,
  p_media_id uuid,
  p_storage_path text,
  p_declared_mime_type text
)
returns table (outcome text, memorial_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_memorial public.memorials%rowtype;
  v_media public.media%rowtype;
  v_max_pending integer;
begin
  if nullif(btrim(p_slug), '') is null
     or p_media_id is null
     or p_declared_mime_type is null
     or p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'invalid contribution photo reservation' using errcode = '22023';
  end if;

  select * into v_memorial from public.memorials m where m.slug = p_slug;
  if v_memorial.id is null
     or not public.public_memorial_message_allowed_v2(v_memorial.id, 'photo') then
    return query select 'refused'::text, null::uuid;
    return;
  end if;
  if p_storage_path is null
     or p_storage_path not like v_memorial.id::text || '/' || p_media_id::text || '/original.%' then
    raise exception 'invalid contribution photo reservation' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('heritage-contributions:' || v_memorial.id::text, 0));

  select * into v_media from public.media where id = p_media_id;
  if found then
    if v_media.memorial_id = v_memorial.id and v_media.purpose = 'contribution'
       and v_media.status = 'pending' and v_media.storage_path = p_storage_path
       and not exists (select 1 from public.pending_media_cleanup_claims c
                        where c.media_id = p_media_id and c.completed_at is null) then
      return query select 'reserved'::text, v_memorial.id;
      return;
    end if;
    return query select 'refused'::text, null::uuid;
    return;
  end if;

  if not public.contribution_rate_open_v1(v_memorial.id, 'photo', v_now) then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;
  select l.max_pending_photos into v_max_pending from public.contribution_limits_v1(v_memorial.id, 'photo') l;
  if v_max_pending is null or public.contribution_pending_photos_v1(v_memorial.id, v_now) >= v_max_pending then
    return query select 'pending_full'::text, null::uuid;
    return;
  end if;
  perform public.contribution_rate_count_v1(v_memorial.id, 'photo');

  insert into public.media
    (id, memorial_id, owner_id, storage_path, media_type, purpose, status, mime_type, created_at)
  values
    (p_media_id, v_memorial.id, v_memorial.owner_id, p_storage_path, 'photo', 'contribution', 'pending',
     p_declared_mime_type, v_now);

  return query select 'reserved'::text, v_memorial.id;
end;
$$;

-- Finalisation : le serveur applicatif a mesuré (et, en E2, ré-encodé,
-- O5) le fichier ; le média passe à ready et le message photo est créé
-- en attente d'approbation (D2). Résultats : pending, duplicate, refused.
create or replace function public.finalize_contribution_photo_v1(
  p_slug text,
  p_media_id uuid,
  p_author_name text,
  p_caption text,
  p_idempotency_key uuid,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer,
  p_height integer
)
returns table (outcome text, contribution_id uuid, contribution_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_memorial_id uuid;
  v_media public.media%rowtype;
  v_existing public.messages%rowtype;
  v_caption text := case when p_caption is null or btrim(p_caption) = '' then null else p_caption end;
  v_max_bytes bigint;
  v_id uuid;
begin
  if nullif(btrim(p_slug), '') is null
     or p_media_id is null
     or p_idempotency_key is null
     or p_mime_type is null
     or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_size_bytes is null or p_size_bytes <= 0
     or p_width is null or p_width <= 0
     or p_height is null or p_height <= 0 then
    raise exception 'invalid contribution photo finalization' using errcode = '22023';
  end if;

  select m.id into v_memorial_id from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null
     or not public.public_memorial_message_allowed_v2(v_memorial_id, 'photo') then
    return query select 'refused'::text, null::uuid, null::text;
    return;
  end if;

  if not public.contribution_text_valid_v1(p_author_name, 600)
     or (v_caption is not null and not public.contribution_text_valid_v1(v_caption, 1500)) then
    raise exception 'invalid contribution photo finalization' using errcode = '22023';
  end if;
  select s.max_photo_bytes into v_max_bytes from public.contribution_settings s where s.id;
  if p_size_bytes > v_max_bytes then
    raise exception 'invalid contribution photo finalization' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('heritage-contributions:' || v_memorial_id::text, 0));

  select * into v_existing from public.messages
   where memorial_id = v_memorial_id
     and (idempotency_key = p_idempotency_key or media_id = p_media_id)
   limit 1;
  if found then
    return query select 'duplicate'::text, v_existing.id, v_existing.status;
    return;
  end if;

  select * into v_media from public.media
   where id = p_media_id and memorial_id = v_memorial_id
   for update;
  if not found or v_media.purpose <> 'contribution' or v_media.status <> 'pending'
     or exists (select 1 from public.pending_media_cleanup_claims c
                 where c.media_id = p_media_id and c.completed_at is null) then
    return query select 'refused'::text, null::uuid, null::text;
    return;
  end if;

  update public.media
     set status = 'ready', mime_type = p_mime_type, size_bytes = p_size_bytes,
         width = p_width, height = p_height
   where id = p_media_id;

  insert into public.messages
    (memorial_id, message_type, author_name, content, caption, media_id, status, visible, idempotency_key, created_at)
  values
    (v_memorial_id, 'photo', p_author_name, null, v_caption, p_media_id, 'pending', false, p_idempotency_key, v_now)
  returning id into v_id;

  return query select 'pending'::text, v_id, 'pending'::text;
end;
$$;

-- Lecture publique : contributions publiées des catégories EN VIGUEUR
-- d'un hommage public dont la rubrique n'est pas masquée ; ordre P1
-- (published_at desc, id desc) ; curseur (p_before_published_at,
-- p_before_id) exclusif ; photos ready seulement. Jamais idempotency_key.
create or replace function public.read_public_contributions_v1(
  p_slug text,
  p_limit integer default 24,
  p_before_published_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  contribution_id uuid,
  message_type text,
  author_name text,
  content text,
  caption text,
  published_at timestamptz,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_memorial_id uuid;
  v_categories jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
begin
  if p_slug is null
     or ((p_before_published_at is null) <> (p_before_id is null)) then
    return;
  end if;
  select m.id into v_memorial_id from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null or not public.contributions_rubric_public_v1(v_memorial_id, now()) then
    return;
  end if;
  v_categories := public.contribution_categories_in_effect_v1(v_memorial_id);

  return query
    select msg.id, msg.message_type, msg.author_name, msg.content, msg.caption, msg.published_at,
           case when msg.message_type = 'photo' then
             jsonb_build_object('media_id', md.id, 'storage_path', md.storage_path,
                                'width', md.width, 'height', md.height)
           end
      from public.messages msg
      left join public.media md
        on md.id = msg.media_id and md.memorial_id = msg.memorial_id
     where msg.memorial_id = v_memorial_id
       and msg.status = 'published'
       and ((msg.message_type = 'condolence' and (v_categories ->> 'condolences')::boolean)
         or (msg.message_type = 'testimonial' and (v_categories ->> 'stories')::boolean)
         or (msg.message_type = 'photo' and (v_categories ->> 'photos')::boolean
             and md.status = 'ready' and md.purpose = 'contribution'))
       and (p_before_published_at is null
            or (msg.published_at, msg.id) < (p_before_published_at, p_before_id))
     order by msg.published_at desc, msg.id desc
     limit v_limit;
end;
$$;

-- =====================================================================
-- 9. Actions de la famille (service_role, p_owner_id résolu côté serveur)
-- =====================================================================

-- approve : pending → published ; reject : pending → rejected ;
-- hide : published → hidden ; unhide : hidden → published.
-- Jamais de réécriture du nom ni du texte. Résultats : updated,
-- unchanged (déjà dans l'état visé), invalid_transition, refused.
create or replace function public.moderate_contribution_v1(p_owner_id uuid, p_contribution_id uuid, p_action text)
returns table (outcome text, contribution_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial_id uuid;
  v_memorial public.memorials%rowtype;
  v_message public.messages%rowtype;
  v_from text;
  v_to text;
begin
  if p_owner_id is null or p_contribution_id is null
     or p_action is null or p_action not in ('approve', 'reject', 'hide', 'unhide') then
    raise exception 'invalid contribution moderation' using errcode = '22023';
  end if;
  select msg.memorial_id into v_memorial_id from public.messages msg where msg.id = p_contribution_id;
  if v_memorial_id is null then
    return query select 'refused'::text, null::text;
    return;
  end if;
  select * into v_memorial from public.memorials where id = v_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    return query select 'refused'::text, null::text;
    return;
  end if;
  select * into v_message from public.messages
   where id = p_contribution_id and memorial_id = v_memorial_id for update;
  if not found then
    return query select 'refused'::text, null::text;
    return;
  end if;

  v_from := case p_action when 'approve' then 'pending' when 'reject' then 'pending'
                          when 'hide' then 'published' else 'hidden' end;
  v_to := case p_action when 'approve' then 'published' when 'reject' then 'rejected'
                        when 'hide' then 'hidden' else 'published' end;
  if v_message.status = v_to then
    return query select 'unchanged'::text, v_message.status;
    return;
  end if;
  if v_message.status <> v_from then
    return query select 'invalid_transition'::text, v_message.status;
    return;
  end if;

  update public.messages
     set status = v_to,
         visible = v_to = 'published',
         published_at = case when v_to = 'published' then coalesce(published_at, clock_timestamp()) else published_at end,
         moderated_at = clock_timestamp()
   where id = p_contribution_id;
  return query select 'updated'::text, v_to;
end;
$$;

-- Suppression définitive d'une contribution. Pour une photo, le média
-- repasse pending et une réclamation de nettoyage est posée (circuit
-- existant) : le serveur supprime l'objet puis appelle
-- finish_pending_media_cleanup_v1(memorial_id, owner_id, cleanup_claim_id).
-- Résultats : removed (avec la réclamation éventuelle), refused.
create or replace function public.remove_contribution_v1(p_owner_id uuid, p_contribution_id uuid)
returns table (outcome text, memorial_id uuid, cleanup_claim_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_memorial_id uuid;
  v_memorial public.memorials%rowtype;
  v_message public.messages%rowtype;
  v_media public.media%rowtype;
  v_claim uuid;
begin
  if p_owner_id is null or p_contribution_id is null then
    raise exception 'invalid contribution removal' using errcode = '22023';
  end if;
  select msg.memorial_id into v_memorial_id from public.messages msg where msg.id = p_contribution_id;
  if v_memorial_id is null then
    return query select 'refused'::text, null::uuid, null::uuid, null::text;
    return;
  end if;
  select * into v_memorial from public.memorials where id = v_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    return query select 'refused'::text, null::uuid, null::uuid, null::text;
    return;
  end if;
  select * into v_message from public.messages
   where id = p_contribution_id and memorial_id = v_memorial_id for update;
  if not found then
    return query select 'refused'::text, null::uuid, null::uuid, null::text;
    return;
  end if;
  if v_message.media_id is not null then
    select * into v_media from public.media
     where id = v_message.media_id and memorial_id = v_memorial_id for update;
  end if;

  delete from public.messages where id = p_contribution_id;

  if v_media.id is not null then
    update public.media set status = 'pending' where id = v_media.id;
    select c.id into v_claim from public.pending_media_cleanup_claims c
     where c.media_id = v_media.id and c.completed_at is null;
    if v_claim is null then
      insert into public.pending_media_cleanup_claims (memorial_id, media_id, owner_id)
      values (v_memorial_id, v_media.id, v_memorial.owner_id)
      returning id into v_claim;
    end if;
  end if;

  return query select 'removed'::text, v_memorial_id, v_claim, v_media.storage_path;
end;
$$;

-- Compteur du Tableau de bord (O12) : contributions à examiner, par
-- hommage du propriétaire (tous, ou un seul).
create or replace function public.count_pending_contributions_v1(p_owner_id uuid, p_memorial_id uuid default null)
returns table (memorial_id uuid, pending_stories integer, pending_photos integer, pending_total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         count(msg.id) filter (where msg.message_type = 'testimonial')::integer,
         count(msg.id) filter (where msg.message_type = 'photo')::integer,
         count(msg.id)::integer
    from public.memorials m
    left join public.messages msg on msg.memorial_id = m.id and msg.status = 'pending'
   where p_owner_id is not null
     and m.owner_id = p_owner_id
     and (p_memorial_id is null or m.id = p_memorial_id)
   group by m.id
   order by m.id;
$$;

-- O9 : changement immédiat des catégories, et brouillon aligné
-- (content.contributions.features, révision + 1, mêmes clés préservées
-- que writeContributionsSettings). La copie publiée n'est pas touchée.
-- p_expected_revision NULL : pas de contrôle (Tableau de bord) ; sinon
-- stale_revision en cas d'écart (Builder ouvert ailleurs).
-- Résultats : updated, unchanged, stale_revision, refused.
create or replace function public.set_contribution_categories_v1(
  p_owner_id uuid,
  p_memorial_id uuid,
  p_condolences boolean,
  p_stories boolean,
  p_photos boolean,
  p_expected_revision bigint default null
)
returns table (outcome text, draft_revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_draft public.memorial_drafts%rowtype;
  v_raw jsonb;
  v_previous jsonb;
  v_features jsonb;
  v_next_features jsonb;
  v_next_content jsonb;
  v_category public.memorial_contribution_categories%rowtype;
  v_category_changed boolean;
  v_draft_changed boolean;
begin
  if p_owner_id is null or p_memorial_id is null
     or p_condolences is null or p_stories is null or p_photos is null then
    raise exception 'invalid contribution categories request' using errcode = '22023';
  end if;
  select * into v_memorial from public.memorials where id = p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id or v_memorial.status = 'archived' then
    return query select 'refused'::text, null::bigint;
    return;
  end if;
  select * into v_draft from public.memorial_drafts where memorial_id = p_memorial_id for update;
  if not found then
    return query select 'refused'::text, null::bigint;
    return;
  end if;
  if p_expected_revision is not null and v_draft.revision <> p_expected_revision then
    return query select 'stale_revision'::text, v_draft.revision;
    return;
  end if;

  v_raw := v_draft.content -> 'contributions';
  v_previous := case when jsonb_typeof(v_raw) = 'object' then v_raw else '{}'::jsonb end;
  v_features := case when jsonb_typeof(v_previous -> 'features') = 'object' then v_previous -> 'features' else '{}'::jsonb end;
  v_next_features := v_features || jsonb_build_object('condolences', p_condolences, 'stories', p_stories, 'photos', p_photos);
  v_next_content := jsonb_set(
    case when jsonb_typeof(v_draft.content) = 'object' then v_draft.content else '{}'::jsonb end,
    '{contributions}',
    v_previous || jsonb_build_object('features', v_next_features));
  v_draft_changed := v_next_content is distinct from v_draft.content;

  v_category_changed := false;
  if v_memorial.first_published_at is not null then
    select * into v_category from public.memorial_contribution_categories
     where memorial_id = p_memorial_id for update;
    if not found
       or v_category.condolences <> p_condolences
       or v_category.stories <> p_stories
       or v_category.photos <> p_photos then
      insert into public.memorial_contribution_categories
        (memorial_id, condolences, stories, photos, updated_at, updated_by)
      values (p_memorial_id, p_condolences, p_stories, p_photos, now(), p_owner_id)
      on conflict (memorial_id) do update
        set condolences = excluded.condolences, stories = excluded.stories, photos = excluded.photos,
            updated_at = excluded.updated_at, updated_by = excluded.updated_by;
      v_category_changed := true;
    end if;
  end if;

  if not v_draft_changed and not v_category_changed then
    return query select 'unchanged'::text, v_draft.revision;
    return;
  end if;

  if v_draft_changed then
    update public.memorial_drafts
       set content = v_next_content, revision = revision + 1
     where memorial_id = p_memorial_id
     returning * into v_draft;
  end if;
  if v_memorial.first_published_at is not null then
    insert into public.memorial_edit_audit_events
      (memorial_id, actor_owner_id, operation, mutation_targets, memorial_status, draft_revision)
    values
      (p_memorial_id, p_owner_id, 'contributions.categories', array['contributions.features'],
       v_memorial.status, v_draft.revision);
  end if;
  return query select 'updated'::text, v_draft.revision;
end;
$$;

-- =====================================================================
-- 10. Préparation O12 : préférence et journal du récapitulatif
-- =====================================================================
-- Rien n'est envoyé ici : l'envoi relève de Q4/Q5, après E7.

create table public.owner_notification_preferences (
  owner_id uuid primary key references public.owners (id) on delete cascade,
  contributions_digest boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.contributions_digest_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners (id) on delete cascade,
  digest_day date not null,
  status text not null check (status in ('claimed', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 2),
  covered_until timestamptz not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) between 1 and 200),
  constraint contributions_digest_log_owner_day unique (owner_id, digest_day),
  constraint contributions_digest_log_sent_coherent check ((status = 'sent') = (sent_at is not null))
);

alter table public.owner_notification_preferences enable row level security;
alter table public.contributions_digest_log enable row level security;

comment on table public.owner_notification_preferences is
  'M8-E1, O12. Récapitulatif quotidien des contributions à examiner : désactivé par défaut, réversible. Écrit par set_contributions_digest_preference_v1.';
comment on table public.contributions_digest_log is
  'M8-E1, O12/Q5. Au plus un récapitulatif par propriétaire et par jour (Europe/Paris). Une issue inconnue reste claimed et n''est pas renvoyée le même jour. Ne contient aucune donnée de proche.';

create or replace function public.set_contributions_digest_preference_v1(p_owner_id uuid, p_enabled boolean)
returns table (contributions_digest boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null or p_enabled is null then
    raise exception 'invalid notification preference' using errcode = '22023';
  end if;
  if not exists (select 1 from public.owners o where o.id = p_owner_id) then
    raise exception 'notification preference refused' using errcode = '42501';
  end if;
  return query
    insert into public.owner_notification_preferences as p (owner_id, contributions_digest, updated_at)
    values (p_owner_id, p_enabled, now())
    on conflict (owner_id) do update
      set contributions_digest = excluded.contributions_digest, updated_at = excluded.updated_at
    returning p.contributions_digest;
end;
$$;

-- Réserve, pour le jour de p_now (Europe/Paris), les récapitulatifs à
-- envoyer : propriétaires abonnés À CET INSTANT, ayant au moins un récit
-- ou une photo en attente reçu depuis le dernier envoi réussi, sur un
-- hommage public dont la catégorie est en vigueur ; ni envoyé ni réservé
-- ce jour (un échec explicite est réessayé une fois). Renvoie des
-- nombres seulement, jamais un nom ni un texte de proche.
create or replace function public.claim_contributions_digests_v1(p_now timestamptz, p_limit integer)
returns table (
  digest_id uuid,
  owner_id uuid,
  email text,
  covered_until timestamptz,
  memorials jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_day date;
  v_limit integer;
  v_owner record;
  v_log public.contributions_digest_log%rowtype;
  v_summary jsonb;
begin
  if p_now is null or p_limit is null or p_limit < 1 then
    raise exception 'invalid digest claim' using errcode = '22023';
  end if;
  v_day := (p_now at time zone 'Europe/Paris')::date;
  v_limit := least(p_limit, 500);

  for v_owner in
    select o.id, o.email,
           coalesce((select max(l.covered_until) from public.contributions_digest_log l
                      where l.owner_id = o.id and l.status = 'sent'), '-infinity'::timestamptz) as since
      from public.owner_notification_preferences p
      join public.owners o on o.id = p.owner_id
     where p.contributions_digest
       and not exists (select 1 from public.contributions_digest_log l
                        where l.owner_id = o.id and l.digest_day = v_day
                          and (l.status in ('sent', 'claimed') or l.attempts >= 2))
     order by o.id
  loop
    exit when v_limit <= 0;
    select jsonb_agg(jsonb_build_object(
             'memorial_id', x.memorial_id, 'display_name', x.display_name,
             'pending_stories', x.stories, 'pending_photos', x.photos)
           order by x.memorial_id)
      into v_summary
      from (
        select m.id as memorial_id,
               s.content #>> '{hero,displayName}' as display_name,
               count(*) filter (where msg.message_type = 'testimonial'
                                  and (public.contribution_categories_in_effect_v1(m.id) ->> 'stories')::boolean) as stories,
               count(*) filter (where msg.message_type = 'photo'
                                  and (public.contribution_categories_in_effect_v1(m.id) ->> 'photos')::boolean) as photos
          from public.memorials m
          join public.memorial_published_snapshots s on s.memorial_id = m.id
          join public.messages msg on msg.memorial_id = m.id
         where m.owner_id = v_owner.id
           and msg.status = 'pending'
           and msg.message_type in ('testimonial', 'photo')
           and msg.created_at > v_owner.since
           and msg.created_at <= p_now
           and public.contributions_rubric_public_v1(m.id, p_now)
         group by m.id, s.content #>> '{hero,displayName}'
      ) x
     where x.stories + x.photos > 0;
    continue when v_summary is null;

    insert into public.contributions_digest_log (owner_id, digest_day, status, covered_until, claimed_at)
    values (v_owner.id, v_day, 'claimed', p_now, now())
    on conflict (owner_id, digest_day) do update
      set status = 'claimed', attempts = public.contributions_digest_log.attempts + 1,
          covered_until = excluded.covered_until, claimed_at = excluded.claimed_at
      where public.contributions_digest_log.status = 'failed'
        and public.contributions_digest_log.attempts < 2
    returning * into v_log;
    continue when v_log.id is null;

    v_limit := v_limit - 1;
    return query select v_log.id, v_owner.id, v_owner.email, v_log.covered_until, v_summary;
    v_log := null;
  end loop;
end;
$$;

-- Issue d'un envoi : sent (identifiant du fournisseur) ou failed (refus
-- explicite). Seule une ligne claimed change. Résultats : updated, refused.
create or replace function public.mark_contributions_digest_v1(p_digest_id uuid, p_status text, p_provider_message_id text default null)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_digest_id is null or p_status is null or p_status not in ('sent', 'failed') then
    raise exception 'invalid digest outcome' using errcode = '22023';
  end if;
  update public.contributions_digest_log
     set status = p_status,
         sent_at = case when p_status = 'sent' then now() end,
         provider_message_id = case when p_status = 'sent' then p_provider_message_id end
   where id = p_digest_id and status = 'claimed';
  if not found then
    return query select 'refused'::text;
    return;
  end if;
  return query select 'updated'::text;
end;
$$;

-- =====================================================================
-- 11. Privilèges
-- =====================================================================
-- Tables nouvelles : aucun privilège pour aucun rôle client (accès par
-- les RPC SECURITY DEFINER seulement). messages : lecture colonne par
-- colonne pour authenticated, sous la politique RLS existante
-- messages_select_own ; jamais idempotency_key ; aucune écriture client.

revoke all on table public.contribution_settings from public, anon, authenticated, service_role;
revoke all on table public.contribution_limits_override from public, anon, authenticated, service_role;
revoke all on table public.contribution_rate_limits from public, anon, authenticated, service_role;
revoke all on table public.memorial_contribution_categories from public, anon, authenticated, service_role;
revoke all on table public.owner_notification_preferences from public, anon, authenticated, service_role;
revoke all on table public.contributions_digest_log from public, anon, authenticated, service_role;

grant select (id, memorial_id, message_type, author_name, content, visible, created_at,
              status, caption, media_id, published_at, moderated_at)
  on table public.messages to authenticated;

-- Fonctions internes : exécutables par aucun rôle.
revoke all on function public.messages_align_visible_v1() from public, anon, authenticated, service_role;
revoke all on function public.contribution_features_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.sync_contribution_categories_on_publication_v1() from public, anon, authenticated, service_role;
revoke all on function public.contributions_rubric_public_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.contribution_categories_in_effect_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.public_memorial_message_allowed_v2(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.contribution_text_valid_v1(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.contribution_limits_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.contribution_rate_open_v1(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.contribution_rate_count_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.contribution_pending_photos_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
-- QG 017 : mêmes privilèges qu'avant (aucun rôle), réaffirmés après le
-- create or replace.
revoke all on function public.owner_free_storage_bytes_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.guard_free_storage_budget_v1() from public, anon, authenticated, service_role;

-- RPC : service_role seul.
revoke all on function public.submit_contribution_v1(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_contribution_photo_v1(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_contribution_photo_v1(text, uuid, text, text, uuid, text, bigint, integer, integer) from public, anon, authenticated;
revoke all on function public.read_public_contributions_v1(text, integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.moderate_contribution_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.remove_contribution_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.count_pending_contributions_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_contribution_categories_v1(uuid, uuid, boolean, boolean, boolean, bigint) from public, anon, authenticated;
revoke all on function public.set_contributions_digest_preference_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_contributions_digests_v1(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.mark_contributions_digest_v1(uuid, text, text) from public, anon, authenticated;

grant execute on function public.submit_contribution_v1(text, text, text, text, uuid) to service_role;
grant execute on function public.reserve_contribution_photo_v1(text, uuid, text, text) to service_role;
grant execute on function public.finalize_contribution_photo_v1(text, uuid, text, text, uuid, text, bigint, integer, integer) to service_role;
grant execute on function public.read_public_contributions_v1(text, integer, timestamptz, uuid) to service_role;
grant execute on function public.moderate_contribution_v1(uuid, uuid, text) to service_role;
grant execute on function public.remove_contribution_v1(uuid, uuid) to service_role;
grant execute on function public.count_pending_contributions_v1(uuid, uuid) to service_role;
grant execute on function public.set_contribution_categories_v1(uuid, uuid, boolean, boolean, boolean, bigint) to service_role;
grant execute on function public.set_contributions_digest_preference_v1(uuid, boolean) to service_role;
grant execute on function public.claim_contributions_digests_v1(timestamptz, integer) to service_role;
grant execute on function public.mark_contributions_digest_v1(uuid, text, text) to service_role;

comment on function public.public_memorial_message_allowed_v2(uuid, text) is
  'M8-E1. Droit de déposer : hommage public, rubrique Contributions non masquée dans la copie publiée, catégorie en vigueur (O9) ; condoléances, récits et photos dans les deux offres (D1) ; memory_message : règle QG 008 (complet). Interne.';
comment on function public.submit_contribution_v1(text, text, text, text, uuid) is
  'M8-E1. Dépôt d''une condoléance (published, D2) ou d''un récit (pending). Idempotent par clé ; doublon de contenu < 10 min ; plafonds R2. service_role seul.';
comment on function public.reserve_contribution_photo_v1(text, uuid, text, text) is
  'M8-E1. Réservation d''une photo de proche (média contribution pending) ; R2 et R3 (pending_full). service_role seul.';
comment on function public.finalize_contribution_photo_v1(text, uuid, text, text, uuid, text, bigint, integer, integer) is
  'M8-E1. Finalisation : mesures du fichier optimisé (O5 en E2), média ready, message photo pending. service_role seul.';
comment on function public.read_public_contributions_v1(text, integer, timestamptz, uuid) is
  'M8-E1. Lecture publique : publiées et autorisées seulement, ordre P1 (published_at desc, id desc), curseur, photos ready. service_role seul.';
comment on function public.moderate_contribution_v1(uuid, uuid, text) is
  'M8-E1. Modération familiale : approve, reject, hide, unhide ; jamais de réécriture. service_role seul, p_owner_id résolu par le serveur.';
comment on function public.remove_contribution_v1(uuid, uuid) is
  'M8-E1. Suppression familiale ; une photo part au nettoyage par réclamation (pending_media_cleanup_claims). service_role seul.';
comment on function public.set_contribution_categories_v1(uuid, uuid, boolean, boolean, boolean, bigint) is
  'M8-E1, O9/Q1. Catégories en vigueur changées immédiatement, brouillon aligné (révision + 1), copie publiée intacte. service_role seul.';

notify pgrst, 'reload schema';

commit;
