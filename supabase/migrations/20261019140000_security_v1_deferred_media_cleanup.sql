-- Security V1 lot 3 final follow-up — keep upload paths traceable until every
-- signed upload permission has certainly expired. Append-only; not applied by
-- this PR.

create or replace function public.finish_hero_media_retirement_v1(
  p_memorial_id uuid, p_owner_id uuid, p_lease_id uuid, p_outcome text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_lease public.hero_media_retirement_leases%rowtype;
  v_content jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_outcome not in ('completed','cancelled') then raise exception 'invalid hero retirement outcome' using errcode='22023'; end if;
  select * into v_memorial from public.memorials where id=p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then raise exception 'hero retirement refused' using errcode='42501'; end if;
  select * into v_lease from public.hero_media_retirement_leases
   where id=p_lease_id and memorial_id=p_memorial_id and owner_id=p_owner_id for update;
  if not found then raise exception 'hero retirement refused' using errcode='42501'; end if;
  if p_outcome='cancelled' then
    if v_lease.cancelled_at is not null then return; end if;
    if v_lease.completed_at is not null then raise exception 'completed hero retirement cannot be cancelled' using errcode='23514'; end if;
    update public.hero_media_retirement_leases set cancelled_at=v_now where id=p_lease_id; return;
  end if;
  if v_lease.completed_at is not null then return; end if;
  if v_lease.cancelled_at is not null or v_lease.expires_at <= v_now then raise exception 'hero retirement lease expired' using errcode='40001'; end if;
  if v_memorial.first_published_at is not null or v_memorial.status not in ('draft','ready') then raise exception 'hero locked after publication' using errcode='42501'; end if;
  select content into v_content from public.memorial_drafts where memorial_id=p_memorial_id for update;
  if not found or public.memorial_content_references_media_v1(v_content, v_lease.media_id) then raise exception 'hero media is referenced' using errcode='23514'; end if;

  -- Logical retirement first: the row stops being displayable, but remains an
  -- inventory record while the old signed upload token can still target its
  -- path. The active cleanup claim replaces this lease as the durable block.
  insert into public.pending_media_cleanup_claims (memorial_id, media_id, owner_id)
  values (p_memorial_id, v_lease.media_id, p_owner_id)
  on conflict do nothing;
  update public.media set status='pending'
   where id=v_lease.media_id and memorial_id=p_memorial_id
     and owner_id=p_owner_id and purpose='hero' and status='ready';
  if not found then raise exception 'hero retirement conflict' using errcode='40001'; end if;
  update public.hero_media_retirement_leases set completed_at=v_now where id=p_lease_id;
end;
$$;

create or replace function public.finish_gallery_media_retirement_v1(
  p_memorial_id uuid, p_owner_id uuid, p_lease_id uuid, p_outcome text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_lease public.gallery_media_retirement_leases%rowtype;
  v_content jsonb;
  v_snapshot jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_outcome not in ('completed','cancelled') then raise exception 'invalid gallery retirement outcome' using errcode='22023'; end if;
  select * into v_memorial from public.memorials where id=p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then raise exception 'gallery retirement refused' using errcode='42501'; end if;
  select * into v_lease from public.gallery_media_retirement_leases
   where id=p_lease_id and memorial_id=p_memorial_id and owner_id=p_owner_id for update;
  if not found then raise exception 'gallery retirement refused' using errcode='42501'; end if;
  if p_outcome='cancelled' then
    if v_lease.cancelled_at is not null then return; end if;
    if v_lease.completed_at is not null then raise exception 'completed gallery retirement cannot be cancelled' using errcode='23514'; end if;
    update public.gallery_media_retirement_leases set cancelled_at=v_now where id=p_lease_id; return;
  end if;
  if v_lease.completed_at is not null then return; end if;
  if v_lease.cancelled_at is not null or v_lease.expires_at <= v_now then raise exception 'gallery retirement reconciliation required' using errcode='40001'; end if;
  select content into v_content from public.memorial_drafts where memorial_id=p_memorial_id for update;
  if not found or public.memorial_content_references_media_v1(v_content, v_lease.media_id) then raise exception 'gallery media still referenced by draft' using errcode='23514'; end if;
  select content into v_snapshot from public.memorial_published_snapshots where memorial_id=p_memorial_id for share;
  if found and public.memorial_content_references_media_v1(v_snapshot, v_lease.media_id) then raise exception 'gallery media retained for published snapshot' using errcode='23514'; end if;

  insert into public.pending_media_cleanup_claims (memorial_id, media_id, owner_id)
  values (p_memorial_id, v_lease.media_id, p_owner_id)
  on conflict do nothing;
  update public.media set status='pending'
   where id=v_lease.media_id and memorial_id=p_memorial_id
     and owner_id=p_owner_id and purpose='gallery' and status='ready';
  if not found then raise exception 'gallery retirement conflict' using errcode='40001'; end if;
  update public.gallery_media_retirement_leases set completed_at=v_now where id=p_lease_id;
end;
$$;

create or replace function public.guard_retiring_media_references_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.hero_media_retirement_leases l
     where l.memorial_id=new.memorial_id and l.completed_at is null and l.cancelled_at is null
       and public.memorial_content_references_media_v1(new.content,l.media_id)
  ) or exists (
    select 1 from public.gallery_media_retirement_leases l
     where l.memorial_id=new.memorial_id and l.completed_at is null and l.cancelled_at is null
       and public.memorial_content_references_media_v1(new.content,l.media_id)
  ) or exists (
    select 1 from public.pending_media_cleanup_claims c
     where c.memorial_id=new.memorial_id and c.completed_at is null
       and public.memorial_content_references_media_v1(new.content,c.media_id)
  ) then raise exception 'retiring media cannot be referenced' using errcode='40001'; end if;
  return new;
end;
$$;

revoke execute on function public.finish_hero_media_retirement_v1(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.finish_gallery_media_retirement_v1(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.guard_retiring_media_references_v1() from public, anon, authenticated;
