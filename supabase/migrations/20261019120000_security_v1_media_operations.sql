-- Security V1 lot 3 — lifecycle-safe Hero and Gallery media mutations.
-- Appended after the publication foundation; never applied by this change.

create or replace function public.memorial_content_references_media_v1(
  p_content jsonb,
  p_media_id uuid
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_gallery jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then return true; end if;
  if p_content #>> '{hero,photo,mediaId}' = p_media_id::text then return true; end if;
  v_gallery := p_content #> '{gallery,items}';
  if v_gallery is null then return false; end if;
  if jsonb_typeof(v_gallery) <> 'array' then return true; end if;
  return exists (
    select 1 from jsonb_array_elements(v_gallery) item
     where item ->> 'mediaId' = p_media_id::text
  );
end;
$$;

create or replace function public.reserve_memorial_media_upload_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_media_id uuid,
  p_storage_path text,
  p_purpose text,
  p_declared_mime_type text
)
returns setof public.media
language plpgsql
security definer
set search_path = ''
as $$
declare v_memorial public.memorials%rowtype;
begin
  if p_purpose not in ('hero', 'gallery')
     or p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_storage_path not like p_memorial_id::text || '/' || p_media_id::text || '/original.%' then
    raise exception 'invalid media reservation' using errcode = '22023';
  end if;
  select * into v_memorial from public.memorials where id = p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'media reservation refused' using errcode = '42501';
  end if;
  if v_memorial.status = 'archived'
     or (v_memorial.first_published_at is null and v_memorial.status not in ('draft', 'ready'))
     or (v_memorial.first_published_at is not null and v_memorial.status not in ('published', 'editing'))
     or (p_purpose = 'hero' and v_memorial.first_published_at is not null) then
    raise exception 'media reservation lifecycle refused' using errcode = '42501';
  end if;
  return query
    insert into public.media
      (id, memorial_id, owner_id, storage_path, media_type, purpose, status, mime_type)
    values
      (p_media_id, p_memorial_id, p_owner_id, p_storage_path, 'photo', p_purpose, 'pending', p_declared_mime_type)
    returning *;
end;
$$;

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
  if v_media.status = 'ready' then return query select v_media.*; return; end if;
  if v_media.status <> 'pending' then return; end if;
  return query update public.media
     set status = 'ready', mime_type = p_mime_type, size_bytes = p_size_bytes,
         width = p_width, height = p_height
   where id = p_media_id and memorial_id = p_memorial_id and status = 'pending'
   returning *;
end;
$$;

create table public.gallery_media_retirement_leases (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials (id) on delete cascade,
  media_id uuid not null,
  owner_id uuid not null references public.owners (id),
  draft_revision bigint not null check (draft_revision >= 0),
  reserved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint gallery_media_retirement_lease_window check (expires_at > reserved_at),
  constraint gallery_media_retirement_lease_terminal check (not (completed_at is not null and cancelled_at is not null))
);
create index gallery_media_retirement_leases_active_idx
  on public.gallery_media_retirement_leases (memorial_id, expires_at)
  where completed_at is null and cancelled_at is null;
alter table public.gallery_media_retirement_leases enable row level security;
revoke all on table public.gallery_media_retirement_leases from public, anon, authenticated, service_role;

