-- =====================================================================
-- HERITAGE DIRECT M1-A, CORRECTIF 2 — POSTFLIGHT COMPLÉMENTAIRE
-- (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase APRÈS avoir appliqué
-- supabase/migrations/20261024200000_heritage_direct_access_level_required.sql,
-- en complément de m1a_postflight.sql et de m1a_correctif1_postflight.sql.
--
-- Cette requête ne modifie RIEN et ne lit aucune donnée personnelle.
-- UN SEUL tableau. Verdicts OK ou ECHEC.
-- =====================================================================

select 'A. droits' as bloc,
       'entitlements.access_level obligatoire (NOT NULL)' as controle,
       'true' as attendu,
       coalesce((select attnotnull::text from pg_attribute
                  where attrelid = 'public.entitlements'::regclass
                    and attname = 'access_level' and not attisdropped), 'COLONNE ABSENTE') as constate,
       case when (select attnotnull from pg_attribute
                   where attrelid = 'public.entitlements'::regclass
                     and attname = 'access_level' and not attisdropped)
            then 'OK' else 'ECHEC — appliquer 20261024200000' end as verdict

union all

select 'A. droits', 'aucun droit sans niveau', '0',
       (select count(*)::text from public.entitlements where access_level is null),
       case when (select count(*) from public.entitlements where access_level is null) = 0
            then 'OK' else 'ECHEC' end

order by 1, 2, 3;
