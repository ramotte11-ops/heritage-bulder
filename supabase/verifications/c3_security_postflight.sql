-- HERITAGE HOMMAGE — C3
-- Postflight lecture seule préparé. Aucune correction n'est exécutée ici.
\set ON_ERROR_STOP on

do $$
declare
  v_exposed_defaults integer;
  v_missing_or_wrong integer;
  v_unexpected_client_functions integer;
  v_nonpublic_rows integer;
begin
  -- Les defaults applicatifs de postgres sont vérifiables pour
  -- tables/séquences. Les default privileges de supabase_admin sont internes
  -- à la plateforme, volontairement inchangés et exclus de ce contrôle. Pour
  -- les fonctions postgres, l'EXECUTE global de PUBLIC est neutralisé par
  -- l'event trigger ciblé vérifié plus bas.
  select count(*) into v_exposed_defaults
    from pg_default_acl d
    join pg_roles owner_role on owner_role.oid = d.defaclrole
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) x
    left join pg_roles grantee_role on grantee_role.oid = x.grantee
   where owner_role.rolname = 'postgres'
     and n.nspname = 'public'
     and d.defaclobjtype in ('r', 'S')
     and (x.grantee = 0 or grantee_role.rolname in ('anon', 'authenticated', 'service_role'));
  if v_exposed_defaults <> 0 then
    raise exception 'C3 table/sequence default ACL exposure remains: % grant rows', v_exposed_defaults;
  end if;

  if not exists (
    select 1
      from pg_event_trigger e
      join pg_proc p on p.oid = e.evtfoid
      join pg_namespace n on n.oid = p.pronamespace
     where e.evtname = 'heritage_c3_close_public_function_acl'
       and e.evtevent = 'ddl_command_end'
       and e.evtenabled = 'O'
       and e.evttags @> array['CREATE FUNCTION']::text[]
       and n.nspname = 'heritage_c3'
       and p.proname = 'close_public_postgres_function_acl'
       and p.prosecdef
       and p.proconfig @> array['search_path=pg_catalog']::text[]
       and pg_get_functiondef(p.oid) like '%n.nspname = ''public''%'
       and pg_get_functiondef(p.oid) like '%p.proowner = ''postgres''::regrole%'
  ) then
    raise exception 'C3 public function ACL event trigger is absent or not hardened';
  end if;

  if has_schema_privilege('anon', 'heritage_c3', 'USAGE')
     or has_schema_privilege('authenticated', 'heritage_c3', 'USAGE')
     or has_schema_privilege('service_role', 'heritage_c3', 'USAGE')
  then
    raise exception 'C3 private guard schema is exposed to client roles';
  end if;

  with expected(signature, anon_ok, authenticated_ok, service_ok) as (
    values
      ('public.create_memorial_draft()', false, false, false),
      ('public.current_owner_id()', false, true, false),
      ('public.guard_publishing_pending_hero_cleanup_v1()', false, false, false),
      ('public.guard_retiring_media_references_v1()', false, false, false),
      ('public.memorial_content_references_media_v1(jsonb,uuid)', false, false, false),
      ('public.public_memorial_message_allowed_v1(uuid,text)', true, true, false),
      ('public.public_memorial_publication_state(uuid)', true, true, false),
      ('public.redeem_entitlement(uuid,uuid,text,text,text)', false, false, true),
      ('public.redeem_entitlement_with_activation_key(uuid,text,uuid,text,text,text)', false, false, true),
      ('public.set_updated_at()', false, false, false)
  )
  select count(*) into v_missing_or_wrong
    from expected e
    left join pg_proc p on p.oid = to_regprocedure(e.signature)
   where p.oid is null
      or has_function_privilege('anon', p.oid, 'EXECUTE') is distinct from e.anon_ok
      or has_function_privilege('authenticated', p.oid, 'EXECUTE') is distinct from e.authenticated_ok
      or has_function_privilege('service_role', p.oid, 'EXECUTE') is distinct from e.service_ok;
  if v_missing_or_wrong <> 0 then
    raise exception 'C3 function ACL mismatch: % functions', v_missing_or_wrong;
  end if;

  select count(*) into v_unexpected_client_functions
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (
       has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE')
     )
     and p.oid not in (
       'public.current_owner_id()'::regprocedure,
       'public.public_memorial_message_allowed_v1(uuid,text)'::regprocedure,
       'public.public_memorial_publication_state(uuid)'::regprocedure
     );
  if v_unexpected_client_functions <> 0 then
    raise exception 'C3 unexpected public function exposure remains: % functions', v_unexpected_client_functions;
  end if;

  if not exists (
    select 1
      from pg_proc p
     where p.oid = 'public.public_memorial_publication_state(uuid)'::regprocedure
       and p.prosecdef
       and p.proconfig @> array['search_path=""']::text[]
       and pg_get_functiondef(p.oid) like '%m.status = ''published''%'
       and pg_get_functiondef(p.oid) like '%public.memorial_publicly_visible_v1%'
  ) then
    raise exception 'C3 public state helper is not hardened as expected';
  end if;

  select coalesce(sum((select count(*)
                         from public.public_memorial_publication_state(m.id))), 0)
    into v_nonpublic_rows
    from public.memorials m
   where m.status <> 'published';
  if v_nonpublic_rows <> 0 then
    raise exception 'C3 non-public memorial state disclosure remains: % rows', v_nonpublic_rows;
  end if;

  if (select count(*) from pg_tables where schemaname = 'public') <> 22
     or (select count(*) from information_schema.columns where table_schema = 'public') <> 184
     or (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public') <> 126
     or (select count(*) from pg_indexes where schemaname='public') <> 50
     or (select count(*) from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and not t.tgisinternal) <> 16
     or (select count(*) from pg_policies where schemaname='public') <> 15
     or (select count(*) from pg_class r join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relkind in ('r','p') and r.relrowsecurity) <> 22
  then
    raise exception 'C3 catalog regression detected';
  end if;

  if (select sum(n) from (
        select count(*)::integer n from public.activation_rate_limits union all
        select count(*) from public.admin_audit_events union all
        select count(*) from public.entitlements union all
        select count(*) from public.etsy_seller_credentials union all
        select count(*) from public.free_publication_waivers union all
        select count(*) from public.gallery_media_retirement_leases union all
        select count(*) from public.guest_draft_transfers union all
        select count(*) from public.hero_media_retirement_leases union all
        select count(*) from public.media union all
        select count(*) from public.memorial_access_events union all
        select count(*) from public.memorial_access_settings union all
        select count(*) from public.memorial_drafts union all
        select count(*) from public.memorial_edit_audit_events union all
        select count(*) from public.memorial_published_snapshots union all
        select count(*) from public.memorials union all
        select count(*) from public.messages union all
        select count(*) from public.owners union all
        select count(*) from public.pending_media_cleanup_claims union all
        select count(*) from public.symbolic_offering_eligibility union all
        select count(*) from public.symbolic_offering_rate_limits union all
        select count(*) from public.symbolic_offering_settings union all
        select count(*) from public.symbolic_offerings
      ) counts) <> 82
  then
    raise exception 'C3 public row-count regression detected';
  end if;
end
$$;

select * from (values
  ('default_acl', 'postgres-owned public tables/sequences closed; platform defaults excluded', 'OK'),
  ('function_guard', 'new postgres-owned public functions start closed', 'OK'),
  ('function_acl', '10 targeted ACLs and complete client allowlist match', 'OK'),
  ('publication_state', 'non-public memorials return zero rows', 'OK'),
  ('rls', '22 tables with RLS and 15 policies unchanged', 'OK'),
  ('catalog', '22 tables, 184 columns, 126 constraints, 50 indexes, 16 triggers', 'OK'),
  ('data', '82 public rows unchanged', 'OK')
) as result(control, expected, verdict);
