-- A15-R — état de la recette des Contributions des proches. LECTURE SEULE.
-- Projet : nudqzbdfnjzlnyffllgs (jamais pbgzyyqdbdrhgnkzmxyn).
-- Avant la recette : seule la partie 1 compte (les slugs peuvent rester à REMPLACER).
-- Après la recette : remplacer les deux slugs ci-dessous par ceux des hommages
-- « TEST RECETTE A15 », puis exécuter tout le fichier (aucune écriture).
with params as (
  select array['REMPLACER_SLUG_COMPLET', 'REMPLACER_SLUG_GRATUIT']::text[] as slugs
),
test_memorials as (
  select m.id, m.slug, m.status, m.access_level, s.content #>> '{hero,displayName}' as display_name
    from public.memorials m
    join params p on m.slug = any (p.slugs)
    left join public.memorial_published_snapshots s on s.memorial_id = m.id
)
-- 1. Migrations M8 E1 à E4 (et Lot 2) inscrites dans l'historique : 5 lignes attendues.
select '1 migration' as controle, version as detail, 'OK' as resultat
  from supabase_migrations.schema_migrations
 where version in ('20261116120000', '20261119090000', '20261120090000', '20261121090000', '20261122090000')
union all
select '1 migrations M8 présentes (attendu 5)', count(*)::text,
       case when count(*) = 5 then 'OK' else 'ECHEC' end
  from supabase_migrations.schema_migrations
 where version in ('20261116120000', '20261119090000', '20261120090000', '20261121090000', '20261122090000')
union all
-- 2. Hommages de recette : trouvés, et nommés « TEST RECETTE A15 » (garde-fou de la purge).
select '2 hommage ' || slug, coalesce(display_name, '?') || ' / ' || status || ' / ' || access_level,
       case when display_name like 'TEST RECETTE A15%' then 'OK' else 'ECHEC (nom)' end
  from test_memorials
union all
-- 3. Contributions de recette, par type et statut (aucun texte, aucun nom).
select '3 contributions ' || tm.slug, msg.message_type || ' / ' || msg.status || ' : ' || count(*), 'INFO'
  from public.messages msg join test_memorials tm on tm.id = msg.memorial_id
 where msg.message_type in ('condolence', 'testimonial', 'photo')
 group by tm.slug, msg.message_type, msg.status
union all
-- 4. Médias des photos de proches (octets dans le bucket privé) et réclamations ouvertes.
select '4 médias contribution ' || tm.slug, md.status || ' : ' || count(*), 'INFO'
  from public.media md join test_memorials tm on tm.id = md.memorial_id
 where md.purpose = 'contribution'
 group by tm.slug, md.status
union all
select '4 réclamations de nettoyage ouvertes', count(*)::text, 'INFO'
  from public.pending_media_cleanup_claims c join test_memorials tm on tm.id = c.memorial_id
 where c.completed_at is null
union all
-- 5. Envois photo jamais finalisés (octets bruts possibles) : dossier à vider dans Storage.
select '5 envoi abandonné à vider dans Storage', md.memorial_id || '/' || md.id || '/', 'ACTION'
  from public.media md join test_memorials tm on tm.id = md.memorial_id
 where md.purpose = 'contribution' and md.status = 'pending'
   and not exists (select 1 from public.pending_media_cleanup_claims c where c.media_id = md.id)
union all
-- 6. Contributions hors recette (sur TOUTE la base) : 0 attendu tant que l'ouverture publique n'a pas eu lieu.
select '6 contributions hors hommages de recette (attendu 0)', count(*)::text,
       case when count(*) = 0 then 'OK' else 'ALERTE' end
  from public.messages msg
 where (msg.idempotency_key is not null or msg.media_id is not null or msg.message_type = 'photo')
   and msg.memorial_id not in (select id from test_memorials)
union all
-- 7. Retour arrière M8-E1 (R2) : possible seulement sans aucune contribution ni média de proche.
select '7 retour arrière R2 possible',
       case when exists (select 1 from public.messages where message_type = 'photo' or idempotency_key is not null or media_id is not null)
              or exists (select 1 from public.media where purpose = 'contribution')
            then 'non (données de contributions présentes)' else 'oui' end,
       'INFO';
