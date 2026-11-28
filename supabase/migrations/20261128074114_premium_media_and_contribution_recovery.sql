-- 06-F1-R2. Fresh public media authorization and archive protection.
begin;

create function public.read_public_media_term_v1(p_slug text)
returns table (complete_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.complete_until
    from public.memorials m
   where m.slug = p_slug
     and public.memorial_publicly_visible_v1(m.id, statement_timestamp());
$$;

revoke all on function public.read_public_media_term_v1(text) from public, anon, authenticated;
grant execute on function public.read_public_media_term_v1(text) to service_role;

-- Keep the original RPC signatures, locking order, outcomes and grants.
create or replace function public.moderate_contribution_v1(p_owner_id uuid, p_contribution_id uuid, p_action text)
returns table (outcome text, contribution_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial_id uuid;
  v_memorial public.memorials%rowtype;
  v_message public.messages%rowtype;
  v_from text;
  v_to text;
begin
  if p_owner_id is null or p_contribution_id is null
     or p_action is null or p_action not in ('approve', 'reject', 'hide', 'unhide') then
    raise exception 'invalid contribution moderation' using errcode = '22023';
  end if;
  select msg.memorial_id into v_memorial_id from public.messages msg where msg.id = p_contribution_id;
  if v_memorial_id is null then
    return query select 'refused'::text, null::text;
    return;
  end if;
  select * into v_memorial from public.memorials where id = v_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    return query select 'refused'::text, null::text;
    return;
  end if;
  select * into v_message from public.messages
   where id = p_contribution_id and memorial_id = v_memorial_id for update;
  if not found or v_memorial.complete_recovery_until <= clock_timestamp() then
    return query select 'refused'::text, null::text;
    return;
  end if;

  v_from := case p_action when 'approve' then 'pending' when 'reject' then 'pending'
                          when 'hide' then 'published' else 'hidden' end;
  v_to := case p_action when 'approve' then 'published' when 'reject' then 'rejected'
                        when 'hide' then 'hidden' else 'published' end;
  if v_message.status = v_to then
    return query select 'unchanged'::text, v_message.status;
    return;
  end if;
  if v_message.status <> v_from then
    return query select 'invalid_transition'::text, v_message.status;
    return;
  end if;

  update public.messages
     set status = v_to,
         visible = v_to = 'published',
         published_at = case when v_to = 'published' then coalesce(published_at, clock_timestamp()) else published_at end,
         moderated_at = clock_timestamp()
   where id = p_contribution_id;
  return query select 'updated'::text, v_to;
end;
$$;

-- Suppression définitive d'une contribution. Pour une photo, le média
-- repasse pending et une réclamation de nettoyage est posée (circuit
-- existant) : le serveur supprime l'objet puis appelle
-- finish_pending_media_cleanup_v1(memorial_id, owner_id, cleanup_claim_id).
-- Résultats : removed (avec la réclamation éventuelle), refused.
create or replace function public.remove_contribution_v1(p_owner_id uuid, p_contribution_id uuid)
returns table (outcome text, memorial_id uuid, cleanup_claim_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_memorial_id uuid;
  v_memorial public.memorials%rowtype;
  v_message public.messages%rowtype;
  v_media public.media%rowtype;
  v_claim uuid;
begin
  if p_owner_id is null or p_contribution_id is null then
    raise exception 'invalid contribution removal' using errcode = '22023';
  end if;
  select msg.memorial_id into v_memorial_id from public.messages msg where msg.id = p_contribution_id;
  if v_memorial_id is null then
    return query select 'refused'::text, null::uuid, null::uuid, null::text;
    return;
  end if;
  select * into v_memorial from public.memorials where id = v_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    return query select 'refused'::text, null::uuid, null::uuid, null::text;
    return;
  end if;
  select * into v_message from public.messages
   where id = p_contribution_id and memorial_id = v_memorial_id for update;
  if not found or v_memorial.complete_recovery_until <= clock_timestamp() then
    return query select 'refused'::text, null::uuid, null::uuid, null::text;
    return;
  end if;
  if v_message.media_id is not null then
    select * into v_media from public.media
     where id = v_message.media_id and memorial_id = v_memorial_id for update;
  end if;

  delete from public.messages where id = p_contribution_id;

  if v_media.id is not null then
    update public.media set status = 'pending' where id = v_media.id;
    select c.id into v_claim from public.pending_media_cleanup_claims c
     where c.media_id = v_media.id and c.completed_at is null;
    if v_claim is null then
      insert into public.pending_media_cleanup_claims (memorial_id, media_id, owner_id)
      values (v_memorial_id, v_media.id, v_memorial.owner_id)
      returning id into v_claim;
    end if;
  end if;

  return query select 'removed'::text, v_memorial_id, v_claim, v_media.storage_path;
end;
$$;

-- Compteur du Tableau de bord (O12) : contributions à examiner, par
-- hommage du propriétaire (tous, ou un seul).
create or replace function public.count_pending_contributions_v1(p_owner_id uuid, p_memorial_id uuid default null)
returns table (memorial_id uuid, pending_stories integer, pending_photos integer, pending_total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         count(msg.id) filter (where msg.message_type = 'testimonial')::integer,
         count(msg.id) filter (where msg.message_type = 'photo')::integer,
         count(msg.id)::integer
    from public.memorials m
    left join public.messages msg on msg.memorial_id = m.id and msg.status = 'pending'
   where p_owner_id is not null
     and m.owner_id = p_owner_id
     and (p_memorial_id is null or m.id = p_memorial_id)
     and (m.complete_recovery_until is null or statement_timestamp() < m.complete_recovery_until)
   group by m.id
   order by m.id;
$$;

revoke all on function public.moderate_contribution_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.remove_contribution_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.count_pending_contributions_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.moderate_contribution_v1(uuid, uuid, text) to service_role;
grant execute on function public.remove_contribution_v1(uuid, uuid) to service_role;
grant execute on function public.count_pending_contributions_v1(uuid, uuid) to service_role;

-- The public readers keep their signatures and carry the premium marker only
-- on internal photo rows. Free photos keep their existing signing path.
create or replace function public.read_public_contributions_v2(
  p_slug text,
  p_limit integer default 24,
  p_before_published_at timestamptz default null,
  p_before_id uuid default null,
  p_types text[] default null
)
returns table (
  contribution_id uuid,
  message_type text,
  author_name text,
  content text,
  caption text,
  published_at timestamptz,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_memorial_id uuid;
  v_requires_term_recheck boolean;
  v_categories jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
begin
  if p_slug is null
     or ((p_before_published_at is null) <> (p_before_id is null))
     or (p_types is not null and (cardinality(p_types) = 0
         or not (p_types <@ array['condolence', 'testimonial', 'photo']))) then
    return;
  end if;
  select m.id, m.access_level = 'complet' into v_memorial_id, v_requires_term_recheck
    from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null or not public.contributions_rubric_public_v1(v_memorial_id, now()) then
    return;
  end if;
  v_categories := public.contribution_categories_in_effect_v1(v_memorial_id);

  return query
    select msg.id, msg.message_type, msg.author_name, msg.content, msg.caption, msg.published_at,
           case when msg.message_type = 'photo' then
             jsonb_build_object('media_id', md.id, 'storage_path', md.storage_path,
                                'width', md.width, 'height', md.height,
                                'requires_term_recheck', v_requires_term_recheck)
           end
      from public.messages msg
      left join public.media md
        on md.id = msg.media_id and md.memorial_id = msg.memorial_id
     where msg.memorial_id = v_memorial_id
       and msg.status = 'published'
       and (p_types is null or msg.message_type = any (p_types))
       and ((msg.message_type = 'condolence' and (v_categories ->> 'condolences')::boolean)
         or (msg.message_type = 'testimonial' and (v_categories ->> 'stories')::boolean)
         or (msg.message_type = 'photo' and (v_categories ->> 'photos')::boolean
             and md.status = 'ready' and md.purpose = 'contribution'))
       and (p_before_published_at is null
            or (msg.published_at, msg.id) < (p_before_published_at, p_before_id))
     order by msg.published_at desc, msg.id desc
     limit v_limit;
end;
$$;

create or replace function public.read_public_contributions_by_ids_v1(p_slug text, p_ids uuid[])
returns table (
  contribution_id uuid,
  message_type text,
  author_name text,
  content text,
  caption text,
  published_at timestamptz,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_memorial_id uuid;
  v_requires_term_recheck boolean;
  v_categories jsonb;
begin
  if p_slug is null or p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then
    return;
  end if;
  select m.id, m.access_level = 'complet' into v_memorial_id, v_requires_term_recheck
    from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null or not public.contributions_rubric_public_v1(v_memorial_id, now()) then
    return;
  end if;
  v_categories := public.contribution_categories_in_effect_v1(v_memorial_id);

  return query
    select msg.id, msg.message_type, msg.author_name, msg.content, msg.caption, msg.published_at,
           case when msg.message_type = 'photo' then
             jsonb_build_object('media_id', md.id, 'storage_path', md.storage_path,
                                'width', md.width, 'height', md.height,
                                'requires_term_recheck', v_requires_term_recheck)
           end
      from public.messages msg
      left join public.media md
        on md.id = msg.media_id and md.memorial_id = msg.memorial_id
     where msg.memorial_id = v_memorial_id
       and msg.id = any (p_ids)
       and msg.status = 'published'
       and ((msg.message_type = 'condolence' and (v_categories ->> 'condolences')::boolean)
         or (msg.message_type = 'testimonial' and (v_categories ->> 'stories')::boolean)
         or (msg.message_type = 'photo' and (v_categories ->> 'photos')::boolean
             and md.status = 'ready' and md.purpose = 'contribution'))
     order by msg.published_at desc, msg.id desc;
end;
$$;

revoke all on function public.read_public_contributions_v2(text, integer, timestamptz, uuid, text[]) from public, anon, authenticated;
revoke all on function public.read_public_contributions_by_ids_v1(text, uuid[]) from public, anon, authenticated;
grant execute on function public.read_public_contributions_v2(text, integer, timestamptz, uuid, text[]) to service_role;
grant execute on function public.read_public_contributions_by_ids_v1(text, uuid[]) to service_role;

notify pgrst, 'reload schema';

commit;
