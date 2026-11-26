-- =====================================================================
-- HERITAGE HOMMAGE — VID-07 à VID-09 — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter JUSTE AVANT supabase/installation/vid-sql-editor/01_* (sous GO
-- PO distinct). Cible UNIQUE : nudqzbdfnjzlnyffllgs.
-- INTERDIT : pbgzyyqdbdrhgnkzmxyn.
--
-- Vérifie les prérequis des migrations vidéo et qu'aucune n'est déjà
-- appliquée. Transaction READ ONLY ; aucun contenu ni donnée personnelle
-- lus : catalogue, droits et comptages seulement.
-- Chaque ligne : bloc | contrôle | OK ou ECHEC. Un seul ECHEC = ne pas
-- appliquer ; rendre compte au QG.
-- =====================================================================

begin transaction read only;

select bloc, controle, case when ok then 'OK' else 'ECHEC' end as verdict
from (values
  -- 0. Identité et mode
  ('0. identite', 'transaction en lecture seule',
   current_setting('transaction_read_only') = 'on'),
  ('0. identite', 'historique des migrations present',
   to_regclass('supabase_migrations.schema_migrations') is not null),
  ('0. identite', 'lot M8 installe (version 20261122090000 enregistree)',
   exists (select 1 from supabase_migrations.schema_migrations where version = '20261122090000')),
  ('0. identite', 'aucune version video enregistree',
   not exists (select 1 from supabase_migrations.schema_migrations
                where version in ('20261125090000', '20261125100000', '20261126090000'))),

  -- 1. Rôles Supabase
  ('1. roles', 'anon, authenticated et service_role existent',
   (select count(*) = 3 from pg_roles where rolname in ('anon', 'authenticated', 'service_role'))),

  -- 2. Prérequis des migrations vidéo
  ('2. prerequis', 'tables owners, memorials, memorial_published_snapshots, entitlements',
   to_regclass('public.owners') is not null and to_regclass('public.memorials') is not null
   and to_regclass('public.memorial_published_snapshots') is not null and to_regclass('public.entitlements') is not null),
  ('2. prerequis', 'memorials : colonnes access_level, status, slug, owner_id',
   (select count(*) = 4 from information_schema.columns where table_schema = 'public' and table_name = 'memorials'
     and column_name in ('access_level', 'status', 'slug', 'owner_id'))),
  ('2. prerequis', 'memorial_published_snapshots : colonnes content, published_at',
   (select count(*) = 2 from information_schema.columns where table_schema = 'public'
     and table_name = 'memorial_published_snapshots' and column_name in ('content', 'published_at'))),
  ('2. prerequis', 'fonction memorial_publicly_visible_v1(uuid, timestamptz)',
   to_regprocedure('public.memorial_publicly_visible_v1(uuid,timestamp with time zone)') is not null),
  ('2. prerequis', 'fonction current_owner_id()',
   to_regprocedure('public.current_owner_id()') is not null),
  ('2. prerequis', 'memorials : RLS active (inchange par les migrations video)',
   (select relrowsecurity from pg_class where oid = 'public.memorials'::regclass)),
  ('2. prerequis', 'aucun hommage ne porte un niveau d''offre inconnu (avis ou complet seulement)',
   not exists (select 1 from public.memorials where access_level is not null and access_level not in ('avis', 'complet'))),

  -- 3. Objets vidéo absents
  ('3. objets video', 'tables memorial_videos et memorial_video_events absentes',
   to_regclass('public.memorial_videos') is null and to_regclass('public.memorial_video_events') is null),
  ('3. objets video', 'aucune fonction video',
   not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                and p.proname like '%memorial_video%')),
  ('3. objets video', 'aucune contrainte de cle etrangere vers memorial_videos',
   to_regclass('public.memorial_videos') is null
   or not exists (select 1 from pg_constraint where contype = 'f' and confrelid = to_regclass('public.memorial_videos'))),
  ('3. objets video', 'aucune copie publiee ne porte deja une rubrique video',
   not exists (select 1 from public.memorial_published_snapshots where content ? 'video'))
) as v(bloc, controle, ok)
order by bloc, controle;

rollback;
