-- Security V1 — publication foundation.
--
-- This migration deliberately exposes no family-facing publication path.
-- Every function below is service-role-only. The future media lot may wire
-- the Hero retirement lease around Storage calls; until then the publication
-- service remains an internal, uncalled server foundation.

create table public.hero_media_retirement_leases (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials (id) on delete cascade,
  media_id uuid not null,
  owner_id uuid not null references public.owners (id),
  draft_revision bigint not null check (draft_revision >= 0),
  reserved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint hero_media_retirement_lease_window check (expires_at > reserved_at),
  constraint hero_media_retirement_lease_terminal check (
    not (completed_at is not null and cancelled_at is not null)
  )
);

comment on table public.hero_media_retirement_leases is
  'Durable coordination for a future Hero Storage retirement. Publication refuses while any unfinished lease exists. Expiry marks an interrupted operation for explicit reconciliation; it never releases the publication lock by itself.';

create index hero_media_retirement_leases_active_idx
  on public.hero_media_retirement_leases (memorial_id, expires_at)
  where completed_at is null and cancelled_at is null;

alter table public.hero_media_retirement_leases enable row level security;
revoke all on table public.hero_media_retirement_leases from public, anon, authenticated, service_role;

create or replace function public.reserve_hero_media_retirement_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_media_id uuid,
  p_expected_revision bigint
)
returns table (lease_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_content jsonb;
  v_revision bigint;
  v_media public.media%rowtype;
  v_now timestamptz := clock_timestamp();
  v_lease public.hero_media_retirement_leases%rowtype;
begin
  if p_expected_revision is null then
    raise exception 'invalid hero retirement request' using errcode = '22023';
  end if;

  -- Shared global order: memorial -> draft -> media/lease.
  select * into v_memorial
    from public.memorials
   where id = p_memorial_id
   for update;

  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'hero retirement refused' using errcode = '42501';
  end if;
  if v_memorial.first_published_at is not null
     or v_memorial.status not in ('draft', 'ready') then
    raise exception 'hero locked after publication' using errcode = '42501';
  end if;

  select content, revision into v_content, v_revision
    from public.memorial_drafts
   where memorial_id = p_memorial_id
   for update;

  if not found or v_revision is distinct from p_expected_revision then
    raise exception 'memorial draft changed' using errcode = '40001';
  end if;
  if v_content #>> '{hero,photo,mediaId}' is not distinct from p_media_id::text then
    raise exception 'canonical hero media cannot be retired' using errcode = '23514';
  end if;

  select * into v_media
    from public.media
   where id = p_media_id
     and memorial_id = p_memorial_id
   for update;

  if not found
     or v_media.owner_id is distinct from p_owner_id
     or v_media.purpose <> 'hero'
     or v_media.status <> 'ready' then
    raise exception 'hero retirement refused' using errcode = '42501';
  end if;

  select * into v_lease
    from public.hero_media_retirement_leases
   where memorial_id = p_memorial_id
     and media_id = p_media_id
     and completed_at is null
     and cancelled_at is null
   order by reserved_at desc
   limit 1
   for update;

  if found then
    if v_lease.expires_at <= v_now then
      raise exception 'hero retirement reconciliation required' using errcode = '40001';
    end if;
    return query select v_lease.id, v_lease.expires_at;
    return;
  end if;

  insert into public.hero_media_retirement_leases
    (memorial_id, media_id, owner_id, draft_revision, reserved_at, expires_at)
  values
    (p_memorial_id, p_media_id, p_owner_id, v_revision, v_now, v_now + interval '5 minutes')
  returning * into v_lease;

  return query select v_lease.id, v_lease.expires_at;
end;
$$;

create or replace function public.finish_hero_media_retirement_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_lease_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_lease public.hero_media_retirement_leases%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_outcome not in ('completed', 'cancelled') then
    raise exception 'invalid hero retirement outcome' using errcode = '22023';
  end if;

  select * into v_memorial
    from public.memorials
   where id = p_memorial_id
   for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'hero retirement refused' using errcode = '42501';
  end if;

  select * into v_lease
    from public.hero_media_retirement_leases
   where id = p_lease_id
     and memorial_id = p_memorial_id
     and owner_id = p_owner_id
   for update;
  if not found then
    raise exception 'hero retirement refused' using errcode = '42501';
  end if;

  if p_outcome = 'completed' then
    if v_lease.completed_at is not null then
      return;
    end if;
    if v_lease.cancelled_at is not null or v_lease.expires_at <= v_now then
      raise exception 'hero retirement lease expired' using errcode = '40001';
    end if;
    update public.hero_media_retirement_leases
       set completed_at = v_now
     where id = p_lease_id;
  elsif v_lease.cancelled_at is not null then
    return;
  elsif v_lease.completed_at is not null then
    raise exception 'completed hero retirement cannot be cancelled' using errcode = '23514';
  else
    update public.hero_media_retirement_leases
       set cancelled_at = v_now
     where id = p_lease_id;
  end if;
end;
$$;

create or replace function public.commit_memorial_publication_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_expected_revision bigint,
  p_expected_status text,
  p_expected_first_published_at timestamptz,
  p_expected_content jsonb
)
returns table (published_at timestamptz, first_published_at timestamptz, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_content jsonb;
  v_revision bigint;
  v_now timestamptz := clock_timestamp();
  v_first_published_at timestamptz;
begin
  if p_expected_revision is null or p_expected_content is null then
    raise exception 'invalid memorial publication request' using errcode = '22023';
  end if;

  -- Same lock order as Security V1 lot 2. A future Hero retirement
  -- reservation also starts with this row, so either publication or the
  -- lease wins cleanly; neither can pass an earlier, stale status check.
  select * into v_memorial
    from public.memorials
   where id = p_memorial_id
   for update;

  if not found or v_memorial.owner_id is distinct from p_owner_id then
    raise exception 'memorial publication refused' using errcode = '42501';
  end if;
  if v_memorial.status is distinct from p_expected_status
     or v_memorial.first_published_at is distinct from p_expected_first_published_at then
    raise exception 'memorial lifecycle changed' using errcode = '40001';
  end if;
  if not (
    (v_memorial.status = 'ready' and v_memorial.first_published_at is null)
    or (v_memorial.status = 'editing' and v_memorial.first_published_at is not null)
  ) then
    raise exception 'memorial publication transition refused' using errcode = '23514';
  end if;
  if v_memorial.language is null or nullif(btrim(v_memorial.slug), '') is null then
    raise exception 'memorial publication data incomplete' using errcode = '23514';
  end if;

  select content, revision into v_content, v_revision
    from public.memorial_drafts
   where memorial_id = p_memorial_id
   for update;

  if not found
     or v_revision is distinct from p_expected_revision
     or v_content is distinct from p_expected_content then
    raise exception 'memorial draft changed' using errcode = '40001';
  end if;

  if exists (
    select 1
      from public.hero_media_retirement_leases
     where memorial_id = p_memorial_id
       and completed_at is null
       and cancelled_at is null
  ) then
    raise exception 'hero media retirement in progress' using errcode = '40001';
  end if;

  insert into public.memorial_published_snapshots (memorial_id, content, published_at)
  values (p_memorial_id, v_content, v_now)
  on conflict (memorial_id) do update
    set content = excluded.content,
        published_at = excluded.published_at;

  v_first_published_at := coalesce(v_memorial.first_published_at, v_now);
  update public.memorials
     set status = 'published',
         first_published_at = v_first_published_at
   where id = p_memorial_id;

  return query select v_now, v_first_published_at, v_revision;
end;
$$;

comment on function public.commit_memorial_publication_v1(uuid, uuid, bigint, text, timestamptz, jsonb) is
  'Internal Security V1 publication transaction. Locks memorial then draft, repeats owner/lifecycle/content CAS, blocks active Hero retirement, snapshots the exact draft and moves to published atomically. Service-role-only and intentionally not wired to a family action.';

revoke execute on function public.reserve_hero_media_retirement_v1(uuid, uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.finish_hero_media_retirement_v1(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.commit_memorial_publication_v1(uuid, uuid, bigint, text, timestamptz, jsonb) from public, anon, authenticated;

grant execute on function public.reserve_hero_media_retirement_v1(uuid, uuid, uuid, bigint) to service_role;
grant execute on function public.finish_hero_media_retirement_v1(uuid, uuid, uuid, text) to service_role;
grant execute on function public.commit_memorial_publication_v1(uuid, uuid, bigint, text, timestamptz, jsonb) to service_role;
