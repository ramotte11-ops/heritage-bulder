-- HERITAGE HOMMAGE — QG 017 : jusqu'à 3 hommages gratuits en préparation par compte.
-- Migration préparée, NON APPLIQUÉE à Supabase B (GO QG distinct).
--
-- Additive. Aucune fonction de quota, de fenêtre gratuite, d'ancrage ou de
-- publication n'est modifiée ; aucune donnée existante n'est touchée.
--
--   A. Réglage : free_active_drafts_per_owner 1 → 3. create_free_memorial_v1
--      et begin_guest_draft_transfer_v1 lisent déjà ce réglage : un 4e
--      brouillon gratuit actif est refusé (free_draft_limit /
--      active_draft_exists), rien n'est créé ni écrasé. Les hommages en offre
--      complète (payants) ne sont pas comptés (filtre access_level = 'avis'
--      inchangé).
--   B. Budget de stockage de l'offre gratuite, PAR COMPTE, en octets
--      (free_storage_bytes_per_owner, NULL = désactivé) : somme des médias
--      prêts des hommages du compte encore en offre gratuite (publiés ou non).
--      Aucun plafond en NOMBRE de photos : la préparation premium (50 photos
--      et plus) reste libre ; un hommage passé en offre complète sort du
--      budget. Rien n'est jamais supprimé : le budget ne bloque que les
--      NOUVEAUX envois au-delà de la limite (HD507).
--   C. Aperçu en lecture seule des échéances réelles qu'obtiendrait une
--      nouvelle sauvegarde (ou celles du brouillon déjà repris), calculé avec
--      les mêmes règles que anchor_free_memorial_v1 : la famille connaît sa
--      date limite avant de confirmer.
--
-- Rappels (inchangés, vérifiés par le banc) :
--   - une seule publication gratuite par compte sur 12 mois glissants :
--     guard_free_first_publication_v1 (HD403), sauf dérogation active ;
--   - un brouillon sauvegardé pendant la fenêtre gratuite du compte en hérite
--     l'ancre : même fin de publication gratuite, même fin de préparation ;
--   - un brouillon sauvegardé hors fenêtre n'a aucune publication gratuite et
--     hérite de la fin de préparation la plus lointaine des brouillons actifs ;
--     seul un brouillon sans autre brouillon actif reçoit ses propres 45 jours.
--
-- Retour arrière : nouvelle migration remettant free_active_drafts_per_owner
-- à 1 (les comptes ayant déjà 2 ou 3 brouillons les conservent) et, si
-- besoin, free_storage_bytes_per_owner à NULL.

-- ---------------------------------------------------------------------
-- A + B. Réglages
-- ---------------------------------------------------------------------
alter table public.memorial_access_settings
  add column free_storage_bytes_per_owner bigint,
  add constraint memorial_access_settings_free_storage_positive
    check (free_storage_bytes_per_owner is null or free_storage_bytes_per_owner > 0);

comment on column public.memorial_access_settings.free_storage_bytes_per_owner is
  'QG 017. Budget de stockage de l''offre gratuite par compte, en octets : somme des médias prêts des hommages du compte en niveau avis (publiés ou non). NULL = désactivé. Les hommages complets ne sont ni comptés ni plafonnés. Dépassement : nouvel envoi refusé (HD507), rien n''est supprimé.';

update public.memorial_access_settings
   set free_active_drafts_per_owner = 3,
       free_storage_bytes_per_owner = 300::bigint * 1024 * 1024,
       updated_at = now()
 where id;

-- ---------------------------------------------------------------------
-- B. Budget de stockage
-- ---------------------------------------------------------------------
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
     and md.status = 'ready';
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

create trigger media_guard_free_storage_budget
  before insert or update of status on public.media
  for each row execute function public.guard_free_storage_budget_v1();

