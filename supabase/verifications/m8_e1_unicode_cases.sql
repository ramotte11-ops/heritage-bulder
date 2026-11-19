-- =====================================================================
-- HERITAGE HOMMAGE — M8-E1 — JEU D'EXEMPLES UNICODE (Q2)
-- =====================================================================
-- Jeu de cas réutilisable : le harnais local (scripts/db/test-local.sh,
-- bloc M8-E1) l'exécute contre submit_contribution_v1 et
-- finalize_contribution_photo_v1 ; les tests E2 (module contribution-text,
-- Server Action) reprendront les mêmes cas et les mêmes attentes.
--
-- Ne crée qu'une table TEMPORAIRE de session (pg_temp) : aucun objet
-- durable, rien d'écrit dans le schéma public.
--
-- Rappel Q2 : l'application compte les caractères visibles (graphèmes,
-- Intl.Segmenter) et refuse au-delà de N (nom 60, condoléance 500, récit
-- 2000, légende 150), avec au plus 10 points de code par caractère
-- visible. La base n'applique qu'un filet de 10 N points de code (nom
-- 600, condoléance 5000, récit 20000, légende 1500), la forme NFC et
-- l'absence de \r ; elle n'est donc jamais plus stricte que le compteur.
--
-- Colonnes : case_id, message_type (condolence, testimonial, photo),
-- field (author_name, content, caption), expected (accepted | refused),
-- value, code_points (pour lecture humaine), note.
-- =====================================================================

create temporary table m8_e1_unicode_cases as
with kiss(k) as (
  -- « Bisou : femme, homme, teints clair et moyennement clair » : un seul
  -- caractère visible, 10 points de code.
  select U&'\+01F469\+01F3FB\200D\2764\FE0F\200D\+01F48B\200D\+01F468\+01F3FC'
)
select case_id, message_type, field, expected, value, char_length(value) as code_points, note
from kiss, lateral (values
  ('u01', 'condolence', 'content', 'accepted', repeat(k, 500),
   '500 bisous avec teints = 500 caracteres visibles = 5000 points de code : conforme au compteur, accepte'),
  ('u02', 'condolence', 'content', 'refused', repeat(k, 500) || 'a',
   '5001 points de code : au-dela du filet de 10 N'),
  ('u03', 'condolence', 'content', 'accepted', repeat('é', 500),
   '500 caracteres precomposes (NFC)'),
  ('u04', 'condolence', 'content', 'refused', U&'Pens\0065\0301e',
   'texte decompose (NFD) : la Server Action normalise en NFC avant l''appel'),
  ('u05', 'testimonial', 'content', 'refused', 'Ligne 1' || chr(13) || chr(10) || 'Ligne 2',
   '\r refuse : la Server Action convertit \r\n et \r en \n'),
  ('u06', 'testimonial', 'content', 'accepted', 'Ligne 1' || chr(10) || chr(10) || 'Ligne 2',
   'retours a la ligne \n admis (comptes chacun pour un caractere visible)'),
  ('u07', 'testimonial', 'content', 'accepted', repeat(k, 2000),
   '2000 bisous = 20000 points de code : recit au plafond, accepte'),
  ('u08', 'condolence', 'author_name', 'accepted', repeat(k, 60),
   'nom de 60 caracteres visibles complexes = 600 points de code'),
  ('u09', 'condolence', 'author_name', 'refused', repeat(k, 60) || 'a',
   'nom de 601 points de code'),
  ('u10', 'condolence', 'author_name', 'refused', '   ',
   'nom vide apres retrait des espaces'),
  ('u11', 'photo', 'caption', 'accepted', repeat(k, 150),
   'legende de 150 caracteres visibles complexes = 1500 points de code'),
  ('u12', 'photo', 'caption', 'refused', repeat(k, 150) || 'a',
   'legende de 1501 points de code')
) as c(case_id, message_type, field, expected, value, note);
