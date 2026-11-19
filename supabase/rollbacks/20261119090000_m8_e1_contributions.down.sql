-- HERITAGE HOMMAGE — M8-E1 : RETOUR ARRIÈRE de
-- supabase/migrations/20261119090000_m8_e1_contributions.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG.
--
-- Revient exactement à l'état QG 017 A2 :
--   - supprime les RPC, fonctions internes, déclencheurs et tables M8-E1 ;
--   - retire les colonnes, contraintes et index ajoutés à messages, et lui
--     rend content NOT NULL et le type sans photo ;
--   - rend à media_purpose_check ses deux valeurs (hero, gallery) ;
--   - restaure owner_free_storage_bytes_v1 et guard_free_storage_budget_v1
--     dans leur version QG 017, à l'identique, avec leurs privilèges
--     (aucun rôle) ;
--   - retire contributions de avis_snapshot_keys.
--
-- GARDE-FOU : le retour arrière REFUSE de s'exécuter (et ne change rien)
-- dès qu'une contribution réelle existe (message photo, message déposé
-- par les RPC M8, média contribution). Ces données de proches ne sont
-- jamais supprimées par un script : leur sort est une décision QG.

begin;

do $$
begin
  if exists (select 1 from public.messages where message_type = 'photo' or idempotency_key is not null or media_id is not null)
     or exists (select 1 from public.media where purpose = 'contribution') then
    raise exception 'M8-E1 rollback refused: real contributions exist (decision QG required)'
      using errcode = 'P0001';
  end if;
end;
$$;

-- --- 10. O12 -------------------------------------------------------------
drop function if exists public.mark_contributions_digest_v1(uuid, text, text);
drop function if exists public.claim_contributions_digests_v1(timestamptz, integer);
drop function if exists public.set_contributions_digest_preference_v1(uuid, boolean);
drop table if exists public.contributions_digest_log;
drop table if exists public.owner_notification_preferences;

-- --- 9. Actions de la famille -------------------------------------------
drop function if exists public.set_contribution_categories_v1(uuid, uuid, boolean, boolean, boolean, bigint);
drop function if exists public.count_pending_contributions_v1(uuid, uuid);
drop function if exists public.remove_contribution_v1(uuid, uuid);
drop function if exists public.moderate_contribution_v1(uuid, uuid, text);

-- --- 8. Dépôts et lecture ------------------------------------------------
drop function if exists public.read_public_contributions_v1(text, integer, timestamptz, uuid);
drop function if exists public.finalize_contribution_photo_v1(text, uuid, text, text, uuid, text, bigint, integer, integer);
drop function if exists public.reserve_contribution_photo_v1(text, uuid, text, text);
drop function if exists public.submit_contribution_v1(text, text, text, text, uuid);
drop function if exists public.contribution_pending_photos_v1(uuid, timestamptz);
drop function if exists public.contribution_rate_count_v1(uuid, text);
drop function if exists public.contribution_rate_open_v1(uuid, text, timestamptz);
drop function if exists public.contribution_limits_v1(uuid, text);
drop function if exists public.contribution_text_valid_v1(text, integer);

-- --- 7. Autorisation v2 (la v1 n'a jamais été modifiée) -----------------
drop function if exists public.public_memorial_message_allowed_v2(uuid, text);

-- --- 6. avis_snapshot_keys ----------------------------------------------
update public.memorial_access_settings
   set avis_snapshot_keys = array_remove(avis_snapshot_keys, 'contributions'),
       updated_at = now()
 where id
   and 'contributions' = any (avis_snapshot_keys);

-- --- 5. Q7-B : versions QG 017, à l'identique ---------------------------
create or replace function public.owner_free_storage_bytes_v1(p_owner_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(md.size_bytes), 0)::bigint
    from public.media md
    join public.memorials m on m.id = md.memorial_id
   where m.owner_id = p_owner_id
     and m.access_level = 'avis'
     and md.status = 'ready';
$$;

create or replace function public.guard_free_storage_budget_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_level text;
  v_budget bigint;
  v_used bigint;
begin
  if tg_op = 'UPDATE' and not (old.status = 'pending' and new.status = 'ready') then
    return new;
  end if;
  select m.owner_id, m.access_level into v_owner, v_level
    from public.memorials m where m.id = new.memorial_id;
  if v_level is distinct from 'avis' or v_owner is null then
    return new;
  end if;
  select s.free_storage_bytes_per_owner into v_budget
    from public.memorial_access_settings s where s.id;
  if v_budget is null then
    return new;
  end if;
  -- Sérialise les finalisations d'un même compte (verrou dédié : aucun
  -- autre verrou n'est pris dans un ordre différent).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('heritage-owner-storage:' || v_owner::text, 0));
  v_used := public.owner_free_storage_bytes_v1(v_owner);
  if tg_op = 'INSERT' then
    -- Pré-contrôle à la réservation : budget déjà épuisé, inutile d'envoyer.
    if v_used >= v_budget then
      raise exception 'free storage budget reached' using errcode = 'HD507';
    end if;
  elsif v_used + coalesce(new.size_bytes, 0) > v_budget then
    raise exception 'free storage budget reached' using errcode = 'HD507';
  end if;
  return new;
end;
$$;

revoke all on function public.owner_free_storage_bytes_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.guard_free_storage_budget_v1() from public, anon, authenticated, service_role;

-- --- 4. Catégories en vigueur -------------------------------------------
drop trigger if exists memorial_published_snapshots_sync_contribution_categories on public.memorial_published_snapshots;
drop function if exists public.sync_contribution_categories_on_publication_v1();
drop function if exists public.contribution_categories_in_effect_v1(uuid);
drop function if exists public.contributions_rubric_public_v1(uuid, timestamptz);
drop function if exists public.contribution_features_v1(jsonb);
drop table if exists public.memorial_contribution_categories;

-- --- 3. Plafonds ---------------------------------------------------------
drop table if exists public.contribution_rate_limits;
drop table if exists public.contribution_limits_override;
drop table if exists public.contribution_settings;

-- --- 2. media ------------------------------------------------------------
alter table public.media drop constraint media_purpose_check;
alter table public.media
  add constraint media_purpose_check check (purpose in ('hero', 'gallery'));
comment on column public.media.purpose is
  'What this media is for: hero or gallery. Mirrors MEDIA_PURPOSES in config/media.ts. A label only — it never changes how the object is stored, pathed, authorized or validated (Mission 030).';

-- --- 1. messages ---------------------------------------------------------
revoke select (id, memorial_id, message_type, author_name, content, visible, created_at,
               status, caption, media_id, published_at, moderated_at)
  on table public.messages from authenticated;

drop trigger if exists messages_align_visible on public.messages;
drop function if exists public.messages_align_visible_v1();

drop index if exists public.messages_memorial_created_idx;
drop index if exists public.messages_memorial_status_published_idx;

alter table public.messages
  drop constraint messages_media_id_key,
  drop constraint messages_memorial_idempotency_key,
  drop constraint messages_caption_q2,
  drop constraint messages_content_q2,
  drop constraint messages_author_name_q2,
  drop constraint messages_published_at_required,
  drop constraint messages_visible_matches_status,
  drop constraint messages_shape_check,
  drop constraint messages_status_check;

alter table public.messages alter column content set not null;

alter table public.messages drop constraint messages_message_type_check;
alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('condolence', 'memory_message', 'testimonial'));

alter table public.messages
  drop column moderated_at,
  drop column published_at,
  drop column idempotency_key,
  drop column media_id,
  drop column caption,
  drop column status;

notify pgrst, 'reload schema';

commit;