-- ---------------------------------------------------------------------
-- C. Aperçu des échéances d'une sauvegarde (lecture seule)
-- ---------------------------------------------------------------------
-- Issues :
--   resume         ce brouillon local a déjà été sauvegardé : ses échéances
--   create         une nouvelle sauvegarde créerait un brouillon : échéances
--                  qu'il recevrait (mêmes règles qu'anchor_free_memorial_v1)
--   limit_reached  3 brouillons gratuits actifs : rien ne serait créé ;
--                  memorial_id = le plus récent
--   refused        compte inconnu
-- free_publish_until est NULL quand aucune publication gratuite n'est
-- possible pour ce brouillon (fenêtre close, quota utilisé, sans dérogation).
create or replace function public.preview_free_draft_save_v1(p_owner_id uuid, p_transfer_key text)
returns table (
  outcome text,
  active_free_drafts integer,
  max_free_drafts integer,
  memorial_id uuid,
  free_publish_until timestamptz,
  free_draft_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.memorial_access_settings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_active integer;
  v_memorial public.memorials%rowtype;
  v_status text;
  v_anchor timestamptz;
  v_prep timestamptz;
  v_latest uuid;
begin
  if p_owner_id is null then
    raise exception 'invalid free draft preview request' using errcode = '22023';
  end if;
  select * into v_settings from public.memorial_access_settings where id;
  if not found then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;
  perform 1 from public.owners o where o.id = p_owner_id;
  if not found then
    return query select 'refused'::text, 0, v_settings.free_active_drafts_per_owner,
                        null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;
  select count(*)::integer into v_active
    from public.memorials m
   where m.owner_id = p_owner_id
     and m.access_level = 'avis'
     and m.first_published_at is null
     and m.status <> 'archived'
     and (m.free_draft_until is null or v_now < m.free_draft_until);

  if p_transfer_key is not null then
    select m.* into v_memorial
      from public.guest_draft_transfers t
      join public.memorials m on m.id = t.memorial_id
     where t.owner_id = p_owner_id and t.transfer_key = p_transfer_key;
    if found then
      return query select 'resume'::text, v_active, v_settings.free_active_drafts_per_owner, v_memorial.id,
                          case when v_memorial.first_published_at is null
                                    and v_memorial.free_publish_until > v_now
                               then v_memorial.free_publish_until end,
                          v_memorial.free_draft_until;
      return;
    end if;
  end if;

  if v_active >= v_settings.free_active_drafts_per_owner then
    select m.id into v_latest
      from public.memorials m
     where m.owner_id = p_owner_id
       and m.access_level = 'avis'
       and m.first_published_at is null
       and m.status <> 'archived'
       and (m.free_draft_until is null or v_now < m.free_draft_until)
     order by m.created_at desc
     limit 1;
    return query select 'limit_reached'::text, v_active, v_settings.free_active_drafts_per_owner,
                        v_latest, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Mêmes branches que le premier ancrage d'anchor_free_memorial_v1.
  select s.outcome, s.anchor_at into v_status, v_anchor
    from public.free_window_status_v1(p_owner_id, v_now) s;
  if v_status = 'unavailable' then
    select max(m.free_draft_until) into v_prep
      from public.memorials m
     where m.owner_id = p_owner_id
       and m.access_level = 'avis'
       and m.first_published_at is null
       and m.free_draft_until > v_now;
    return query select 'create'::text, v_active, v_settings.free_active_drafts_per_owner, null::uuid,
                        null::timestamptz, coalesce(v_prep, v_now + v_settings.free_draft_retention);
    return;
  end if;
  return query select 'create'::text, v_active, v_settings.free_active_drafts_per_owner, null::uuid,
                      v_anchor + v_settings.free_publish_window,
                      v_anchor + v_settings.free_draft_retention;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits (C3 : toute fonction créée est fermée ; seuls ces EXECUTE sont
-- réaccordés).
-- ---------------------------------------------------------------------
revoke all on function public.owner_free_storage_bytes_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.guard_free_storage_budget_v1() from public, anon, authenticated, service_role;
revoke all on function public.preview_free_draft_save_v1(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.preview_free_draft_save_v1(uuid, text) to service_role;

comment on function public.preview_free_draft_save_v1(uuid, text) is
  'QG 017. Lecture seule, service_role. Échéances réelles d''une sauvegarde de brouillon invité (resume / create / limit_reached / refused), calculées avec les règles d''anchor_free_memorial_v1, pour les montrer avant confirmation.';
comment on function public.guard_free_storage_budget_v1() is
  'QG 017. Budget de stockage de l''offre gratuite par compte (free_storage_bytes_per_owner) : pré-contrôle à la réservation, contrôle exact à la finalisation (HD507). N''exécutable par aucun rôle applicatif.';
