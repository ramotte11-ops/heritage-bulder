-- A15-R — ARRÊT IMMÉDIAT de la recette (incident). ÉCRITURE : GO QG (ou PO en urgence, à signaler).
-- Projet : nudqzbdfnjzlnyffllgs. Remplacer les deux slugs PARTOUT, puis exécuter en entier.
-- Effet : les deux hommages « TEST RECETTE A15 » passent `archived`. Aussitôt, tout dépôt est
-- refusé et leur page publique n'est plus servie, sur TOUS les déploiements (recette compris,
-- adresses permanentes comprises), sans attendre aucune construction Netlify.
-- Aucune donnée n'est supprimée (la purge reste a15r_recette_purge.sql).
-- Réversible pour la suite de la recette : remettre `status = 'published'` sur ces deux seuls hommages.
do $$
declare
  v_slugs constant text[] := array['REMPLACER_SLUG_COMPLET', 'REMPLACER_SLUG_GRATUIT'];
  v_ids uuid[];
  v_bad text;
begin
  if exists (select 1 from unnest(v_slugs) s where s !~ '^[0-9a-f]{12,64}$')
     or (select count(distinct s) from unnest(v_slugs) s) <> cardinality(v_slugs) then
    raise exception 'STOP A15-R : liste de slugs invalide. Rien n''a été modifié.';
  end if;
  select array_agg(m.id) into v_ids from public.memorials m where m.slug = any (v_slugs);
  if coalesce(cardinality(v_ids), 0) <> cardinality(v_slugs) then
    raise exception 'STOP A15-R : un hommage de recette est introuvable. Rien n''a été modifié.';
  end if;
  select m.slug into v_bad
    from public.memorials m left join public.memorial_published_snapshots s on s.memorial_id = m.id
   where m.id = any (v_ids) and coalesce(s.content #>> '{hero,displayName}', '') not like 'TEST RECETTE A15%'
   limit 1;
  if v_bad is not null then
    raise exception 'STOP A15-R : l''hommage % n''est pas nommé « TEST RECETTE A15 ». Rien n''a été modifié.', v_bad;
  end if;
  update public.memorials set status = 'archived' where id = any (v_ids) and status <> 'archived';
end $$;

select slug, status from public.memorials
 where slug = any (array['REMPLACER_SLUG_COMPLET', 'REMPLACER_SLUG_GRATUIT']) order by slug;
