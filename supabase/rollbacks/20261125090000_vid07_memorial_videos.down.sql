-- HERITAGE HOMMAGE — VID-07 : RETOUR ARRIÈRE de
-- supabase/migrations/20261125090000_vid07_memorial_videos.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite de la PO.
--
-- ATTENTION : supprime les tables memorial_videos et memorial_video_events.
-- Avant de l'appliquer sur un projet où des vidéos ont été envoyées, les
-- assets Mux correspondants doivent avoir été supprimés (sinon ils
-- deviennent orphelins chez Mux, et facturés).

begin;

drop function if exists public.read_public_memorial_videos_v1(text);
drop function if exists public.list_memorial_videos_v1(uuid, uuid);
drop function if exists public.confirm_memorial_video_deleted_v1(uuid);
drop function if exists public.request_memorial_video_removal_v1(uuid, uuid, text);
drop function if exists public.list_memorial_videos_to_reconcile_v1(timestamptz, integer);
drop function if exists public.apply_memorial_video_event_v1(text, text, uuid, text, text, text, integer);
drop function if exists public.cancel_memorial_video_upload_v1(uuid, uuid, uuid);
drop function if exists public.fail_memorial_video_upload_v1(uuid, text);
drop function if exists public.attach_memorial_video_upload_v1(uuid, text, timestamptz);
drop function if exists public.reserve_memorial_video_upload_v1(uuid, uuid, text, integer);
drop function if exists public.memorial_video_guard_v1(uuid, uuid);
drop function if exists public.memorial_video_status_rank_v1(text);

drop table if exists public.memorial_video_events;
drop table if exists public.memorial_videos;

notify pgrst, 'reload schema';

commit;
