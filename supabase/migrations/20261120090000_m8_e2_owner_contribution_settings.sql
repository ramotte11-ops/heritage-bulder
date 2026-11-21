-- HERITAGE HOMMAGE — M8-E2 : lecture des réglages Contributions d'un hommage
-- pour la famille (Tableau de bord, A15 après publication).
--
-- Écrite et testée en local (npm run db:test) ; NON appliquée. Son
-- application relève de E6, avec 20261119090000_m8_e1_contributions.sql.
-- Retour arrière : supabase/rollbacks/20261120090000_m8_e2_owner_contribution_settings.down.sql.
--
-- Pourquoi : E1 écrit les catégories en vigueur (O9) et la préférence de
-- récapitulatif (O12) dans des tables sans aucun privilège client ; rien
-- ne permettait à la famille de LIRE leur état courant pour afficher ses
-- interrupteurs. Une seule fonction, en lecture seule, service_role avec
-- p_owner_id résolu côté serveur (même modèle que les RPC familiales E1).
--
-- Catégories renvoyées : après la première publication, le réglage EN
-- VIGUEUR (contribution_categories_in_effect_v1) ; avant, les choix du
-- brouillon (A15). draft_revision permet au Builder de passer
-- p_expected_revision à set_contribution_categories_v1.

begin;

create or replace function public.read_owner_contribution_settings_v1(p_owner_id uuid, p_memorial_id uuid)
returns table (
  outcome text,
  condolences boolean,
  stories boolean,
  photos boolean,
  first_published boolean,
  draft_revision bigint,
  contributions_digest boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_revision bigint;
  v_draft jsonb;
  v_features jsonb;
  v_digest boolean;
begin
  if p_owner_id is null or p_memorial_id is null then
    raise exception 'invalid contribution settings request' using errcode = '22023';
  end if;
  select * into v_memorial from public.memorials m where m.id = p_memorial_id;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    return query select 'refused'::text, null::boolean, null::boolean, null::boolean, null::boolean, null::bigint, null::boolean;
    return;
  end if;
  select d.revision, d.content into v_revision, v_draft
    from public.memorial_drafts d where d.memorial_id = p_memorial_id;
  if v_memorial.first_published_at is not null then
    v_features := public.contribution_categories_in_effect_v1(p_memorial_id);
  else
    v_features := public.contribution_features_v1(coalesce(v_draft, '{}'::jsonb));
  end if;
  select p.contributions_digest into v_digest
    from public.owner_notification_preferences p where p.owner_id = p_owner_id;
  if v_features is null then
    -- Choix illisibles dans le brouillon : la famille voit tout fermé et
    -- le Builder affiche son message calme (comme A15).
    return query select 'corrupted'::text, false, false, false, false, v_revision, coalesce(v_digest, false);
    return;
  end if;
  return query select 'ok'::text,
                      (v_features ->> 'condolences')::boolean,
                      (v_features ->> 'stories')::boolean,
                      (v_features ->> 'photos')::boolean,
                      v_memorial.first_published_at is not null,
                      v_revision,
                      coalesce(v_digest, false);
end;
$$;

revoke all on function public.read_owner_contribution_settings_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_owner_contribution_settings_v1(uuid, uuid) to service_role;

comment on function public.read_owner_contribution_settings_v1(uuid, uuid) is
  'M8-E2. Lecture familiale : catégories (en vigueur après publication, brouillon avant), révision du brouillon, préférence de récapitulatif (false par défaut). service_role seul, p_owner_id résolu par le serveur.';

notify pgrst, 'reload schema';

commit;
