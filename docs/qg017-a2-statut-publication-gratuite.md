# QG 017 — Lot A2 : état du droit de publication gratuite (source officielle)

> **Rien ici n'est appliqué.** Migration `20261116100000_qg017_a2_free_publication_status.sql` : GO QG distinct.

## Pourquoi

L'espace famille (PR #102) déduisait l'état du droit gratuit des lignes `memorials`. La base, elle, décide
avec les **événements** (`free.first_published`, `free.window_opened`) et les **dérogations**
(`guard_free_first_publication_v1`, `free_window_status_v1`, `free_access_window_v1`), fermés à
l'application. Un hommage publié gratuitement puis passé en offre complète ou archivé, une fenêtre
héritée, un renouvellement à 12 mois ou une dérogation étaient donc mal affichés.

## La fonction (lecture seule, `service_role` seul)

`owner_free_publication_status_v1(p_owner_id uuid)` → une ligne :

| Colonne | Type | Sens |
|---|---|---|
| `free_status` | text | `window_open` · `opens_on_next_save` · `used` · `expired` · `refused` (compte inconnu) |
| `window_status` | text | sortie exacte de `free_window_status_v1` : `inherit` · `waiver_inherit` · `open_new` · `waiver_new` · `unavailable` |
| `window_until` | timestamptz | fin de la fenêtre ouverte (`window_open` seulement), sinon NULL |
| `quota_used` | boolean | publications gratuites sur la période ≥ quota |
| `publications_in_period` | integer | nombre de publications gratuites sur la période |
| `waiver_active` | boolean | dérogation administrative active non consommée |
| `renews_at` | timestamptz | instant **exact** où le compte retrouve un droit (`renewal = scheduled`), sinon NULL |
| `renewal` | text | `not_applicable` (droit disponible) · `scheduled` · `undetermined` (aucune date sûre) |
| `active_free_drafts` / `max_free_drafts` | integer | même prédicat que `create_free_memorial_v1` |

- **Aucune règle modifiée** : tout est calculé par les fonctions qui font autorité, au même instant.
- **`renews_at` exact** : fin de la période des publications ET du cycle de fenêtre, avec la même inégalité
  que les règles (`free_period_end_v1`, y compris 29 février et fins de mois) ; puis **contre-vérifié** :
  à cet instant, `free_window_status_v1` doit rendre un droit. Sinon `undetermined`, et aucune date.
- **Lecture seule prouvée** : fonctions `STABLE` (PostgreSQL y interdit toute écriture) et banc : 18 lectures
  ne changent ni événement, ni échéance, ni dérogation.
- **Droits** : `EXECUTE` à `service_role` seul. L'identifiant du compte vient de la session serveur ; ouvrir la
  fonction à `authenticated` permettrait d'interroger le compte d'autrui. `free_period_end_v1` : aucun rôle.

## Contrat d'intégration pour Codex (PR #102)

1. **Supprimer** la déduction depuis les lignes : `freePublicationStatus` (app/owner/page.tsx) et le champ
   `freeFirstPublishedAt`. Aucune décision sur le droit gratuit ne doit plus venir de `memorials`.
2. **Adaptateur serveur** (client `service_role`, `owner.id` de la session — jamais d'un paramètre) :
   ```ts
   type FreePublicationStatus =
     | { status: "window_open"; windowUntil: string; activeFreeDrafts: number; maxFreeDrafts: number }
     | { status: "opens_on_next_save"; activeFreeDrafts: number; maxFreeDrafts: number }
     | { status: "used" | "expired"; renewsAt: string | null; activeFreeDrafts: number; maxFreeDrafts: number }
     | { status: "unknown" };
   ```
   **Fermé par défaut** : erreur RPC, aucune ligne, `refused`, valeur inattendue, `window_open` sans
   `window_until`, `renewal = scheduled` sans `renews_at` → `{ status: "unknown" }`.
   `renewal = undetermined` → `renewsAt: null`.
3. **Compteur** : `activeFreeDrafts / maxFreeDrafts` (plus de prédicat recopié côté TypeScript).
4. **Par hommage** : « Publication gratuite possible jusqu'au {date} » **uniquement** si le compte est
   `window_open` **et** que `free_publish_until` de cet hommage est encore à venir. Sinon : seulement la fin de
   préparation (déjà affichée).
5. **Textes** (dates au format et fuseau déjà utilisés par la page) :

| État | FR | EN | ES |
|---|---|---|---|
| `window_open` | Publication gratuite disponible jusqu'au {date}, pour un seul de vos hommages. | Free publication available until {date}, for one of your tributes only. | Publicación gratuita disponible hasta el {date}, para uno solo de sus homenajes. |
| `opens_on_next_save` | Votre compte peut publier gratuitement un hommage : la période de publication gratuite commencera à la sauvegarde d'un nouvel hommage. | Your account can publish one tribute for free: the free publication period will start when you save a new tribute. | Su cuenta puede publicar un homenaje gratis: el periodo de publicación gratuita empezará al guardar un nuevo homenaje. |
| `used` | La publication gratuite de votre compte a été utilisée. | Your account's free publication has been used. | La publicación gratuita de su cuenta ya se utilizó. |
| `expired` | Le délai de publication gratuite de votre compte est écoulé. | Your account's free publication period has ended. | El plazo de publicación gratuita de su cuenta ha terminado. |
| + `renewsAt` (used / expired) | Une nouvelle publication gratuite sera possible à partir du {date}. | A new free publication will be possible from {date}. | Será posible una nueva publicación gratuita a partir del {date}. |
| `unknown` | Chaque compte dispose d'une publication gratuite par période de 12 mois. | Each account has one free publication per 12-month period. | Cada cuenta dispone de una publicación gratuita por periodo de 12 meses. |
| compteur | Hommages en préparation : {n} / {max} | Tributes in preparation: {n} / {max} | Homenajes en preparación: {n} / {max} |
| par hommage | Publication gratuite possible jusqu'au {date} | Free publication possible until {date} | Publicación gratuita posible hasta el {date} |

6. **Tests applicatifs** : mapping et fermeture par défaut de l'adaptateur ; rendu des 4 états (avec et sans
   date) et de `unknown` ; **cas signalé** : compte `used` avec un autre brouillon dont la date est future →
   aucune mention de gratuité sur ce brouillon ; erreur RPC → texte neutre, page affichée ; FR/EN/ES sans clé
   brute ; plus aucune utilisation de `freeFirstPublishedAt`.

## Mise en production (chaque étape sur GO)

1. PR A2 (CI verte) → fusion → application sur B **avec la version exacte du fichier** (`20261116100000`) ;
   contrôle : `list_migrations` = fichiers de `main`, droits de la fonction, appel de contrôle sur un compte de test.
2. PR #102 adaptée → CI → fusion → construction Netlify sans publication → recette → publication.

**Retour arrière** : PR #102 → déploiement précédent. A2 → nouvelle migration supprimant les deux fonctions
(aucune donnée, aucune règle concernée).
