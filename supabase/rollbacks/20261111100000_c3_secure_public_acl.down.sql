-- HERITAGE HOMMAGE — C3
-- Retour arrière d'urgence préparé, NON EXÉCUTÉ.
-- Il restitue les ACL/default ACL applicatives de postgres observées avant
-- C3, y compris leur exposition. Les default privileges du rôle interne
-- supabase_admin ne sont jamais modifiés. À utiliser uniquement sur décision
-- QG après diagnostic.

begin;

drop event trigger if exists heritage_c3_close_public_function_acl;
drop function if exists heritage_c3.close_public_postgres_function_acl();
drop schema if exists heritage_c3;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

create or replace function public.public_memorial_publication_state(p_memorial_id uuid)
returns table (status text, enabled_sections text[])
language sql
security definer
set search_path = public
stable
as $$
  select m.status, m.enabled_sections
    from public.memorials m
   where m.id = p_memorial_id
     and (m.status <> 'published' or public.memorial_publicly_visible_v1(m.id, now()));
$$;

comment on function public.public_memorial_publication_state(uuid) is null;

revoke all on function public.create_memorial_draft() from public;
grant execute on function public.create_memorial_draft() to anon, authenticated, service_role;
revoke all on function public.current_owner_id() from public;
grant execute on function public.current_owner_id() to anon, authenticated, service_role;
revoke all on function public.guard_publishing_pending_hero_cleanup_v1() from public, anon, authenticated;
grant execute on function public.guard_publishing_pending_hero_cleanup_v1() to service_role;
revoke all on function public.guard_retiring_media_references_v1() from public, anon, authenticated;
grant execute on function public.guard_retiring_media_references_v1() to service_role;
revoke all on function public.memorial_content_references_media_v1(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.memorial_content_references_media_v1(jsonb, uuid) to service_role;
revoke all on function public.public_memorial_message_allowed_v1(uuid, text) from public;
grant execute on function public.public_memorial_message_allowed_v1(uuid, text) to anon, authenticated, service_role;
revoke all on function public.public_memorial_publication_state(uuid) from public;
grant execute on function public.public_memorial_publication_state(uuid) to anon, authenticated, service_role;
revoke all on function public.redeem_entitlement(uuid, uuid, text, text, text) from public;
grant execute on function public.redeem_entitlement(uuid, uuid, text, text, text) to anon, authenticated, service_role;
revoke all on function public.redeem_entitlement_with_activation_key(uuid, text, uuid, text, text, text) from public;
grant execute on function public.redeem_entitlement_with_activation_key(uuid, text, uuid, text, text, text) to anon, authenticated, service_role;
revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
