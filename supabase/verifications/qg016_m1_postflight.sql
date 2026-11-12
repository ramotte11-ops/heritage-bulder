-- =====================================================================
-- HERITAGE HOMMAGE — QG 016 / M1 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter APRÈS avoir appliqué
-- supabase/migrations/20261104090000_qg016_m1_read_public_memorial.sql.
-- Ne modifie RIEN. N'affiche aucun contenu d'hommage ni aucun chemin de
-- stockage : seulement des comptages et des drapeaux. Verdicts OK/ECHEC.
-- =====================================================================

select 'A. fonction' as bloc,
       'read_public_memorial_v1 : service_role seul, SECURITY DEFINER, STABLE, search_path vide' as controle,
       'false|false|true|t|s|t' as attendu,
       has_function_privilege('anon', f, 'EXECUTE') || '|' || has_function_privilege('authenticated', f, 'EXECUTE') || '|'
       || has_function_privilege('service_role', f, 'EXECUTE') || '|'
       || coalesce((select prosecdef::text from pg_proc where oid = to_regprocedure(f)), '-') || '|'
       || coalesce((select provolatile::text from pg_proc where oid = to_regprocedure(f)), '-') || '|'
       || coalesce((select (proconfig @> array['search_path=""'])::text from pg_proc where oid = to_regprocedure(f)), '-') as constate,
       case when to_regprocedure(f) is not null
                 and not has_function_privilege('anon', f, 'EXECUTE')
                 and not has_function_privilege('authenticated', f, 'EXECUTE')
                 and has_function_privilege('service_role', f, 'EXECUTE')
                 and (select prosecdef and provolatile = 's' and proconfig @> array['search_path=""'] from pg_proc where oid = to_regprocedure(f))
            then 'OK' else 'ECHEC' end as verdict
from (values ('public.read_public_memorial_v1(text)')) as fns(f)

union all

select 'A. fonction', 'lit l''instantane publie et la visibilite publique, jamais le brouillon', 'present|present|absent',
       case when coalesce((select prosrc like '%public.memorial_published_snapshots%' from pg_proc where oid = to_regprocedure('public.read_public_memorial_v1(text)')), false) then 'present' else 'absent' end
       || '|' ||
       case when coalesce((select prosrc like '%public.memorial_publicly_visible_v1(%' from pg_proc where oid = to_regprocedure('public.read_public_memorial_v1(text)')), false) then 'present' else 'absent' end
       || '|' ||
       case when coalesce((select prosrc like '%memorial_drafts%' from pg_proc where oid = to_regprocedure('public.read_public_memorial_v1(text)')), true) then 'present' else 'absent' end,
       case when coalesce((select prosrc like '%public.memorial_published_snapshots%'
                                  and prosrc like '%public.memorial_publicly_visible_v1(%'
                                  and prosrc not like '%memorial_drafts%'
                             from pg_proc where oid = to_regprocedure('public.read_public_memorial_v1(text)')), false)
            then 'OK' else 'ECHEC' end

union all

select 'B. droits 013C', 'instantanes publies toujours illisibles par anon, authenticated, service_role', 'false|false|false',
       has_table_privilege('anon', 'public.memorial_published_snapshots', 'SELECT') || '|'
       || has_table_privilege('authenticated', 'public.memorial_published_snapshots', 'SELECT') || '|'
       || has_table_privilege('service_role', 'public.memorial_published_snapshots', 'SELECT'),
       case when not has_table_privilege('anon', 'public.memorial_published_snapshots', 'SELECT')
                 and not has_table_privilege('authenticated', 'public.memorial_published_snapshots', 'SELECT')
                 and not has_table_privilege('service_role', 'public.memorial_published_snapshots', 'SELECT')
            then 'OK' else 'ECHEC' end

union all

select 'B. droits 013C', 'memorials, brouillons et medias illisibles par anon', 'false|false|false',
       has_table_privilege('anon', 'public.memorials', 'SELECT') || '|'
       || has_table_privilege('anon', 'public.memorial_drafts', 'SELECT') || '|'
       || has_table_privilege('anon', 'public.media', 'SELECT'),
       case when not has_table_privilege('anon', 'public.memorials', 'SELECT')
                 and not has_table_privilege('anon', 'public.memorial_drafts', 'SELECT')
                 and not has_table_privilege('anon', 'public.media', 'SELECT')
            then 'OK' else 'ECHEC' end

union all

select 'C. comportement', 'slug NULL, vide ou inconnu : 0 ligne', '0|0|0',
       (select count(*)::text from public.read_public_memorial_v1(null)) || '|'
       || (select count(*)::text from public.read_public_memorial_v1('')) || '|'
       || (select count(*)::text from public.read_public_memorial_v1('slug-inexistant-qg016-m1')),
       case when (select count(*) from public.read_public_memorial_v1(null)) = 0
                 and (select count(*) from public.read_public_memorial_v1('')) = 0
                 and (select count(*) from public.read_public_memorial_v1('slug-inexistant-qg016-m1')) = 0
            then 'OK' else 'ECHEC' end

union all

select 'C. comportement', 'chaque slug : 1 ligne si publie, visible et instantane present ; 0 sinon (ecarts)', '0',
       (select count(*)::text
          from public.memorials m
         where m.slug is not null
           and (select count(*) from public.read_public_memorial_v1(m.slug))
               <> case when m.status = 'published'
                            and public.memorial_publicly_visible_v1(m.id, now())
                            and exists (select 1 from public.memorial_published_snapshots s where s.memorial_id = m.id)
                       then 1 else 0 end),
       case when (select count(*)
                    from public.memorials m
                   where m.slug is not null
                     and (select count(*) from public.read_public_memorial_v1(m.slug))
                         <> case when m.status = 'published'
                                      and public.memorial_publicly_visible_v1(m.id, now())
                                      and exists (select 1 from public.memorial_published_snapshots s where s.memorial_id = m.id)
                                 then 1 else 0 end) = 0
            then 'OK' else 'ECHEC' end

union all

select 'C. comportement', 'medias renvoyes : tous ready, du memorial, references par l''instantane (ecarts)', '0',
       (select count(*)::text
          from public.memorials m
          cross join lateral public.read_public_memorial_v1(m.slug) r
          cross join lateral jsonb_array_elements(r.media) e
          left join public.media md on md.id = (e ->> 'media_id')::uuid
         where m.slug is not null
           and (md.id is null or md.memorial_id <> m.id or md.status <> 'ready'
                or not public.memorial_content_references_media_v1(r.content, md.id))),
       case when (select count(*)
                    from public.memorials m
                    cross join lateral public.read_public_memorial_v1(m.slug) r
                    cross join lateral jsonb_array_elements(r.media) e
                    left join public.media md on md.id = (e ->> 'media_id')::uuid
                   where m.slug is not null
                     and (md.id is null or md.memorial_id <> m.id or md.status <> 'ready'
                          or not public.memorial_content_references_media_v1(r.content, md.id))) = 0
            then 'OK' else 'ECHEC' end

union all

select 'D. information', 'hommages actuellement consultables (nombre, sans contenu)', '>= 0',
       (select count(*)::text from public.memorials m
         where m.slug is not null and exists (select 1 from public.read_public_memorial_v1(m.slug))),
       'OK'

order by 1, 2, 3;
