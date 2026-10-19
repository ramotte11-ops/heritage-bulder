-- Security V1, lot 2: atomic family-content persistence and traceability.
--
-- PRE-DEPLOYMENT STATUS
-- ---------------------
-- This migration is prepared for review only. It has not been applied to a
-- real Supabase project. Deploy only after the QG has reviewed the preflight,
-- the local database proof and the still-unprotected media paths listed in
-- the PR.
--
-- The application computes and authorizes the real content diff before
-- calling these RPCs. The database then supplies the part TypeScript cannot:
-- one transaction that locks the memorial lifecycle, checks the draft CAS,
-- writes the change and appends its audit event together.

-- A monotonic integer is the draft's compare-and-swap token. updated_at stays
-- the family-facing timestamp; it is not used as a lock because timestamps are
-- not an unambiguous version under concurrent writes.
alter table public.memorial_drafts
  add column revision bigint not null default 0,
  add constraint memorial_drafts_revision_nonnegative check (revision >= 0);

comment on column public.memorial_drafts.revision is
  'Security V1 lot 2 optimistic-concurrency token. Every atomic content/visibility commit increments it once; stale expected revisions fail with SQLSTATE 40001.';

-- Separate from admin_audit_events by design: these are family edits, not
-- staff/admin operations. No content value is stored, only structural facts.
create table public.memorial_edit_audit_events (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials (id) on delete restrict,
  actor_owner_id uuid not null references public.owners (id) on delete restrict,
  operation text not null,
  mutation_targets text[] not null,
  memorial_status text not null,
  draft_revision bigint,
  created_at timestamptz not null default now(),

  constraint memorial_edit_audit_operation_format
    check (operation ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  constraint memorial_edit_audit_targets_nonempty
    check (cardinality(mutation_targets) > 0),
  constraint memorial_edit_audit_status
    check (memorial_status in ('draft', 'ready', 'published', 'editing', 'archived')),
  constraint memorial_edit_audit_revision_nonnegative
    check (draft_revision is null or draft_revision >= 0)
);

comment on table public.memorial_edit_audit_events is
  'Security V1 lot 2 append-only family-edit ledger. Records actor owner id, operation, authorized target paths, lifecycle status and draft revision; never memorial text, captions, answers or media URLs. Written in the same transaction as the edit RPC.';

create index memorial_edit_audit_events_memorial_idx
  on public.memorial_edit_audit_events (memorial_id, created_at desc);

alter table public.memorial_edit_audit_events enable row level security;

-- Append-only is a privilege guarantee. No application role can select,
-- insert, update, delete or truncate the ledger directly. The DEFINER RPC is
-- its only writer and receives no content values for this table.
revoke all privileges on table public.memorial_edit_audit_events
  from public, anon, authenticated, service_role;

create or replace function public.commit_memorial_draft_edit_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_expected_revision bigint,
  p_expected_status text,
  p_expected_first_published_at timestamptz,
  p_content jsonb,
  p_operation text,
  p_mutation_targets text[]
)
returns table (updated_at timestamptz, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_updated_at timestamptz;
  v_revision bigint;
begin
  if p_expected_revision < 0
     or p_content is null
     or jsonb_typeof(p_content) <> 'object'
     or p_operation not in ('content.saved', 'visibility.changed')
     or coalesce(cardinality(p_mutation_targets), 0) = 0 then
    raise exception 'invalid memorial edit request' using errcode = '22023';
  end if;

  -- Lock order is always memorial -> draft. A publication UPDATE on the same
  -- memorial serializes with this lock, so a save authorized from pre-publish
  -- facts cannot commit after publication unnoticed.
  select m.* into v_memorial
  from public.memorials m
  where m.id = p_memorial_id
  for update;

  if not found or v_memorial.owner_id <> p_owner_id then
    raise exception 'memorial edit refused' using errcode = '42501';
  end if;

  if v_memorial.status is distinct from p_expected_status
     or v_memorial.first_published_at is distinct from p_expected_first_published_at then
    raise exception 'memorial lifecycle changed' using errcode = '40001';
  end if;

  update public.memorial_drafts d
  set content = p_content,
      revision = d.revision + 1
  where d.memorial_id = p_memorial_id
    and d.revision = p_expected_revision
  returning d.updated_at, d.revision into v_updated_at, v_revision;

  if not found then
    raise exception 'memorial draft changed' using errcode = '40001';
  end if;

  if v_memorial.first_published_at is not null then
    insert into public.memorial_edit_audit_events
      (memorial_id, actor_owner_id, operation, mutation_targets, memorial_status, draft_revision)
    values
      (p_memorial_id, p_owner_id, p_operation, p_mutation_targets, v_memorial.status, v_revision);
  end if;

  return query select v_updated_at, v_revision;
end;
$$;

comment on function public.commit_memorial_draft_edit_v1(uuid, uuid, bigint, text, timestamptz, jsonb, text, text[]) is
  'Security V1 lot 2 atomic draft CAS. SECURITY DEFINER is required so authenticated clients retain no direct audit-table privilege and only trusted server code can execute. Rechecks owner, lifecycle and revision under locks; edit plus post-publication audit commit or roll back together.';

revoke all on function public.commit_memorial_draft_edit_v1(uuid, uuid, bigint, text, timestamptz, jsonb, text, text[])
  from public, anon, authenticated;
grant execute on function public.commit_memorial_draft_edit_v1(uuid, uuid, bigint, text, timestamptz, jsonb, text, text[])
  to service_role;

create or replace function public.commit_memorial_configuration_edit_v1(
  p_memorial_id uuid,
  p_owner_id uuid,
  p_expected_status text,
  p_expected_first_published_at timestamptz,
  p_target text,
  p_expected_value text,
  p_value text,
  p_mutation_targets text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_operation text;
begin
  if p_value is null or coalesce(cardinality(p_mutation_targets), 0) = 0 then
    raise exception 'invalid memorial configuration edit request' using errcode = '22023';
  end if;

  select m.* into v_memorial
  from public.memorials m
  where m.id = p_memorial_id
  for update;

  if not found or v_memorial.owner_id <> p_owner_id then
    raise exception 'memorial edit refused' using errcode = '42501';
  end if;

  if v_memorial.status is distinct from p_expected_status
     or v_memorial.first_published_at is distinct from p_expected_first_published_at then
    raise exception 'memorial lifecycle changed' using errcode = '40001';
  end if;

  if p_target = 'language' then
    if v_memorial.language is distinct from p_expected_value then
      raise exception 'memorial configuration changed' using errcode = '40001';
    end if;
    update public.memorials set language = p_value where id = p_memorial_id;
    v_operation := 'configuration.language';
  elsif p_target = 'skinVariant' then
    if v_memorial.skin_variant is distinct from p_expected_value then
      raise exception 'memorial configuration changed' using errcode = '40001';
    end if;
    update public.memorials set skin_variant = p_value where id = p_memorial_id;
    v_operation := 'configuration.skin_variant';
  else
    raise exception 'unknown memorial configuration target' using errcode = '22023';
  end if;

  if v_memorial.first_published_at is not null then
    insert into public.memorial_edit_audit_events
      (memorial_id, actor_owner_id, operation, mutation_targets, memorial_status, draft_revision)
    values
      (p_memorial_id, p_owner_id, v_operation, p_mutation_targets, v_memorial.status, null);
  end if;
end;
$$;

comment on function public.commit_memorial_configuration_edit_v1(uuid, uuid, text, timestamptz, text, text, text, text[]) is
  'Security V1 lot 2 atomic language/skin-variant write. Callable only by service_role; rechecks owner and lifecycle under lock and audits any future authorized post-publication write in the same transaction.';

revoke all on function public.commit_memorial_configuration_edit_v1(uuid, uuid, text, timestamptz, text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.commit_memorial_configuration_edit_v1(uuid, uuid, text, timestamptz, text, text, text, text[])
  to service_role;

-- Deliberate transitional limit: authenticated's existing direct draft/config
-- grants are not revoked in this lot because the Hero/Gallery media actions
-- still depend on them and are explicitly reserved for the next security lot.
-- Therefore this migration secures the Server Actions wired in Lot 2 but does
-- not claim the complete post-publication perimeter yet.
