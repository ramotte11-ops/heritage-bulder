-- HERITAGE HOMMAGE — VID-08 : RETOUR ARRIÈRE de
-- supabase/migrations/20261125100000_vid08_video_publication_reconcile.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite de la PO.
--
-- Rétablit la lecture publique VID-07 (sans la règle « prête au moment de
-- la publication »), puis retire le déclencheur, les RPC de réconciliation
-- globale et leurs colonnes. Aucune ligne de memorial_videos n'est supprimée.

begin;

drop function if exists public.memorial_video_known_assets_v1(text[]);
drop function if exists public.finish_memorial_video_reconcile_v1(uuid, uuid, text);
drop function if exists public.claim_memorial_videos_for_reconcile_v1(uuid, timestamptz, integer, integer);

drop trigger if exists memorial_videos_stamp_ready on public.memorial_videos;
drop function if exists public.memorial_videos_stamp_ready_v1();

create or replace function public.read_public_memorial_videos_v1(p_slug text)
returns table (draft_video_id text, playback_id text, verified_duration_ms integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.draft_video_id, v.mux_playback_id, v.verified_duration_ms
    from public.memorials m
    join public.memorial_published_snapshots s on s.memorial_id = m.id
    join public.memorial_videos v on v.memorial_id = m.id and v.status = 'ready'
   where p_slug is not null
     and m.slug = p_slug
     and m.status = 'published'
     and m.access_level = 'complet'
     and public.memorial_publicly_visible_v1(m.id, now())
     and jsonb_typeof(s.content -> 'video' -> 'items') = 'array'
     and exists (select 1 from jsonb_array_elements(s.content -> 'video' -> 'items') item
                  where item ->> 'id' = v.draft_video_id);
$$;

revoke all on function public.read_public_memorial_videos_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.read_public_memorial_videos_v1(text) to service_role;

alter table public.memorial_videos
  drop column if exists reconcile_next_at,
  drop column if exists reconcile_attempts,
  drop column if exists reconcile_claimed_until,
  drop column if exists reconcile_claimed_by,
  drop column if exists ready_at;

notify pgrst, 'reload schema';

commit;
