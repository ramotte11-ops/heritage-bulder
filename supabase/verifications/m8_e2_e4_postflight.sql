-- =====================================================================
-- HERITAGE HOMMAGE — M8-E2 à E4 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter APRÈS 20261120090000 (E2), 20261121090000 (E3) et
-- 20261122090000 (E4), et après le postflight E1 (26 OK).
-- Cible UNIQUE : nudqzbdfnjzlnyffllgs. INTERDIT : pbgzyyqdbdrhgnkzmxyn.
-- Transaction READ ONLY ; métadonnées seulement, aucune donnée lue.
-- Chaque ligne : bloc | contrôle | OK ou ECHEC. Attendu : 16 OK, zéro ECHEC.
-- =====================================================================

begin transaction read only;

with fn(etape, sig) as (values
  ('E2', 'public.read_owner_contribution_settings_v1(uuid,uuid)'),
  ('E3', 'public.read_public_contributions_overview_v1(text)'),
  ('E4', 'public.read_public_contributions_v2(text,integer,timestamptz,uuid,text[])'),
  ('E4', 'public.read_public_contributions_by_ids_v1(text,uuid[])')
),
checks as (
  select etape as bloc, sig || ' presente' as controle, to_regprocedure(sig) is not null as ok from fn
  union all
  select etape, sig || ' : SECURITY DEFINER, search_path vide',
         coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = to_regprocedure(sig)), false)
    from fn
  union all
  select etape, sig || ' : executable par service_role seulement',
         coalesce(to_regprocedure(sig) is not null
           and not has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE')
           and not has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE')
           and has_function_privilege('service_role', to_regprocedure(sig), 'EXECUTE'), false)
    from fn
  union all
  select etape, sig || ' : lecture seule (STABLE)',
         coalesce((select p.provolatile = 's' from pg_proc p where p.oid = to_regprocedure(sig)), false)
    from fn
)
select bloc, controle, case when ok then 'OK' else 'ECHEC' end as verdict
  from checks
 order by bloc, controle;

rollback;
