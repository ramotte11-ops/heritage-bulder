-- A15-R — PURGE des données de la recette des Contributions des proches.
-- ÉCRITURE : à n'exécuter que sur GO QG explicite et nominatif, APRÈS la recette.
-- Projet : nudqzbdfnjzlnyffllgs (jamais pbgzyyqdbdrhgnkzmxyn).
--
-- 1. Remplacer les deux slugs PARTOUT (le bloc et le constat final) par ceux des
--    hommages « TEST RECETTE A15 » (Rechercher / Remplacer dans l'éditeur).
-- 2. Exécuter d'abord supabase/verifications/a15r_recette_etat.sql (lecture seule).
-- 3. Exécuter ce fichier en entier : tout ou rien, dans une seule transaction.
--
-- Effets, limités aux deux hommages de recette :
--  - suppression de leurs contributions (condoléances, récits, photos), quel que
--    soit leur statut (les refusées ne sont pas supprimables depuis l'écran famille) ;
--  - réclamations de nettoyage closes et lignes `media` des photos de proches
--    supprimées (les octets ont déjà été effacés du bucket par la suppression
--    famille ; un envoi jamais finalisé est signalé par a15r_recette_etat.sql § 5,
--    son dossier se vide à la main dans Storage) ;
--  - les deux hommages de recette passent `archived` : plus aucun dépôt possible,
--    même depuis une adresse permanente d'un ancien déploiement de recette.
-- Garde-fous : STOP sans rien modifier si un slug est introuvable, mal formé, en
-- double, ou si le nom publié ne commence pas par « TEST RECETTE A15 ».
-- Aucune autre table, aucun autre hommage, aucun fichier n'est touché.
do $$
declare
  v_slugs constant text[] := array['REMPLACER_SLUG_COMPLET', 'REMPLACER_SLUG_GRATUIT'];
  v_ids uuid[];
  v_bad text;
  v_messages integer;
  v_media integer;
  v_claims integer;
  v_archived integer;
begin
  if exists (select 1 from unnest(v_slugs) s where s !~ '^[0-9a-f]{12,64}$')
     or (select count(distinct s) from unnest(v_slugs) s) <> cardinality(v_slugs) then
    raise exception 'STOP A15-R : liste de slugs invalide (remplacer les deux REMPLACER_…). Rien n''a été modifié.';
  end if;

  select array_agg(m.id) into v_ids from public.memorials m where m.slug = any (v_slugs);
  if coalesce(cardinality(v_ids), 0) <> cardinality(v_slugs) then
    raise exception 'STOP A15-R : un hommage de recette est introuvable. Rien n''a été modifié.';
  end if;

  select m.slug into v_bad
    from public.memorials m
    left join public.memorial_published_snapshots s on s.memorial_id = m.id
   where m.id = any (v_ids)
     and coalesce(s.content #>> '{hero,displayName}', '') not like 'TEST RECETTE A15%'
   limit 1;
  if v_bad is not null then
    raise exception 'STOP A15-R : l''hommage % n''est pas nommé « TEST RECETTE A15 ». Rien n''a été modifié.', v_bad;
  end if;

  delete from public.messages
   where memorial_id = any (v_ids) and message_type in ('condolence', 'testimonial', 'photo');
  get diagnostics v_messages = row_count;

  update public.pending_media_cleanup_claims
     set completed_at = clock_timestamp()
   where memorial_id = any (v_ids) and completed_at is null
     and media_id in (select id from public.media where memorial_id = any (v_ids) and purpose = 'contribution');
  get diagnostics v_claims = row_count;

  delete from public.media
   where memorial_id = any (v_ids) and purpose = 'contribution'
     and not exists (select 1 from public.messages msg where msg.media_id = public.media.id);
  get diagnostics v_media = row_count;

  update public.memorials set status = 'archived' where id = any (v_ids) and status <> 'archived';
  get diagnostics v_archived = row_count;

  raise notice 'OK A15-R : % contribution(s), % réclamation(s) close(s), % média(s) de proche, % hommage(s) archivé(s).',
    v_messages, v_claims, v_media, v_archived;
end $$;

-- Constat (et non affirmation) : si le bloc ci-dessus s'est arrêté sur un STOP, ce
-- constat montre l'état inchangé. Attendu après une purge réussie : 0 | 0 | archived.
select (select count(*) from public.messages msg join public.memorials m on m.id = msg.memorial_id
         where m.slug = any (array['REMPLACER_SLUG_COMPLET', 'REMPLACER_SLUG_GRATUIT'])
           and msg.message_type in ('condolence', 'testimonial', 'photo')) as contributions_restantes,
       (select count(*) from public.media md join public.memorials m on m.id = md.memorial_id
         where m.slug = any (array['REMPLACER_SLUG_COMPLET', 'REMPLACER_SLUG_GRATUIT'])
           and md.purpose = 'contribution') as medias_de_proche_restants,
       (select string_agg(distinct m.status, ',') from public.memorials m
         where m.slug = any (array['REMPLACER_SLUG_COMPLET', 'REMPLACER_SLUG_GRATUIT'])) as statut_des_hommages;
