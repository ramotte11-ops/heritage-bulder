-- =====================================================================
-- HERITAGE DIRECT M1-A — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase APRÈS avoir appliqué
-- supabase/migrations/20261024180000_heritage_direct_access_foundation.sql.
--
-- Cette requête ne modifie RIEN. Elle lit les catalogues et compte des
-- lignes ; elle ne lit aucune donnée personnelle.
--
-- Elle renvoie UN SEUL tableau. Chaque ligne porte son verdict : OK,
-- INFO ou ECHEC. Un seul ECHEC = le modèle déployé n'est pas celui que
-- décrit ce dépôt. Les lignes « empreinte » se comparent une à une avec
-- celles du préflight : elles doivent être identiques.
--
-- Point de transition à surveiller (D12) : entitlements.access_level
-- reste NULLABLE jusqu'à M1-B. Tant que l'application déployée ne
-- fournit pas le niveau, un nouveau droit Etsy serait créé SANS niveau et
-- ne pourrait créer aucun mémorial. La ligne « droits sans niveau » doit
-- rester à 0 ; sinon, déployer le code M1-A sans attendre.
-- =====================================================================

with settings as (
  select * from public.memorial_access_settings where id
)

-- ---------------------------------------------------------------------
-- A. RÉGLAGES (B6, B14)
-- ---------------------------------------------------------------------
select 'A. reglages' as bloc,
       'une seule ligne de reglages' as controle,
       '1' as attendu,
       (select count(*)::text from public.memorial_access_settings) as constate,
       case when (select count(*) from public.memorial_access_settings) = 1
            then 'OK' else 'ECHEC' end as verdict

union all

select 'A. reglages', r, a,
       coalesce(c, 'ABSENT'),
       case when c = a then 'OK' else 'ECHEC' end
from (
  select 'publication gratuite (h)' as r, '168' as a,
         (select (extract(epoch from free_publish_window) / 3600)::bigint::text from settings) as c
  union all select 'conservation du brouillon (h)', '1080',
         (select (extract(epoch from free_draft_retention) / 3600)::bigint::text from settings)
  union all select 'corrections (h)', '168',
         (select (extract(epoch from free_correction_window) / 3600)::bigint::text from settings)
  union all select 'duree publique (h)', '1080',
         (select (extract(epoch from free_public_duration) / 3600)::bigint::text from settings)
  union all select 'conservation privee (h)', '720',
         (select (extract(epoch from free_private_extension) / 3600)::bigint::text from settings)
  union all select 'fenetre du quota de publication', '1 year',
         (select free_publication_quota_window::text from settings)
  union all select 'publications gratuites par proprietaire', '1',
         (select free_publications_per_owner::text from settings)
  union all select 'brouillons gratuits actifs par proprietaire', '1',
         (select free_active_drafts_per_owner::text from settings)
  union all select 'photos de galerie (avis)', '6',
         (select avis_gallery_limit::text from settings)
) as expected

union all

-- ---------------------------------------------------------------------
-- B. DROITS (D12)
-- ---------------------------------------------------------------------
select 'B. droits', 'droits sans niveau', '0',
       (select count(*)::text from public.entitlements where access_level is null),
       case when (select count(*) from public.entitlements where access_level is null) = 0
            then 'OK' else 'ECHEC — droit sans niveau : deployer le code M1-A, puis qualifier' end

union all

select 'B. droits', 'droits Etsy hors complet', '0',
       (select count(*)::text from public.entitlements
         where source = 'etsy' and access_level is distinct from 'complet'),
       case when (select count(*) from public.entitlements
                   where source = 'etsy' and access_level is distinct from 'complet') = 0
            then 'OK' else 'ECHEC' end

union all

select 'B. droits', 'droits ' || source || ' / ' || coalesce(access_level, 'NULL') || ' / ' || status,
       'informatif', count(*)::text, 'INFO'
from public.entitlements
group by source, access_level, status

union all

-- ---------------------------------------------------------------------
-- C. MÉMORIAUX
-- ---------------------------------------------------------------------
-- Seul écart permis : un mémorial gratuit passé au complet, journalisé.
select 'C. memoriaux', 'memoriaux dont le niveau differe du droit (hors passage au complet journalise)', '0',
       (select count(*)::text from public.memorials m
          join public.entitlements e on e.id = m.entitlement_id
         where m.access_level is distinct from e.access_level
           and not (m.access_level = 'complet' and e.access_level = 'avis'
                    and exists (select 1 from public.memorial_access_events ev
                                 where ev.memorial_id = m.id and ev.event = 'access.upgraded'))),
       case when (select count(*) from public.memorials m
                    join public.entitlements e on e.id = m.entitlement_id
                   where m.access_level is distinct from e.access_level
                     and not (m.access_level = 'complet' and e.access_level = 'avis'
                              and exists (select 1 from public.memorial_access_events ev
                                           where ev.memorial_id = m.id and ev.event = 'access.upgraded'))) = 0
            then 'OK' else 'ECHEC' end

union all

select 'C. memoriaux', 'memoriaux Etsy avec une echeance gratuite', '0',
       (select count(*)::text from public.memorials m
          join public.entitlements e on e.id = m.entitlement_id
         where e.source = 'etsy'
           and (m.access_level <> 'complet' or m.free_anchor_at is not null
                or m.free_publish_until is not null or m.free_public_until is not null)),
       case when (select count(*) from public.memorials m
                    join public.entitlements e on e.id = m.entitlement_id
                   where e.source = 'etsy'
                     and (m.access_level <> 'complet' or m.free_anchor_at is not null
                          or m.free_publish_until is not null or m.free_public_until is not null)) = 0
            then 'OK' else 'ECHEC' end

