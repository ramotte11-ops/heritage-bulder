# Contributions des proches — handoff E5 pour le Tableau de bord familial (chantier n° 01)

Statut : contrats **prêts et testés**, aucun écran fourni. Les migrations M8
(E1 à E4) ne sont **pas appliquées** en production : tant qu'E6 n'a pas eu
lieu, chaque action répond `unavailable` en production. C'est le
comportement attendu.

## 1. Où brancher

Server Actions, à importer telles quelles depuis un composant client :
`lib/memorial/contributions/family-contribution-actions.ts`.

- Ne rien recréer.
- N'importer **jamais** `server-contributions.ts` ni `family-contributions.ts` dans un composant client : ce sont des modules serveur.
- Les types de résultat s'obtiennent par
  `Awaited<ReturnType<typeof getFamilyContributions>>` (et de même pour chaque action).

**Identité.** Chaque action résout le propriétaire depuis la **session**.
Aucun identifiant de propriétaire n'est jamais accepté du navigateur.
Passer seulement les identifiants d'hommage et de contribution que
l'écran a reçus.

## 2. Résultats communs (toutes les actions)

| `status` | Sens | Conduite de l'écran |
|---|---|---|
| `ok` | Réussi | Afficher le résultat |
| `denied` | Pas de session, pas à vous, ou n'existe pas (indistincts, volontairement) | Message neutre ; ne jamais dire « n'existe pas » |
| `invalid` | Paramètre mal formé | Bug d'intégration : ne devrait jamais s'afficher |
| `unavailable` | Serveur ou base indisponible, configuration absente | « Réessayez dans un instant » ; ne rien changer localement |

## 3. Contrats

### 3.1 Compteur « à examiner » (O12)

`getPendingContributionCounts(memorialId?)`
→ `{ status: "ok", counts: { memorialId, pendingStories, pendingPhotos, pendingTotal }[] }`

- Sans argument : tous les hommages du compte. Avec un id : celui-là seulement s'il est à vous, sinon `denied`.
- Les condoléances ne sont **jamais** comptées : elles sont publiées immédiatement (D2).

### 3.2 Consultation

`getFamilyContributions({ memorialId, status?, limit?, before? })`
→ `{ status: "ok", items: FamilyContribution[], nextCursor: { createdAt, id } | null }`

- **`status`**
  - `"pending"` par défaut ;
  - ou `"published"`, `"hidden"`, `"rejected"` ;
  - ou `null` pour tout voir.
- **`limit`** : 1 à 100, 50 par défaut.
- **Page suivante** : `before = nextCursor` de la page précédente. Quand `nextCursor` vaut `null`, il n'y a plus rien.
  - **Ne pas fabriquer le curseur à la main.**
  - Correctif M8-E5 : le curseur est composé (date + id). L'ancien curseur, une date seule, sautait des contributions de même horodatage. La date seule reste acceptée pour compatibilité, mais elle est déconseillée.
- **Un élément** contient :
  - `id`, `type` (`condolence` | `testimonial` | `photo` | `memory_message`) et `status` ;
  - `authorName`, `content` (texte), `caption` (photo) ;
  - `createdAt`, `publishedAt`, `moderatedAt` ;
  - `photo` : `{ url, width, height } | null`.
- **`photo.url`** est une URL signée de **5 min**. Si l'image échoue à se charger, **relire la page** pour obtenir un lien neuf ; ne jamais stocker l'URL.
  - `photo` vaut `null` si le média n'est pas traité : n'afficher alors aucune image.
- **`memory_message`** : messages historiques (QG 008), en lecture seule ; on ne les modère pas ici.
- Le texte s'affiche **tel quel**, en texte (jamais en HTML). La plateforme ne réécrit jamais le nom ni le texte.

### 3.3 Modération

`moderateFamilyContribution(contributionId, action)`, avec `action` parmi `"approve" | "reject" | "hide" | "unhide"`.

Réponses :
- `{ status: "ok", outcome: "updated" | "unchanged", contributionStatus }` ;
- `{ status: "invalid_transition", contributionStatus | null }`.

