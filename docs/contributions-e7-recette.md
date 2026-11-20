# Contributions des proches — matrice de recette E7

**Légende de la colonne « Local »**
- ✅ prouvé dans cet environnement, sur la base PostgreSQL locale, en tests unitaires ou au navigateur.
- 🔒 ne peut être prouvé qu'après E6, sur un vrai projet Supabase : PostgREST, Storage, sessions réelles.

**Commandes**
- `npm run db:test` : harnais PostgreSQL, toutes migrations jusqu'à M8-E4.
- `npm test` : vitest.
- Parcours navigateur sur `/pilote/contributions-depot`, page de développement avec un transport simulé.

| # | Scénario | Preuve locale | Local | Reste pour la recette réelle (post-E6) |
|---|---|---|---|---|
| 1 | Condoléance immédiatement visible | harnais « a condolence is published at once (D2) » ; navigateur, Desktop et Mobile | ✅ | Dépôt réel par la page publique, une fois le verrou ouvert |
| 2 | Récit en attente | harnais « a story waits for the family's approval » ; navigateur | ✅ | idem |
| 3 | Photo en attente, média traité | harnais « a finalised photo waits for approval (D2), its media is ready » ; `photo-processing.test.ts` | ✅ | Envoi réel vers Storage (URL signée d'écriture) |
| 4 | Validation familiale, puis publication | harnais « moderation: approve… », « approving again is unchanged » ; `family-contributions.test.ts` | ✅ | Écran du chantier n° 01 |
| 5 | Refus, masquage, réaffichage | harnais : transitions invalides, hide/unhide, `published_at` conservé (P1) | ✅ | idem |
| 6 | Suppression | harnais « removing a photo deletes the message and claims its media » ; nettoyage des octets | ✅ | Suppression réelle dans Storage |
| 7 | Catégories désactivées immédiatement | harnais O9 : dépôt refusé, lecture masquée, données conservées, révision périmée (`stale_revision`) ; course pendant un dépôt (M8-E3) | ✅ | — |
| 8 | Album sans plafond, ordre P1 | harnais P1 (égalités départagées par id) ; `ContributionsV1Section.test.tsx` (pagination à la demande, O8 hors Album) | ✅ | Volume réel (> 100 éléments) sur la page publique |
| 9 | Liste familiale sans contribution sautée | harnais M8-E5 : 6 éléments dont 5 au même horodatage, 3 pages, tout est vu | ✅ | Requête PostgREST réelle (`or` du curseur composé) |
| 10 | Photos sécurisées | harnais : bucket privé, aucun média `pending` lisible, `read_public_memorial_v1` n'expose aucune photo de proche ; Sharp sans EXIF ni GPS | ✅ | — |
| 11 | Photos optimisées | `photo-processing.test.ts` (12 Mpx → WebP 2000 × 1500) ; `photo-preparation.test.ts` (profil `contribution`) | ✅ partiel | **Mesure du poids et de la qualité sur de vraies photos** (profil provisoire) |
| 12 | Offre gratuite | harnais : copie « avis » avec contributions (D1), dépôts acceptés, offre expirée qui refuse tout | ✅ | — |
| 13 | Offre complète | harnais : Intemporel « complet » sur tous les scénarios ; `memory_message` QG 008 conservé | ✅ | — |
| 14 | Plafonds anti-abus (R2, R3, R5) et doublons | harnais R2 / R3 / doublons ; navigateur : message R5 | ✅ | — |
| 15 | Jeton anti-robots (Q3), pas de dépôt sans secret | `form-token.test.ts`, `visitor-contributions.test.ts` : secret absent ou trop court → `unavailable`, rien n'est écrit (échec fermé) | ✅ | Secret posé en E6 |
| 16 | Parcours de la fenêtre | navigateur 22/22 (Desktop et Mobile) : choix, erreur et saisie conservée, « autre souvenir », Échap, focus rendu, position de lecture conservée, FR/EN/ES | ✅ | Habillage définitif « La lettre des proches » |
| 17 | Préservation des Offrandes, de la Vidéo, d'A13, de l'empilement et de l'ordre canonique | harnais « non-regression: the Offrandes trigger… » ; `sections.test.ts`, `compose-memorial.test.ts`, `a13-default-path-fingerprint.test.ts`, suite complète | ✅ | Revue visuelle sur un hommage réel |
| 18 | Aucune fenêtre de dépôt publique avant les validations | `contributions-deposit-readiness.test.ts` (verrou fermé) | ✅ | Ouverture du verrou après Q6, design, E6 |

## Dépendances E6 (dans l'ordre)

1. **Coordination avec la PR #105** (Offrandes, lot 2), avant toute fusion. Conflits attendus :
   - `app/hommage/[slug]/page.tsx` ;
   - les dictionnaires de traduction ;
   - `scripts/db/test-local.sh` ;
   - les tests des offrandes.
2. **Migrations sur `nudqzbdfnjzlnyffllgs`, sur GO QG :**
   - `20261119090000` (E1), puis `20261120090000` (E2), puis `20261121090000` (E3), puis `20261122090000` (E4) ;
   - `supabase/checks` avant et après ;
   - le retour arrière se fait de E4 vers E1.
3. **Environnement Netlify, sur GO QG :**
   - `CONTRIBUTIONS_FORM_TOKEN_SECRET` : obligatoire, sinon aucun dépôt possible ;
   - `CONTRIBUTIONS_FORM_TOKEN_SECRET_PREVIOUS` : facultatif, sert à la rotation.
4. **Confidentialité Q6** : validation juridique de la mention (FR/EN/ES) et désignation d'un contact de retrait.
5. **Nettoyage des médias abandonnés** : il reste sur `off`. La mise en service suit `docs/contributions-medias-abandonnes.md` § 4 (24 h en `dry-run`, puis `apply`, sur GO QG).
6. **Raccordement de la fenêtre** sur la page publique et ouverture du verrou, **avec l'habillage définitif** seulement. Le prototype ne sert pas de référence de production.
7. **Recette réelle** des lignes 🔒 et des colonnes « Reste ».
