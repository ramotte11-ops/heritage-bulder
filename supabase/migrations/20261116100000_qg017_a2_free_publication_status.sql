-- HERITAGE HOMMAGE — QG 017, lot A2 : source officielle de l'état du droit de
-- publication gratuite, pour l'espace famille.
-- Migration préparée, NON APPLIQUÉE à Supabase B (GO QG distinct).
--
-- Additive et en LECTURE SEULE. Aucune règle, aucun quota, aucune durée,
-- aucun droit n'est modifié : la fonction expose ce que décident déjà
-- free_window_status_v1 et free_access_window_v1 (utilisées par
-- anchor_free_memorial_v1) et ce que vérifie guard_free_first_publication_v1
-- (événements free.first_published sur la période, dérogations actives).
--
-- Fonctions STABLE : PostgreSQL y refuse toute écriture (aucun événement,
-- aucune échéance, aucune dérogation ne peut être touché par une lecture).

-- ---------------------------------------------------------------------
-- 1. Échéance exacte d'une période glissante
-- ---------------------------------------------------------------------
-- Les règles comptent un événement tant que « created_at > now - période ».
-- Il cesse donc de compter au plus petit instant t tel que
-- t - période >= created_at. Pour une période en heures, t = created_at +
-- période. Pour une période en mois, l'arithmétique calendaire peut tronquer
-- une fin de mois (29 février + 12 mois = 28 février) : t = created_at +
-- période ne suffit alors pas, et l'instant exact est le début du jour
-- suivant. Rien d'approché : chaque candidat est vérifié avec la même
-- inégalité que les règles ; NULL si aucun candidat n'est vérifié.
create or replace function public.free_period_end_v1(p_start timestamptz, p_period interval)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end timestamptz;
begin
  if p_start is null or p_period is null then
    return null;
  end if;
  v_end := p_start + p_period;
  for i in 1..3 loop
    if v_end - p_period >= p_start then
      return v_end;
    end if;
    v_end := pg_catalog.date_trunc('day', v_end) + interval '1 day';
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. État du droit de publication gratuite d'un compte
-- ---------------------------------------------------------------------
-- free_status (pour l'affichage) :
--   window_open          une fenêtre est ouverte : publication gratuite d'UN
--                        hommage possible jusqu'à window_until
--                        (window_status inherit | waiver_inherit)
--   opens_on_next_save   le compte a un droit, aucune fenêtre ouverte : elle
--                        s'ouvrira à la sauvegarde d'un NOUVEL hommage
--                        (window_status open_new | waiver_new)
--   used                 publication gratuite utilisée sur la période, sans
--                        dérogation utilisable (window_status unavailable)
--   expired              fenêtre écoulée sans publication, sans dérogation
--                        utilisable (window_status unavailable)
--   refused              compte inconnu
-- renewal :
--   not_applicable       un droit est disponible (renews_at NULL)
--   scheduled            renews_at = instant exact où le compte retrouve un
--                        droit (fin de la période des publications ET du
--                        cycle de fenêtre), vérifié par free_window_status_v1
--   undetermined         aucune date sûre (renews_at NULL) : l'interface
--                        n'affiche alors aucune date
create or replace function public.owner_free_publication_status_v1(p_owner_id uuid)
returns table (
  free_status text,
  window_status text,
  window_until timestamptz,
  quota_used boolean,
  publications_in_period integer,
  waiver_active boolean,
  renews_at timestamptz,
  renewal text,
  active_free_drafts integer,
  max_free_drafts integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.memorial_access_settings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_anchor timestamptz;
  v_window_opened timestamptz;
  v_publications integer;
  v_quota_used boolean;
  v_waiver boolean;
  v_active integer;
  v_free_status text;
  v_until timestamptz;
  v_pub_end timestamptz;
  v_window_end timestamptz;
  v_renews timestamptz;
  v_renewal text := 'not_applicable';
  v_check text;
begin
  if p_owner_id is null then
    raise exception 'invalid free publication status request' using errcode = '22023';
  end if;
  select * into v_settings from public.memorial_access_settings where id;
  if not found then
    raise exception 'memorial access settings missing' using errcode = 'HD500';
  end if;
  perform 1 from public.owners o where o.id = p_owner_id;
  if not found then
    return query select 'refused'::text, null::text, null::timestamptz, null::boolean, null::integer,
                        null::boolean, null::timestamptz, 'undetermined'::text, null::integer,
                        v_settings.free_active_drafts_per_owner;
    return;
  end if;

  -- Les règles elles-mêmes, au même instant.
  select s.outcome, s.anchor_at into v_status, v_anchor
    from public.free_window_status_v1(p_owner_id, v_now) s;
  select w.window_opened_at, w.publications into v_window_opened, v_publications
    from public.free_access_window_v1(p_owner_id, v_now) w;
  v_quota_used := v_publications >= v_settings.free_publications_per_owner;
  v_waiver := exists (
    select 1 from public.free_publication_waivers w
     where w.owner_id = p_owner_id and w.consumed_at is null and w.revoked_at is null);

  -- Même prédicat que create_free_memorial_v1.
  select count(*)::integer into v_active
    from public.memorials m
   where m.owner_id = p_owner_id
     and m.access_level = 'avis'
     and m.first_published_at is null
     and m.status <> 'archived'
     and (m.free_draft_until is null or v_now < m.free_draft_until);

  if v_status in ('inherit', 'waiver_inherit') then
    v_free_status := 'window_open';
    v_until := v_anchor + v_settings.free_publish_window;
  elsif v_status in ('open_new', 'waiver_new') then
    v_free_status := 'opens_on_next_save';
  else
    v_free_status := case when v_quota_used then 'used' else 'expired' end;
    -- Le compte retrouve un droit quand (a) assez de publications gratuites
    -- sont sorties de la période pour repasser sous le quota ET (b) plus
    -- aucune fenêtre n'a été ouverte dans le cycle.
    if v_quota_used then
      select public.free_period_end_v1(ev.created_at, v_settings.free_publication_quota_window)
        into v_pub_end
        from public.memorial_access_events ev
       where ev.owner_id = p_owner_id
         and ev.event = 'free.first_published'
         and ev.created_at > v_now - v_settings.free_publication_quota_window
       order by ev.created_at
       offset (v_publications - v_settings.free_publications_per_owner)
       limit 1;
    end if;
    if v_window_opened is not null then
      v_window_end := public.free_period_end_v1(v_window_opened, v_settings.free_window_cycle);
    end if;
    v_renews := greatest(v_pub_end, v_window_end);
    if v_renews is null
       or (v_quota_used and v_pub_end is null)
       or (v_window_opened is not null and v_window_end is null) then
      v_renews := null;
      v_renewal := 'undetermined';
    else
      -- Contre-vérification par la règle elle-même : à cet instant, le
      -- compte doit avoir retrouvé un droit ; sinon aucune date n'est donnée.
      select s.outcome into v_check from public.free_window_status_v1(p_owner_id, v_renews) s;
      if v_check in ('open_new', 'waiver_new') then
        v_renewal := 'scheduled';
      else
        v_renews := null;
        v_renewal := 'undetermined';
      end if;
    end if;
  end if;

  return query select v_free_status, v_status, v_until, v_quota_used, v_publications, v_waiver,
                      v_renews, v_renewal, v_active, v_settings.free_active_drafts_per_owner;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits. L'identifiant du compte vient de la session serveur : seul
-- service_role peut appeler (un rôle authentifié pourrait sinon interroger
-- le compte d'autrui). Le calcul d'échéance n'est exécutable par aucun rôle
-- applicatif. C3 : toute fonction créée est fermée, seul cet EXECUTE est
-- réaccordé.
-- ---------------------------------------------------------------------
revoke all on function public.free_period_end_v1(timestamptz, interval) from public, anon, authenticated, service_role;
revoke all on function public.owner_free_publication_status_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function public.owner_free_publication_status_v1(uuid) to service_role;

comment on function public.owner_free_publication_status_v1(uuid) is
  'QG 017 A2. Lecture seule, service_role. État du droit de publication gratuite d''un compte, calculé par les règles qui font autorité (free_window_status_v1, free_access_window_v1, événements, dérogations) : free_status, fenêtre utilisable, quota, dérogation, renouvellement exact (ou undetermined), brouillons gratuits actifs.';
comment on function public.free_period_end_v1(timestamptz, interval) is
  'QG 017 A2. Plus petit instant t tel que t - période >= début (même inégalité que les règles de période glissante) ; NULL si indéterminable. N''est exécutable par aucun rôle applicatif.';
