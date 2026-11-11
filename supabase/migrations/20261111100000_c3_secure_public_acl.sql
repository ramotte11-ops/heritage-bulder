-- HERITAGE HOMMAGE — C3
-- Migration corrective préparée, NON APPLIQUÉE à Supabase B.
-- Intention : fermer les futurs objets public par défaut, aligner les dix ACL
-- divergentes et empêcher la divulgation de l'état d'un hommage non public.

begin;

-- Les defaults par schéma peuvent retirer les grants par schéma de Supabase
-- sur tables/séquences et les grants nommés sur fonctions. Ils ne peuvent pas
-- retirer l'EXECUTE global que PostgreSQL accorde à PUBLIC sur les fonctions.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

alter default privileges for role supabase_admin in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  revoke all on functions from anon, authenticated, service_role;

-- Protection ciblée : ne pas modifier les default privileges globaux du rôle
-- interne Supabase. Toute fonction créée/remplacée dans public et appartenant
-- au rôle applicatif postgres est fermée immédiatement ; la même migration
-- doit ensuite accorder explicitement les seuls EXECUTE nécessaires.
create schema heritage_c3 authorization postgres;
revoke all on schema heritage_c3 from public, anon, authenticated, service_role;

create function heritage_c3.close_public_postgres_function_acl()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_function regprocedure;
begin
  for v_function in
    select command.objid::regprocedure
      from pg_event_trigger_ddl_commands() command
      join pg_proc p on p.oid = command.objid
      join pg_namespace n on n.oid = p.pronamespace
     where command.classid = 'pg_proc'::regclass
       and command.object_type = 'function'
       and n.nspname = 'public'
       and p.proowner = 'postgres'::regrole
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_function
    );
  end loop;
end
$$;

revoke all on function heritage_c3.close_public_postgres_function_acl()
  from public, anon, authenticated, service_role;

create event trigger heritage_c3_close_public_function_acl
  on ddl_command_end
  when tag in ('CREATE FUNCTION')
  execute function heritage_c3.close_public_postgres_function_acl();

-- Ce helper reste nécessaire aux politiques publiques. Il ne retourne
-- désormais une ligne que pour un hommage effectivement public et visible.
create or replace function public.public_memorial_publication_state(p_memorial_id uuid)
returns table (status text, enabled_sections text[])
language sql
stable
security definer
set search_path = ''
as $$
  select m.status, m.enabled_sections
    from public.memorials m
   where m.id = p_memorial_id
     and m.status = 'published'
     and public.memorial_publicly_visible_v1(m.id, now());
$$;

comment on function public.public_memorial_publication_state(uuid) is
  'Helper RLS public minimal : retourne état/rubriques uniquement pour un hommage publié et actuellement visible.';

-- Fermer d'abord chaque surface, puis réaccorder seulement l'intention métier.
revoke all on function public.create_memorial_draft()
  from public, anon, authenticated, service_role;
revoke all on function public.current_owner_id()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_publishing_pending_hero_cleanup_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_retiring_media_references_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.memorial_content_references_media_v1(jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.public_memorial_message_allowed_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.public_memorial_publication_state(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.redeem_entitlement(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.redeem_entitlement_with_activation_key(uuid, text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.set_updated_at()
  from public, anon, authenticated, service_role;

grant execute on function public.current_owner_id()
  to authenticated;
grant execute on function public.public_memorial_message_allowed_v1(uuid, text)
  to anon, authenticated;
grant execute on function public.public_memorial_publication_state(uuid)
  to anon, authenticated;
grant execute on function public.redeem_entitlement(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.redeem_entitlement_with_activation_key(uuid, text, uuid, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
