-- Security V1 lot 3 follow-up — serialize pending cleanup with finalization.
-- This migration is intentionally append-only and is not applied by this PR.

create table public.pending_media_cleanup_claims (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials (id) on delete cascade,
  media_id uuid not null,
  owner_id uuid not null references public.owners (id),
  reserved_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create unique index pending_media_cleanup_claims_active_media_idx
  on public.pending_media_cleanup_claims (media_id)
  where completed_at is null;

alter table public.pending_media_cleanup_claims enable row level security;
revoke all on table public.pending_media_cleanup_claims from public, anon, authenticated, service_role;

create or replace function public.reserve_pending_media_cleanup_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_media_id uuid,
  p_created_before timestamptz default null
)
returns table (claim_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_media public.media%rowtype;
  v_claim public.pending_media_cleanup_claims%rowtype;
begin
  -- Keep the established lock order: memorial, then media, then claim.
  select * into v_memorial
    from public.memorials where id = p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'pending media cleanup refused' using errcode = '42501';
  end if;

  select * into v_media
    from public.media
   where id = p_media_id and memorial_id = p_memorial_id
   for update;
  if not found or v_media.owner_id is distinct from p_owner_id
     or v_media.status <> 'pending'
     or (p_created_before is not null and v_media.created_at >= p_created_before) then
    raise exception 'pending media cleanup conflict' using errcode = '40001';
  end if;
  if v_memorial.status = 'archived'
     or (v_memorial.first_published_at is null and v_memorial.status not in ('draft', 'ready'))
     or (v_memorial.first_published_at is not null and v_memorial.status not in ('published', 'editing'))
     or (v_media.purpose = 'hero' and v_memorial.first_published_at is not null) then
    raise exception 'pending media cleanup lifecycle refused' using errcode = '42501';
  end if;

  select * into v_claim
    from public.pending_media_cleanup_claims
   where media_id = p_media_id and completed_at is null
   for update;
  if found then
    if v_claim.memorial_id is distinct from p_memorial_id
       or v_claim.owner_id is distinct from p_owner_id then
      raise exception 'pending media cleanup refused' using errcode = '42501';
    end if;
    return query select v_claim.id;
    return;
  end if;

  insert into public.pending_media_cleanup_claims (memorial_id, media_id, owner_id)
  values (p_memorial_id, p_media_id, p_owner_id)
  returning * into v_claim;
  return query select v_claim.id;
end;
$$;

create or replace function public.guard_publishing_pending_hero_cleanup_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and exists (
    select 1
      from public.pending_media_cleanup_claims c
      join public.media m on m.id = c.media_id and m.memorial_id = c.memorial_id
     where c.memorial_id = new.id
       and c.completed_at is null
       and m.purpose = 'hero'
       and m.status = 'pending'
  ) then
    raise exception 'pending Hero cleanup in progress' using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists memorials_guard_pending_hero_cleanup on public.memorials;
create trigger memorials_guard_pending_hero_cleanup
before update of status on public.memorials
for each row execute function public.guard_publishing_pending_hero_cleanup_v1();

create or replace function public.finish_pending_media_cleanup_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_claim_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_media public.media%rowtype;
  v_claim public.pending_media_cleanup_claims%rowtype;
begin
  select * into v_memorial
    from public.memorials where id = p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'pending media cleanup refused' using errcode = '42501';
  end if;

  select * into v_media
    from public.media
   where memorial_id = p_memorial_id
     and id = (select media_id from public.pending_media_cleanup_claims where id = p_claim_id)
   for update;

  select * into v_claim
    from public.pending_media_cleanup_claims
   where id = p_claim_id and memorial_id = p_memorial_id and owner_id = p_owner_id
   for update;
  if not found then
    raise exception 'pending media cleanup refused' using errcode = '42501';
  end if;
  if v_claim.completed_at is not null then return; end if;
  if v_media.id is null or v_media.owner_id is distinct from p_owner_id or v_media.status <> 'pending' then
    raise exception 'pending media cleanup conflict' using errcode = '40001';
  end if;

  delete from public.media
   where id = v_claim.media_id and memorial_id = p_memorial_id
     and owner_id = p_owner_id and status = 'pending';
  if not found then
    raise exception 'pending media cleanup conflict' using errcode = '40001';
  end if;
  update public.pending_media_cleanup_claims
     set completed_at = clock_timestamp()
   where id = p_claim_id;
end;
$$;

-- Finalization takes the same memorial/media locks. Whichever operation wins
-- first becomes authoritative: a ready row cannot be claimed, and an active
-- cleanup claim prevents pending -> ready before Storage is touched.
create or replace function public.finalize_memorial_media_upload_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_media_id uuid,
  p_expected_purpose text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer,
  p_height integer
)
returns setof public.media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_media public.media%rowtype;
begin
  if p_expected_purpose not in ('hero', 'gallery') or p_size_bytes <= 0 then
    raise exception 'invalid media finalization' using errcode = '22023';
  end if;
  select * into v_memorial from public.memorials where id = p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'media finalization refused' using errcode = '42501';
  end if;
  if v_memorial.status = 'archived'
     or (v_memorial.first_published_at is null and v_memorial.status not in ('draft', 'ready'))
     or (v_memorial.first_published_at is not null and v_memorial.status not in ('published', 'editing'))
     or (p_expected_purpose = 'hero' and v_memorial.first_published_at is not null) then
    raise exception 'media finalization lifecycle refused' using errcode = '42501';
  end if;
  select * into v_media from public.media
   where id = p_media_id and memorial_id = p_memorial_id for update;
  if not found or v_media.owner_id is distinct from p_owner_id
     or v_media.purpose is distinct from p_expected_purpose then
    raise exception 'media finalization refused' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.pending_media_cleanup_claims
     where media_id = p_media_id and completed_at is null
  ) then
    raise exception 'pending media cleanup already reserved' using errcode = '40001';
  end if;
  if v_media.status = 'ready' then return query select v_media.*; return; end if;
  if v_media.status <> 'pending' then return; end if;
  return query update public.media
     set status = 'ready', mime_type = p_mime_type, size_bytes = p_size_bytes,
         width = p_width, height = p_height
   where id = p_media_id and memorial_id = p_memorial_id and status = 'pending'
   returning *;
end;
$$;

revoke execute on function public.reserve_pending_media_cleanup_v1(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.finish_pending_media_cleanup_v1(uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.guard_publishing_pending_hero_cleanup_v1() from public, anon, authenticated;
grant execute on function public.reserve_pending_media_cleanup_v1(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.finish_pending_media_cleanup_v1(uuid,uuid,uuid) to service_role;
