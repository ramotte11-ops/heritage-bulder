-- Mission 002: visitor message metadata. No visitor-facing form and no
-- moderation UI are built in this mission — this only prepares the
-- schema so a later mission can build both without a redesign.
create table messages (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references memorials (id) on delete cascade,
  -- Mirrors config/messages.ts.
  message_type text not null check (message_type in ('condolence', 'memory_message', 'testimonial')),
  author_name text not null check (char_length(btrim(author_name)) > 0),
  content text not null check (char_length(btrim(content)) > 0),
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index messages_memorial_id_idx on messages (memorial_id);

alter table messages enable row level security;

-- Owner: read and moderate (hide/delete) messages on their own
-- memorials. No owner INSERT policy — the family does not write
-- condolence messages as themselves through this path.
create policy messages_select_own on messages
  for select
  to authenticated
  using (memorial_id in (select id from memorials where owner_id = current_owner_id()));

create policy messages_moderate_own on messages
  for update
  to authenticated
  using (memorial_id in (select id from memorials where owner_id = current_owner_id()))
  with check (memorial_id in (select id from memorials where owner_id = current_owner_id()));

create policy messages_delete_own on messages
  for delete
  to authenticated
  using (memorial_id in (select id from memorials where owner_id = current_owner_id()));

-- Public: schema-level readiness only (Mission 002 brief, section 5 —
-- "le schéma doit pouvoir supporter plus tard... ajout contrôlé d'un
-- message"). This INSERT policy is the database-level half of that
-- control: a message can only be inserted for a PUBLISHED memorial, of a
-- type whose matching section is actually enabled on it. It enforces
-- authorization, not abuse-prevention — spam/rate-limiting is explicitly
-- out of scope for Mission 002 and must be added at the application
-- layer before this is ever exposed to real visitors.
--
-- No public SELECT policy is created: a public read/display view is
-- part of the mission that builds the actual public memorial page, not
-- this one.
--
-- Uses public_memorial_publication_state() (defined in
-- 20260829154000_memorials.sql) instead of querying memorials directly,
-- for the same reason as memorial_published_snapshots' public policy:
-- visitors are never granted direct SELECT on memorials.
create policy messages_insert_public on messages
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public_memorial_publication_state(messages.memorial_id) s
      where s.status = 'published'
        and (
          (messages.message_type = 'condolence' and 'condolences' = any (s.enabled_sections))
          or (messages.message_type = 'testimonial' and 'testimonials' = any (s.enabled_sections))
          or (messages.message_type = 'memory_message' and 'memoryMessage' = any (s.enabled_sections))
        )
    )
  );
