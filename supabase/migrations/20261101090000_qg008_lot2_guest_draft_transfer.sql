-- HERITAGE HOMMAGE — QG 008, Lot 2 : Builder invité → brouillon durable.
--
-- Additive. Dépend de 20261031120000_qg008_free_offer_v8_alignment.sql
-- (create_free_memorial_v1, anchor_free_memorial_v1 alignés V8).
--
-- Le brouillon invité vit dans le navigateur (IndexedDB). Quand la famille
-- demande son enregistrement durable et que son adresse est vérifiée
-- (lien magique Supabase), le serveur :
--   1. crée UN brouillon pour le propriétaire vérifié et l'ancre — premier
--      enregistrement durable : les 45 jours de préparation commencent ici,
--      jamais à l'ouverture du Builder invité ; les 10 jours ne concernent
--      que la publication gratuite ; le quota ne bloque rien (Lot 1) ;
--   2. reçoit les photographies par la chaîne média existante et note la
--      correspondance photo locale → média serveur ;
--   3. enregistre le contenu, puis clôt le transfert.
--
-- Idempotence : la clé de transfert (transferKey du brouillon local, tirée
-- une fois et jamais régénérée) identifie le transfert POUR UN propriétaire.
-- Une reprise, une reconnexion ou un double onglet retrouvent le même
-- brouillon : aucune échéance n'est recalculée, aucune photo n'est
-- réenvoyée deux fois.
--
-- Rien n'est jamais attribué à une adresse non vérifiée : ces fonctions
-- reçoivent un owner_id que le serveur n'obtient que d'une session dont
-- l'adresse est confirmée (lib/entitlement/resolve-owner.ts).

create table public.guest_draft_transfers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners (id) on delete restrict,
  transfer_key text not null,
  memorial_id uuid not null references public.memorials (id) on delete restrict,
  source_revision bigint not null,
  base_draft_revision bigint not null,
  media_map jsonb not null default '{}'::jsonb,
  status text not null default 'started',
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint guest_draft_transfers_key_format
    check (transfer_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint guest_draft_transfers_revisions
    check (source_revision >= 0 and base_draft_revision >= 0),
  constraint guest_draft_transfers_media_map_object
    check (jsonb_typeof(media_map) = 'object'),
  constraint guest_draft_transfers_status
    check (status in ('started', 'completed')),
  constraint guest_draft_transfers_completed_coherent
    check ((status = 'completed') = (completed_at is not null))
);

create unique index guest_draft_transfers_owner_key
  on public.guest_draft_transfers (owner_id, transfer_key);
create unique index guest_draft_transfers_memorial
  on public.guest_draft_transfers (memorial_id);

comment on table public.guest_draft_transfers is
  'QG 008 Lot 2. Un transfert d''un brouillon invité (navigateur) vers UN brouillon durable d''un propriétaire vérifié. Clé = (owner_id, transfer_key). media_map : photo locale → média serveur prêt de ce mémorial. Écrite uniquement par les fonctions Lot 2 ; aucun rôle applicatif n''y a accès.';

