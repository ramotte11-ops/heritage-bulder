-- HERITAGE Direct — M1-A, correctif 1 : une seule fenêtre de publication
-- gratuite par adresse e-mail vérifiée, renouvelable après douze mois.
--
-- Corrige 20261024180000_heritage_direct_access_foundation.sql, qui
-- posait l'ancre PAR BROUILLON : laisser expirer un brouillon jamais
-- publié puis en créer un autre ouvrait un nouveau délai de 7 jours.
--
-- Contrat PO : 1 publication gratuite par adresse e-mail vérifiée sur
-- 12 mois ; 1 seul brouillon gratuit actif ; l'ancre est la première
-- confirmation effective de l'e-mail, enregistrée une seule fois (B1).
--
-- Adresse e-mail vérifiée = propriétaire. owners.email est unique sans
-- tenir compte de la casse (owners_email_key), un propriétaire n'est créé
-- qu'à partir d'une adresse confirmée (lib/entitlement/resolve-owner.ts),
-- et aucun chemin applicatif ne modifie owners.email. La section D rend
-- cette équivalence opposable en base pour tout propriétaire qui a un
-- historique gratuit.
--
-- Règle :
--   * la fenêtre gratuite d'une adresse s'ouvre à la première
--     confirmation (événement « free.window_opened », une fois par cycle)
--     et dure 12 mois ;
--   * tout brouillon gratuit ancré pendant le cycle hérite de cette ancre :
--     même fin de publication gratuite (A+7 j), même fin de conservation
--     (A+45 j) — recréer un brouillon n'ouvre aucun nouveau délai ;
--   * hors fenêtre de publication, ou quota consommé, la création et
--     l'ancrage d'un brouillon gratuit répondent « free_unavailable »,
--     sans rien écrire ;
--   * un nouveau cycle s'ouvre quand le précédent a plus de 12 mois ET
--     qu'aucune publication gratuite n'a eu lieu dans les 12 derniers
--     mois : le renouvellement reste possible, sans jamais permettre deux
--     publications gratuites à moins de 12 mois d'intervalle.
--
-- Additive : seules create_free_memorial_v1 et anchor_free_memorial_v1
-- sont remplacées (même signature). Le garde-fou de publication, le
-- quota de galerie, le passage au complet et toutes les fonctions
-- antérieures à M1-A restent inchangés.

-- ---------------------------------------------------------------------
-- A. Journal : l'ouverture de fenêtre devient un événement
-- ---------------------------------------------------------------------

alter table public.memorial_access_events
  drop constraint memorial_access_events_event_check;
alter table public.memorial_access_events
  add constraint memorial_access_events_event_check
  check (event in ('free.created', 'free.window_opened', 'free.anchored',
                   'free.first_published', 'access.upgraded'));

comment on table public.memorial_access_events is
  'HERITAGE Direct M1-A. Journal en ajout seul des événements d''accès : création d''un brouillon gratuit, ouverture de la fenêtre gratuite d''une adresse (une fois par cycle de 12 mois), ancrage d''un brouillon, première publication gratuite (base du quota B6), passage au complet (référence externe unique : un paiement ne sert qu''une fois). Aucune donnée personnelle. Écrit uniquement par les fonctions M1-A ; aucun rôle applicatif n''y a accès.';

-- ---------------------------------------------------------------------
-- B. État gratuit d'une adresse (propriétaire), à l'instant donné
-- ---------------------------------------------------------------------
-- window_opened_at : ancre du cycle en cours (NULL si aucun cycle ouvert
-- depuis moins de 12 mois). publications : premières publications
-- gratuites des 12 derniers mois. Lue sous le verrou du propriétaire par
-- les deux fonctions ci-dessous.
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

-- ---------------------------------------------------------------------
-- C. Création et ancrage
-- ---------------------------------------------------------------------

-- C1. Crée un brouillon gratuit. Nouveau refus « free_unavailable » :
-- l'adresse ne peut plus publier gratuitement dans son cycle (fenêtre de
-- 7 jours passée, ou publication gratuite déjà faite depuis moins de
-- 12 mois). Rien n'est écrit.
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

-- C2. Ancre un brouillon gratuit (B1). L'ancre est celle de l'ADRESSE :
-- la première confirmation du cycle ouvre la fenêtre, tout brouillon
-- ancré ensuite dans le même cycle en hérite. Idempotente : un second
-- appel ne déplace jamais les échéances. Verrous : mémorial, puis
-- propriétaire (même ordre que le garde-fou de publication).
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

-- ---------------------------------------------------------------------
-- D. L'adresse d'un propriétaire qui a un historique gratuit est figée
-- ---------------------------------------------------------------------
-- Sans cela, changer owners.email libérerait l'ancienne adresse, qu'un
-- nouveau compte pourrait reprendre avec un quota neuf. Aucun chemin
-- applicatif ne modifie owners.email aujourd'hui ; un futur changement
-- d'adresse (M3) devra transporter l'historique et lever ce verrou par
-- une migration dédiée.
create or replace function public.owners_guard_free_email_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(new.email)) is distinct from lower(btrim(old.email))
     and exists (select 1 from public.memorial_access_events ev where ev.owner_id = old.id) then
    raise exception 'owner e-mail is bound to its free access history' using errcode = 'HD423';
  end if;
  return new;
end;
$$;

create trigger owners_guard_free_email
before update of email on public.owners
for each row execute function public.owners_guard_free_email_v1();

-- ---------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------

revoke all on function public.free_access_window_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.owners_guard_free_email_v1() from public, anon, authenticated, service_role;

-- create or replace conserve les privilèges ; réaffirmés ici.
revoke all on function public.create_free_memorial_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.anchor_free_memorial_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_free_memorial_v1(uuid, text, text) to service_role;
grant execute on function public.anchor_free_memorial_v1(uuid, uuid) to service_role;

comment on function public.free_access_window_v1(uuid, timestamptz) is
  'HERITAGE Direct M1-A, correctif 1. Ancre du cycle gratuit en cours d''une adresse (propriétaire) et nombre de premières publications gratuites sur 12 mois. Interne : exécutable par aucun rôle.';
comment on function public.create_free_memorial_v1(uuid, text, text) is
  'HERITAGE Direct M1-A. Crée un brouillon gratuit (droit direct « avis » + redeem_entitlement inchangée, une transaction). B6 : « free_draft_limit » si un brouillon gratuit est actif ; « free_unavailable » si l''adresse ne peut plus publier gratuitement dans son cycle. service_role seul.';
comment on function public.anchor_free_memorial_v1(uuid, uuid) is
  'HERITAGE Direct M1-A (B1). Ancre un brouillon gratuit sur la fenêtre de son ADRESSE : la première confirmation du cycle l''ouvre (heure de la base), les brouillons suivants en héritent ; +7 j publication gratuite, +45 j conservation. « free_unavailable » hors fenêtre ou quota consommé. Idempotente. service_role seul.';
comment on function public.owners_guard_free_email_v1() is
  'HERITAGE Direct M1-A, correctif 1. Refuse (HD423) de changer l''adresse d''un propriétaire qui a un historique gratuit : le quota suit l''adresse vérifiée.';