| Depuis | approve | reject | hide | unhide |
|---|---|---|---|---|
| `pending` | → `published` | → `rejected` | transition invalide | transition invalide |
| `published` | `unchanged` | transition invalide | → `hidden` | `unchanged` |
| `hidden` | transition invalide | transition invalide | `unchanged` | → `published`, avec son `publishedAt` d'origine (sa place P1) |
| `rejected` | transition invalide | `unchanged` | transition invalide | transition invalide |

- **Une condoléance publiée** peut être masquée après coup.
- **`unchanged`** : l'action était déjà faite, par exemple dans un autre onglet. L'écran traite cela comme un succès.
- **`invalid_transition`** : l'état a changé ailleurs. L'écran **remplace** l'état affiché par `contributionStatus`, ou retire la ligne s'il vaut `null`, puis rafraîchit le compteur.

### 3.4 Suppression définitive

`deleteFamilyContribution(contributionId)`
→ `{ status: "ok", photoStorage: "none" | "removed" | "removed_claim_open" | "pending_retry" }`

- Irréversible : **demander confirmation** côté écran.
- Pour l'écran, les quatre valeurs de `photoStorage` signifient « supprimé ». Elles décrivent seulement le nettoyage du fichier, qui est terminé par le serveur, au besoin par le balayage.
- Une contribution déjà supprimée ailleurs répond `denied` : retirer la ligne.

### 3.5 Catégories (O9) : activation et désactivation immédiates

`getContributionSettings(memorialId)`
→ `{ status: "ok", settings: { features: { condolences, stories, photos }, corrupted, firstPublished, draftRevision, contributionsDigest } }`

`updateContributionCategories(memorialId, features, expectedRevision?)`
→ `{ status: "ok", outcome, draftRevision }` ou `{ status: "stale_revision", draftRevision }`.

- Envoyer **les trois** booléens, toujours.
- Après publication, l'effet est **immédiat** : dépôts refusés et lecture publique masquée. Les contributions existantes sont conservées et reviennent à la réactivation.
- Le brouillon (A15 du Builder) est aligné.
- **Révisions concurrentes** : passer `expectedRevision = settings.draftRevision`.
  - `stale_revision` veut dire qu'un Builder ou un autre onglet a modifié l'hommage entre-temps.
  - Conduite : relire `getContributionSettings`, montrer l'état réel, laisser la famille refaire son choix. **Ne jamais renvoyer automatiquement.**
- `corrupted: true` : les choix sont illisibles et tout est fermé par sécurité. Afficher le message calme d'A15 et proposer de rechoisir.

### 3.6 Récapitulatif quotidien Brevo (facultatif)

`updateContributionsDigestPreference(enabled)`
→ `{ status: "ok", contributionsDigest }`

- La préférence est désactivée par défaut et porte sur le compte, pas sur un hommage. On lit son état dans `settings.contributionsDigest`.
- **L'envoi n'est pas construit.** La base sait réclamer un récapitulatif par jour (des nombres seulement, jamais un nom ni un texte), mais aucune tâche ni intégration Brevo n'existe.
  - L'interrupteur peut donc être affiché, avec la mention « bientôt » ou masqué, selon la décision PO.
  - Le raccordement Brevo relève d'une mission distincte (secrets et GO QG).

## 4. Points d'intégration recommandés

- **Compteur** : `getPendingContributionCounts()` à l'ouverture du tableau de bord, puis après chaque modération.
- **File « à examiner »** : `getFamilyContributions({ memorialId })`. Pas de mise à jour optimiste sans réconciliation avec la réponse.
- **Actions** : désactiver le bouton pendant l'appel. La double frappe est sans danger (`unchanged`), mais inutile.
- **Langues** : textes de l'écran en FR, EN et ES, à la charge du chantier n° 01. Aucun message du serveur n'est destiné à être affiché.

## 5. Preuves

- **Contrats applicatifs** : `lib/memorial/contributions/family-contributions.test.ts`, qui couvre la session, `denied`, `invalid`, le curseur composé, les photos jamais signées si non traitées, les transitions et `stale_revision`.
- **Base** : `npm run db:test`, blocs « M8-E1 » (modération, suppression, compteur, O9, O12) et « M8-E5 » (liste sous RLS de la famille, curseur sur horodatages égaux, autre famille).
