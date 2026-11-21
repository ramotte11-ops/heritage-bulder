-- HERITAGE HOMMAGE — M8-E3 : vue d'ensemble publique de la rubrique
-- « Contributions des proches ».
--
-- Écrite et testée en local (npm run db:test) ; NON appliquée. Son
-- application relève de E6, avec 20261119090000 (E1) et 20261120090000 (E2).
-- Retour arrière : supabase/rollbacks/20261121090000_m8_e3_public_contributions_overview.down.sql.
--
-- Pourquoi : la page publique doit savoir, AU MOMENT DE LA VISITE, quelles
-- catégories sont en vigueur (O9 : une désactivation par la famille prend
-- effet immédiatement, sans republication) et combien de contributions
-- publiées chacune compte (O8 : chaque catégorie disponible représentée sur
-- la scène ; état vide M0 si aucune). read_public_contributions_v1 (E1) ne
-- rend que les contributions, pas les catégories.
--
-- Mêmes règles que les dépôts et la lecture E1 : hommage public, rubrique
-- non masquée dans la copie publiée ; sinon AUCUNE ligne (indistinct).
-- Aucune donnée de proche : des booléens et des nombres.

begin;

create or replace function public.read_public_contributions_overview_v1(p_slug text)
returns table (
  condolences boolean,
  stories boolean,
  photos boolean,
  published_condolences integer,
  published_stories integer,
  published_photos integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_memorial_id uuid;
  v_categories jsonb;
begin
  if p_slug is null then
    return;
  end if;
  select m.id into v_memorial_id from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null or not public.contributions_rubric_public_v1(v_memorial_id, now()) then
    return;
  end if;
  v_categories := public.contribution_categories_in_effect_v1(v_memorial_id);
  return query
    select (v_categories ->> 'condolences')::boolean,
           (v_categories ->> 'stories')::boolean,
           (v_categories ->> 'photos')::boolean,
           case when (v_categories ->> 'condolences')::boolean then
             (select count(*)::integer from public.messages msg
               where msg.memorial_id = v_memorial_id and msg.status = 'published' and msg.message_type = 'condolence')
           else 0 end,
           case when (v_categories ->> 'stories')::boolean then
             (select count(*)::integer from public.messages msg
               where msg.memorial_id = v_memorial_id and msg.status = 'published' and msg.message_type = 'testimonial')
           else 0 end,
           case when (v_categories ->> 'photos')::boolean then
             (select count(*)::integer from public.messages msg
               join public.media md on md.id = msg.media_id and md.memorial_id = msg.memorial_id
               where msg.memorial_id = v_memorial_id and msg.status = 'published' and msg.message_type = 'photo'
                 and md.status = 'ready' and md.purpose = 'contribution')
           else 0 end;
end;
$$;

revoke all on function public.read_public_contributions_overview_v1(text) from public, anon, authenticated;
grant execute on function public.read_public_contributions_overview_v1(text) to service_role;

comment on function public.read_public_contributions_overview_v1(text) is
  'M8-E3. Page publique : catégories EN VIGUEUR (O9) et nombre de contributions publiées lisibles par catégorie (O8, état vide M0). Aucune ligne si l''hommage n''est pas public ou si la rubrique est masquée. service_role seul.';

notify pgrst, 'reload schema';

commit;
