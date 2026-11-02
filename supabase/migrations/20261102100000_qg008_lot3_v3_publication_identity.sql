-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 3 — v3 : identité complète du second appel
-- =====================================================================
-- Correction de 20261102090000 (append-only : ce fichier remplace la
-- fonction, il ne modifie pas l'ancien). Revue finale QG : dans la branche
-- « already_published », un second appel dont la langue, le skin, la
-- variante ou le slug attendus divergeaient de ceux du mémorial publié
-- (ou valaient NULL) était reconnu comme la même publication. Aucune
-- écriture n'en résultait, mais c'était un faux succès.
--
-- Changements, et rien d'autre :
--   1. ces quatre paramètres et le niveau d'accès sont obligatoires dès
--      l'entrée (22023), comme dans commit_memorial_publication_v2 ;
--   2. la branche « already_published » exige aussi
--      language / skin_id / skin_variant / slug égaux aux valeurs attendues ;
--      sinon 40001, comme partout ailleurs.
-- Première publication, photo principale (HD422), passage ready -> v2,
-- privilèges (service_role seul), SECURITY DEFINER et search_path vide :
-- inchangés.
-- =====================================================================

create or replace function public.commit_memorial_publication_v3(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_expected_revision bigint,
  p_expected_language text,
  p_expected_skin text,
  p_expected_skin_variant text,
  p_expected_slug text,
  p_expected_access_level text,
  p_expected_content jsonb,
  p_published_content jsonb
)
returns table (published_at timestamptz, first_published_at timestamptz, revision bigint, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_draft_content jsonb;
  v_draft_revision bigint;
  v_published_hero text;
  v_draft_hero text;
  v_snapshot_published_at timestamptz;
begin
  if p_memorial_id is null
     or p_owner_id is null
     or p_expected_revision is null
     or p_expected_content is null
     or p_published_content is null
     or jsonb_typeof(p_published_content) is distinct from 'object'
     or p_expected_language is null
     or p_expected_skin is null
     or p_expected_skin_variant is null
     or nullif(btrim(p_expected_slug), '') is null
     or p_expected_access_level is null then
    raise exception 'invalid memorial publication request' using errcode = '22023';
  end if;

  select * into v_memorial
    from public.memorials
   where id = p_memorial_id
   for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'memorial publication refused' using errcode = '42501';
  end if;

  select d.content, d.revision into v_draft_content, v_draft_revision
    from public.memorial_drafts as d
   where d.memorial_id = p_memorial_id
   for update;
  if not found then
    raise exception 'memorial draft changed' using errcode = '40001';
  end if;

  -- Second appel (double clic, onglet concurrent) : un succès n'est rendu
  -- que si l'identité EXACTE de la publication déjà faite est démontrée ici,
  -- sous verrou — même révision et même contenu de brouillon, même niveau
  -- d'accès, même langue, skin, variante et slug que le mémorial publié
  -- (les contrôles que v2 aurait faits), copie publiée strictement égale au
  -- contenu demandé. Rien n'est réécrit. Toute autre situation est un conflit.
  if v_memorial.status = 'published' and v_memorial.first_published_at is not null then
    select s.published_at into v_snapshot_published_at
      from public.memorial_published_snapshots as s
     where s.memorial_id = p_memorial_id
       and s.content = p_published_content;
    if found
       and v_draft_revision = p_expected_revision
       and v_draft_content = p_expected_content
       and v_memorial.access_level is not distinct from p_expected_access_level
       and v_memorial.language is not distinct from p_expected_language
       and v_memorial.skin_id is not distinct from p_expected_skin
       and v_memorial.skin_variant is not distinct from p_expected_skin_variant
       and v_memorial.slug is not distinct from p_expected_slug then
      return query select v_snapshot_published_at, v_memorial.first_published_at, v_draft_revision, 'already_published'::text;
      return;
    end if;
    raise exception 'memorial lifecycle changed' using errcode = '40001';
  end if;

  -- Première publication seulement : un brouillon jamais publié.
  if v_memorial.status is distinct from 'draft'
     or v_memorial.first_published_at is not null then
    raise exception 'memorial lifecycle changed' using errcode = '40001';
  end if;

  -- Photo principale : celle du brouillon verrouillé, prête, de ce mémorial.
  v_published_hero := p_published_content #>> '{hero,photo,mediaId}';
  v_draft_hero := v_draft_content #>> '{hero,photo,mediaId}';
  if v_published_hero is null
     or v_published_hero !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or v_draft_hero is distinct from v_published_hero
     or not exists (
       select 1
         from public.media md
        where md.id = v_published_hero::uuid
          and md.memorial_id = p_memorial_id
          and md.purpose = 'hero'
          and md.status = 'ready'
     ) then
    raise exception 'hero photo required' using errcode = 'HD422';
  end if;

  -- draft -> ready, dans cette même transaction (annulé avec elle).
  update public.memorials
     set status = 'ready'
   where id = p_memorial_id;

  -- ready -> published : la transaction V8, inchangée.
  return query
    select v2.published_at, v2.first_published_at, v2.revision, 'published'::text
      from public.commit_memorial_publication_v2(
        p_memorial_id,
        p_owner_id,
        p_expected_revision,
        'ready',
        null,
        p_expected_language,
        p_expected_skin,
        p_expected_skin_variant,
        p_expected_slug,
        p_expected_access_level,
        p_expected_content,
        p_published_content
      ) as v2;
end;
$$;

comment on function public.commit_memorial_publication_v3(uuid, uuid, bigint, text, text, text, text, text, jsonb, jsonb) is
  'QG 008 Lot 3. Première publication depuis l''aperçu privé : draft -> ready -> published en UNE transaction (aucun ready persistant en cas d''échec), photo principale obligatoire (HD422 : média ready, purpose hero, de ce mémorial, identique au brouillon), puis commit_memorial_publication_v2 inchangée (verrous, CAS, niveau d''accès, galerie issue du brouillon, déclencheurs gratuits et copie avis). Second appel : already_published uniquement si l''identité exacte de la publication faite est démontrée sous verrou (révision, contenu, niveau d''accès, langue, skin, variante, slug, copie publiée), sinon 40001. service_role seul. La republication reste sur v2.';

revoke all on function public.commit_memorial_publication_v3(uuid, uuid, bigint, text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_memorial_publication_v3(uuid, uuid, bigint, text, text, text, text, text, jsonb, jsonb) to service_role;