create or replace function public.reserve_gallery_media_retirement_v1(
  p_memorial_id uuid, p_owner_id uuid, p_media_id uuid, p_expected_revision bigint
)
returns table (lease_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_media public.media%rowtype;
  v_content jsonb;
  v_revision bigint;
  v_snapshot jsonb;
  v_lease public.gallery_media_retirement_leases%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_memorial from public.memorials where id = p_memorial_id for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id or v_memorial.status = 'archived'
     or (v_memorial.first_published_at is null and v_memorial.status not in ('draft','ready'))
     or (v_memorial.first_published_at is not null and v_memorial.status not in ('published','editing')) then
    raise exception 'gallery retirement refused' using errcode = '42501';
  end if;
  select content, revision into v_content, v_revision from public.memorial_drafts
   where memorial_id = p_memorial_id for update;
  if not found or v_revision is distinct from p_expected_revision then
    raise exception 'memorial draft changed' using errcode = '40001';
  end if;
  if public.memorial_content_references_media_v1(v_content, p_media_id) then
    raise exception 'gallery media still referenced by draft' using errcode = '23514';
  end if;
  select content into v_snapshot from public.memorial_published_snapshots
   where memorial_id = p_memorial_id for share;
  if found and public.memorial_content_references_media_v1(v_snapshot, p_media_id) then
    raise exception 'gallery media retained for published snapshot' using errcode = '23514';
  end if;
  select * into v_media from public.media
   where id = p_media_id and memorial_id = p_memorial_id for update;
  if not found or v_media.owner_id is distinct from p_owner_id
     or v_media.purpose <> 'gallery' or v_media.status <> 'ready' then
    raise exception 'gallery retirement refused' using errcode = '42501';
  end if;
  select * into v_lease from public.gallery_media_retirement_leases
   where memorial_id = p_memorial_id and media_id = p_media_id
     and completed_at is null and cancelled_at is null
   order by reserved_at desc limit 1 for update;
  if found then
    if v_lease.expires_at <= v_now then
      raise exception 'gallery retirement reconciliation required' using errcode = '40001';
    end if;
    return query select v_lease.id, v_lease.expires_at; return;
  end if;
  insert into public.gallery_media_retirement_leases
    (memorial_id, media_id, owner_id, draft_revision, reserved_at, expires_at)
  values (p_memorial_id, p_media_id, p_owner_id, v_revision, v_now, v_now + interval '5 minutes')
  returning * into v_lease;
  return query select v_lease.id, v_lease.expires_at;
end;
$$;

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
  delete from public.media where id=v_lease.media_id and memorial_id=p_memorial_id and owner_id=p_owner_id and purpose='hero';
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
  delete from public.media where id=v_lease.media_id and memorial_id=p_memorial_id and owner_id=p_owner_id and purpose='gallery';
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
  ) then raise exception 'retiring media cannot be referenced' using errcode='40001'; end if;
  return new;
end;
$$;
drop trigger if exists memorial_drafts_guard_retiring_media on public.memorial_drafts;
create trigger memorial_drafts_guard_retiring_media before update of content on public.memorial_drafts
for each row execute function public.guard_retiring_media_references_v1();

-- Close historical direct-update routes after first publication. Security V1
-- RPCs are SECURITY DEFINER and remain the only sanctioned post-publish path.
drop policy if exists memorials_update_own on public.memorials;
create policy memorials_update_own on public.memorials for update to authenticated
  using (owner_id = current_owner_id() and first_published_at is null and status in ('draft','ready'))
  with check (owner_id = current_owner_id() and first_published_at is null and status in ('draft','ready'));
drop policy if exists memorial_drafts_update_own on public.memorial_drafts;
create policy memorial_drafts_update_own on public.memorial_drafts for update to authenticated
  using (exists (select 1 from public.memorials m where m.id=memorial_id and m.owner_id=current_owner_id() and m.first_published_at is null and m.status in ('draft','ready')))
  with check (exists (select 1 from public.memorials m where m.id=memorial_id and m.owner_id=current_owner_id() and m.first_published_at is null and m.status in ('draft','ready')));

revoke execute on function public.memorial_content_references_media_v1(jsonb,uuid) from public, anon, authenticated;
revoke execute on function public.reserve_memorial_media_upload_v1(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke execute on function public.finalize_memorial_media_upload_v1(uuid,uuid,uuid,text,text,bigint,integer,integer) from public, anon, authenticated;
revoke execute on function public.reserve_gallery_media_retirement_v1(uuid,uuid,uuid,bigint) from public, anon, authenticated;
revoke execute on function public.finish_gallery_media_retirement_v1(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.guard_retiring_media_references_v1() from public, anon, authenticated;
grant execute on function public.reserve_memorial_media_upload_v1(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.finalize_memorial_media_upload_v1(uuid,uuid,uuid,text,text,bigint,integer,integer) to service_role;
grant execute on function public.reserve_gallery_media_retirement_v1(uuid,uuid,uuid,bigint) to service_role;
grant execute on function public.finish_gallery_media_retirement_v1(uuid,uuid,uuid,text) to service_role;