union all

select 'C. memoriaux', 'memoriaux ' || access_level || ' / ' || status, 'informatif',
       count(*)::text, 'INFO'
from public.memorials
group by access_level, status

union all

-- ---------------------------------------------------------------------
-- D. PRIVILÈGES
-- ---------------------------------------------------------------------
select 'D. privileges', r || ' sur ' || t, 'aucun privilege',
       (has_table_privilege(r, 'public.' || t, 'SELECT')
        or has_table_privilege(r, 'public.' || t, 'INSERT')
        or has_table_privilege(r, 'public.' || t, 'UPDATE')
        or has_table_privilege(r, 'public.' || t, 'DELETE')
        or has_table_privilege(r, 'public.' || t, 'TRUNCATE'))::text,
       case when has_table_privilege(r, 'public.' || t, 'SELECT')
              or has_table_privilege(r, 'public.' || t, 'INSERT')
              or has_table_privilege(r, 'public.' || t, 'UPDATE')
              or has_table_privilege(r, 'public.' || t, 'DELETE')
              or has_table_privilege(r, 'public.' || t, 'TRUNCATE')
            then 'ECHEC' else 'OK' end
from (values ('anon'), ('authenticated'), ('service_role')) as roles(r),
     (values ('memorial_access_settings'), ('memorial_access_events')) as tables(t)

union all

select 'D. privileges', 'RLS active sur ' || t, 'true',
       (select relrowsecurity::text from pg_class where oid = ('public.' || t)::regclass),
       case when (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass)
            then 'OK' else 'ECHEC' end
from (values ('memorial_access_settings'), ('memorial_access_events')) as tables(t)

union all

select 'D. privileges', f || ' : anon / authenticated / service_role', 'false / false / true',
       has_function_privilege('anon', 'public.' || f, 'EXECUTE')::text || ' / '
         || has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')::text || ' / '
         || has_function_privilege('service_role', 'public.' || f, 'EXECUTE')::text,
       case when not has_function_privilege('anon', 'public.' || f, 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
             and has_function_privilege('service_role', 'public.' || f, 'EXECUTE')
            then 'OK' else 'ECHEC' end
from (values ('create_free_memorial_v1(uuid,text,text)'),
             ('anchor_free_memorial_v1(uuid,uuid)'),
             ('upgrade_memorial_access_v1(uuid,uuid,text,text)')) as functions(f)

union all

select 'D. privileges', f || ' : executable par personne', 'false / false / false',
       has_function_privilege('anon', 'public.' || f, 'EXECUTE')::text || ' / '
         || has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')::text || ' / '
         || has_function_privilege('service_role', 'public.' || f, 'EXECUTE')::text,
       case when has_function_privilege('anon', 'public.' || f, 'EXECUTE')
              or has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
              or has_function_privilege('service_role', 'public.' || f, 'EXECUTE')
            then 'ECHEC' else 'OK' end
from (values ('memorials_inherit_access_level_v1()'), ('guard_free_first_publication_v1()'),
             ('guard_free_gallery_quota_v1()'), ('guard_free_draft_gallery_v1()')) as functions(f)

union all

select 'D. privileges', p.proname || ' : SECURITY DEFINER, search_path vide', 'definer / search_path=""',
       case when p.prosecdef then 'definer' else 'invoker' end || ' / '
         || coalesce(array_to_string(p.proconfig, ','), 'aucun'),
       case when p.prosecdef and p.proconfig @> array['search_path=""'] then 'OK' else 'ECHEC' end
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('create_free_memorial_v1', 'anchor_free_memorial_v1', 'upgrade_memorial_access_v1',
                    'memorials_inherit_access_level_v1', 'guard_free_first_publication_v1',
                    'guard_free_gallery_quota_v1', 'guard_free_draft_gallery_v1')

union all

-- ---------------------------------------------------------------------
-- E. TRIGGERS
-- ---------------------------------------------------------------------
select 'E. triggers', 'trigger ' || tg || ' actif', 'O',
       coalesce((select tgenabled::text from pg_trigger
                  where tgname = tg and tgrelid = ('public.' || tb)::regclass and not tgisinternal), 'ABSENT'),
       case when (select tgenabled from pg_trigger
                   where tgname = tg and tgrelid = ('public.' || tb)::regclass and not tgisinternal) = 'O'
            then 'OK' else 'ECHEC' end
from (values ('memorials_inherit_access_level', 'memorials'),
             ('memorials_guard_free_first_publication', 'memorials'),
             ('media_guard_free_gallery_quota', 'media'),
             ('memorial_drafts_guard_free_gallery', 'memorial_drafts'),
             -- Suspendus pendant la reprise : doivent être réactivés.
             ('entitlements_set_updated_at', 'entitlements'),
             ('memorials_set_updated_at', 'memorials')) as triggers(tg, tb)

union all

-- ---------------------------------------------------------------------
-- F. FONCTIONS INCHANGÉES (à comparer ligne à ligne avec le préflight)
-- ---------------------------------------------------------------------
select 'F. inchangees', 'empreinte ' || p.proname, 'identique au preflight',
       md5(pg_get_functiondef(p.oid)), 'INFO'
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('redeem_entitlement', 'redeem_entitlement_with_activation_key',
                    'admin_mutate_activation_key', 'admin_revoke_entitlement',
                    'commit_memorial_publication_v1')

union all

-- ---------------------------------------------------------------------
-- G. JOURNAL
-- ---------------------------------------------------------------------
select 'G. journal', 'evenements ' || event, 'informatif', count(*)::text, 'INFO'
from public.memorial_access_events
group by event

order by 1, 2, 3;