alter table public.guest_draft_transfers enable row level security;
revoke all privileges on table public.guest_draft_transfers from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Début (ou reprise) d'un transfert
-- ---------------------------------------------------------------------
-- Issues :
--   created              brouillon créé et ancré pour ce transfert
--   resumed              ce transfert existe déjà : même brouillon, mêmes
--                        échéances, correspondances déjà notées
--   active_draft_exists  le propriétaire a déjà un brouillon actif (un seul
--                        brouillon par propriétaire) : rien n'est créé ni
--                        écrasé ; memorial_id désigne ce brouillon
--   refused              propriétaire inconnu
create or replace function public.begin_guest_draft_transfer_v1(
  p_owner_id uuid,
  p_transfer_key text,
  p_source_revision bigint,
  p_skin_variant text,
  p_language text
)
returns table (
  outcome text,
  memorial_id uuid,
  transfer_status text,
  media_map jsonb,
  draft_revision bigint,
  anchor_outcome text,
  free_publish_until timestamptz,
  free_draft_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.guest_draft_transfers%rowtype;
  v_created record;
  v_anchor record;
  v_memorial uuid;
  v_revision bigint;
  v_existing uuid;
begin
  if p_owner_id is null
     or p_transfer_key is null
     or p_transfer_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or p_source_revision is null or p_source_revision < 0
     or p_skin_variant is null or p_skin_variant not in ('light', 'dark')
     or (p_language is not null and p_language not in ('fr', 'en', 'es')) then
    raise exception 'invalid guest draft transfer request' using errcode = '22023';
  end if;

  -- Sérialise les transferts d'un même propriétaire (double onglet).
  perform 1 from public.owners o where o.id = p_owner_id for update;
  if not found then
    return query select 'refused'::text, null::uuid, null::text, null::jsonb, null::bigint,
                        null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_transfer
    from public.guest_draft_transfers t
   where t.owner_id = p_owner_id and t.transfer_key = p_transfer_key;
  if found then
    return query
      select 'resumed'::text, v_transfer.memorial_id, v_transfer.status, v_transfer.media_map,
             d.revision, 'already_anchored'::text, m.free_publish_until, m.free_draft_until
        from public.memorials m
        join public.memorial_drafts d on d.memorial_id = m.id
       where m.id = v_transfer.memorial_id;
    return;
  end if;

  select * into v_created from public.create_free_memorial_v1(p_owner_id, 'intemporel', p_skin_variant);
  if v_created.outcome = 'free_draft_limit' then
    select m.id into v_existing
      from public.memorials m
     where m.owner_id = p_owner_id
       and m.access_level = 'avis'
       and m.first_published_at is null
       and m.status <> 'archived'
       and (m.free_draft_until is null or clock_timestamp() < m.free_draft_until)
     order by m.created_at desc
     limit 1;
    return query select 'active_draft_exists'::text, v_existing, null::text, null::jsonb, null::bigint,
                        null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_created.outcome is distinct from 'created' then
    return query select 'refused'::text, null::uuid, null::text, null::jsonb, null::bigint,
                        null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  v_memorial := v_created.memorial_id;

  -- Premier enregistrement durable : ancrage (Lot 1). Sans droit gratuit,
  -- le brouillon est ancré quand même : le Builder n'est jamais bloqué.
  select * into v_anchor from public.anchor_free_memorial_v1(v_memorial, p_owner_id);

  -- La langue choisie par la famille dans le Builder invité (T01). Le
  -- mémorial vient d'être créé dans cette transaction : rien à écraser.
  if p_language is not null then
    update public.memorials set language = p_language
     where id = v_memorial and language is null;
  end if;

  select d.revision into v_revision from public.memorial_drafts d where d.memorial_id = v_memorial;
  insert into public.guest_draft_transfers
    (owner_id, transfer_key, memorial_id, source_revision, base_draft_revision)
  values
    (p_owner_id, p_transfer_key, v_memorial, p_source_revision, v_revision);

  return query select 'created'::text, v_memorial, 'started'::text, '{}'::jsonb, v_revision,
                      v_anchor.outcome, v_anchor.free_publish_until, v_anchor.free_draft_until;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Correspondance photo locale → média serveur
-- ---------------------------------------------------------------------
-- Le média doit appartenir au mémorial du transfert et au propriétaire,
-- être prêt (finalisé, octets vérifiés) et avoir le rôle annoncé. Une
-- photo locale ne correspond qu'à un média ; un média qu'à une photo.
create or replace function public.record_guest_draft_transfer_media_v1(
  p_owner_id uuid,
  p_transfer_key text,
  p_local_id text,
  p_media_id uuid,
  p_purpose text
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.guest_draft_transfers%rowtype;
  v_media public.media%rowtype;
  v_current text;
begin
  if p_owner_id is null or p_transfer_key is null or p_media_id is null
     or p_local_id is null or p_local_id !~ '^[A-Za-z0-9_-]{1,64}$'
     or p_purpose is null or p_purpose not in ('hero', 'gallery') then
    raise exception 'invalid guest draft transfer media' using errcode = '22023';
  end if;
  select * into v_transfer
    from public.guest_draft_transfers t
   where t.owner_id = p_owner_id and t.transfer_key = p_transfer_key
   for update;
  if not found or v_transfer.status <> 'started' then
    return query select 'refused'::text;
    return;
  end if;
  select * into v_media from public.media md where md.id = p_media_id;
  if not found
     or v_media.memorial_id is distinct from v_transfer.memorial_id
     or v_media.owner_id is distinct from p_owner_id
     or v_media.status <> 'ready'
     or v_media.purpose is distinct from p_purpose then
    return query select 'refused'::text;
    return;
  end if;
  v_current := v_transfer.media_map ->> p_local_id;
  if v_current is not null then
    if v_current = p_media_id::text then
      return query select 'already_recorded'::text;
    else
      return query select 'conflict'::text;
    end if;
    return;
  end if;
  if exists (select 1 from jsonb_each_text(v_transfer.media_map) e where e.value = p_media_id::text) then
    return query select 'conflict'::text;
    return;
  end if;
  update public.guest_draft_transfers
     set media_map = media_map || jsonb_build_object(p_local_id, p_media_id::text)
   where id = v_transfer.id;
  return query select 'recorded'::text;
end;
$$;

-- ---------------------------------------------------------------------
-- 2 bis. Lecture d'un transfert (ne crée JAMAIS rien)
-- ---------------------------------------------------------------------
create or replace function public.find_guest_draft_transfer_v1(
  p_owner_id uuid,
  p_transfer_key text
)
returns table (memorial_id uuid, transfer_status text, media_map jsonb, base_draft_revision bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.memorial_id, t.status, t.media_map, t.base_draft_revision
    from public.guest_draft_transfers t
   where t.owner_id = p_owner_id and t.transfer_key = p_transfer_key;
$$;

-- ---------------------------------------------------------------------
-- 3. Clôture
-- ---------------------------------------------------------------------
create or replace function public.complete_guest_draft_transfer_v1(
  p_owner_id uuid,
  p_transfer_key text
)
returns table (outcome text, memorial_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.guest_draft_transfers%rowtype;
begin
  if p_owner_id is null or p_transfer_key is null then
    raise exception 'invalid guest draft transfer request' using errcode = '22023';
  end if;
  select * into v_transfer
    from public.guest_draft_transfers t
   where t.owner_id = p_owner_id and t.transfer_key = p_transfer_key
   for update;
  if not found then
    return query select 'refused'::text, null::uuid;
    return;
  end if;
  if v_transfer.status = 'completed' then
    return query select 'already_completed'::text, v_transfer.memorial_id;
    return;
  end if;
  update public.guest_draft_transfers
     set status = 'completed', completed_at = clock_timestamp()
   where id = v_transfer.id;
  return query select 'completed'::text, v_transfer.memorial_id;
end;
$$;

revoke all on function public.begin_guest_draft_transfer_v1(uuid, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.record_guest_draft_transfer_media_v1(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_guest_draft_transfer_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.find_guest_draft_transfer_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_guest_draft_transfer_v1(uuid, text, bigint, text, text) to service_role;
grant execute on function public.record_guest_draft_transfer_media_v1(uuid, text, text, uuid, text) to service_role;
grant execute on function public.complete_guest_draft_transfer_v1(uuid, text) to service_role;
grant execute on function public.find_guest_draft_transfer_v1(uuid, text) to service_role;

comment on function public.begin_guest_draft_transfer_v1(uuid, text, bigint, text, text) is
  'QG 008 Lot 2. Premier enregistrement durable d''un brouillon invité pour un propriétaire VÉRIFIÉ : crée et ancre UN brouillon (45 j de préparation à partir d''ici ; quota non bloquant), ou reprend le transfert existant (aucune échéance recalculée). « active_draft_exists » si le propriétaire a déjà un brouillon actif : rien n''est créé ni écrasé. service_role seul.';
comment on function public.record_guest_draft_transfer_media_v1(uuid, text, text, uuid, text) is
  'QG 008 Lot 2. Note la correspondance photo locale → média serveur PRÊT de ce mémorial et de ce propriétaire ; idempotente ; refuse un média étranger, non finalisé ou d''un autre rôle. service_role seul.';
comment on function public.complete_guest_draft_transfer_v1(uuid, text) is
  'QG 008 Lot 2. Clôt un transfert (idempotente). service_role seul.';

notify pgrst, 'reload schema';
