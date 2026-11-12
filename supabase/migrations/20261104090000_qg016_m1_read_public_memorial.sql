-- =====================================================================
-- HERITAGE HOMMAGE — QG 016 / M1 — lecture publique sécurisée d'un hommage publié
-- =====================================================================
-- Append-only : ce fichier AJOUTE une fonction. Il ne modifie aucune table,
-- aucune politique, aucun privilège de table, aucune fonction existante.
--
-- Constat (audit QG 016) : depuis 20260901190000_privilege_model.sql
-- (Mission 013C), `memorial_published_snapshots` n'est lisible par AUCUN
-- rôle (revoke all … from public, anon, authenticated, service_role) et
-- `memorials` n'est lisible que par son propriétaire ou par service_role.
-- Rien ne permet donc de consulter un hommage publié à partir de son slug.
--
-- Décision QG (QG 016 / M1) : NE PAS rouvrir les privilèges de table, mais
-- ajouter UNE fonction de lecture, SECURITY DEFINER, exécutable par
-- service_role seul (le serveur de l'application), qui :
--   - résout un slug EXACT (aucune recherche approchée, aucune casse
--     ajustée) ;
--   - n'expose le mémorial QUE s'il est `published` ET publiquement visible
--     selon la règle existante `memorial_publicly_visible_v1` (complet ; ou
--     avis avant `free_public_until`) — jamais un brouillon, un `ready`, un
--     `editing`, un `archived` ni un avis expiré ;
--   - renvoie l'INSTANTANÉ PUBLIÉ (`memorial_published_snapshots.content`),
--     JAMAIS le brouillon (`memorial_drafts` n'est pas lu) ;
--   - renvoie les seuls médias RÉFÉRENCÉS par cet instantané (photo
--     principale `hero.photo.mediaId`, de purpose `hero` ; photos de
--     `gallery.items[].mediaId`, de purpose `gallery`), `ready`, appartenant
--     au mémorial ;
--   - renvoie ZÉRO ligne dans tous les autres cas (slug NULL, vide, inconnu,
--     non publié, retiré, expiré, instantané absent) : aucune erreur, aucune
--     indication d'existence.
--
-- `storage_path` est renvoyé au SERVEUR (service_role) pour signer une URL
-- de lecture courte : il ne doit JAMAIS être transmis au navigateur (contrat
-- de l'appelant, cf. lib/memorial/assembly/media-resolver.ts : seul
-- { mediaId, readUrl, width, height } quitte le serveur).
--
-- Statut `editing` : masqué, comme par la politique publique existante des
-- instantanés (décision PO D3 en attente ; changer ce comportement sera une
-- NOUVELLE migration).
-- =====================================================================

create function public.read_public_memorial_v1(p_slug text)
returns table (
  memorial_id uuid,
  slug text,
  skin text,
  skin_variant text,
  language text,
  access_level text,
  first_published_at timestamptz,
  published_at timestamptz,
  content jsonb,
  media jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         m.slug,
         m.skin_id,
         m.skin_variant,
         m.language,
         m.access_level,
         m.first_published_at,
         s.published_at,
         s.content,
         coalesce((
           select jsonb_agg(
                    jsonb_build_object(
                      'media_id', md.id,
                      'purpose', md.purpose,
                      'storage_path', md.storage_path,
                      'width', md.width,
                      'height', md.height
                    )
                    order by md.purpose desc, md.id
                  )
             from public.media as md
            where md.memorial_id = m.id
              and md.status = 'ready'
              and (
                    (md.purpose = 'hero'
                     and s.content #>> '{hero,photo,mediaId}' = md.id::text)
                 or (md.purpose = 'gallery'
                     and jsonb_typeof(s.content #> '{gallery,items}') = 'array'
                     and exists (
                           select 1
                             from jsonb_array_elements(s.content #> '{gallery,items}') as item
                            where jsonb_typeof(item) = 'object'
                              and item ->> 'mediaId' = md.id::text
                         ))
                  )
         ), '[]'::jsonb)
    from public.memorials as m
    join public.memorial_published_snapshots as s on s.memorial_id = m.id
   where p_slug is not null
     and m.slug = p_slug
     and m.status = 'published'
     and public.memorial_publicly_visible_v1(m.id, now());
$$;

comment on function public.read_public_memorial_v1(text) is
  'QG 016 / M1. Lecture publique d''un hommage par son slug exact : zéro ou une ligne, seulement si le mémorial est published et publiquement visible (memorial_publicly_visible_v1). Renvoie l''instantané publié (jamais le brouillon) et les seuls médias ready qu''il référence (hero.photo, gallery.items). storage_path est destiné au serveur (signature), jamais au navigateur. service_role seul.';

revoke all on function public.read_public_memorial_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.read_public_memorial_v1(text) to service_role;

notify pgrst, 'reload schema';
