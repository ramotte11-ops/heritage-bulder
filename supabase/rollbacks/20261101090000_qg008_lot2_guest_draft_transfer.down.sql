-- HERITAGE HOMMAGE — QG 008, Lot 2 : RETOUR ARRIÈRE de
-- supabase/migrations/20261101090000_qg008_lot2_guest_draft_transfer.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG.
--
-- Refuse de s'exécuter si un transfert existe : le supprimer perdrait le
-- lien entre un brouillon local et son brouillon durable (et sa
-- correspondance de photos). Les brouillons durables eux-mêmes ne sont
-- jamais touchés.

begin;

do $$
begin
  if exists (select 1 from public.guest_draft_transfers) then
    raise exception 'guest draft transfers exist; rollback refused, nothing changed'
      using errcode = 'HD500';
  end if;
end;
$$;

drop function public.begin_guest_draft_transfer_v1(uuid, text, bigint, text, text);
drop function public.record_guest_draft_transfer_media_v1(uuid, text, text, uuid, text);
drop function public.find_guest_draft_transfer_v1(uuid, text);
drop function public.complete_guest_draft_transfer_v1(uuid, text);
drop table public.guest_draft_transfers;

notify pgrst, 'reload schema';

commit;
