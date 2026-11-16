# Espace famille — Lot 1 (tableau de bord familial)

> Branche `claude/espace-famille-lot1`, depuis `main@72d1813`. **Rien n'est fusionné ni déployé.**
> Aucune migration, aucun privilège, aucune fonction SQL, aucun changement d'authentification ou de sauvegarde.

## Ce que le lot livre

| Route | Contenu |
|---|---|
| `/owner` | « Mon espace famille » : cartes d'hommage (photo du Hero, nom, années, statut réel, actions), « Créer un nouvel hommage », sélecteur d'hommage, « Offrandes reçues » (compteurs réels), « Carnet des attentions » (deux derniers gestes), « Gérer les contributions » (annoncée, non simulée). |
| `/owner/hommages/[memorialId]/attentions` | Carnet privé d'un hommage : totaux, puis chaque geste daté, 30 par page. |
| `/pilote/espace-famille` | Recette visuelle, données illustratives. `page.dev.tsx` : absent de tout build de production. |

## Données et sécurité (lectures seules, existantes)

- Session : `getHeritageActor` → `requireOwner`, inchangés. Visiteur → `/login`.
- Liste, lien public, échéances : `SupabaseOwnedMemorialListRepository`, **inchangé**.
- Statut, années, référence de photo : `SupabaseFamilySpaceRepository` (client de session, RLS `memorials_select_own`, `memorial_drafts_select_own`) — `memorials(id, status)` et l'objet `hero` du brouillon seulement.
- Photographie : celle du Hero, par le chemin de lecture du Builder (`createMediaReadUrl`) : propriété re-vérifiée, URL signée de 5 minutes, même géométrie de recadrage que le Hero. Aucun second téléchargement, aucune copie.
- Offrandes : `symbolic_offerings(id, kind, created_at)` sous `symbolic_offerings_select_own`.
- `?hommage=` et `[memorialId]` sont des revendications d'URL : honorées seulement pour un hommage de la famille (sinon ignorée / 404), jamais transmises telles quelles à une lecture.

## Statuts affichés

| Affichage | Condition réelle |
|---|---|
| En préparation | `draft` / `ready` (ou statut illisible) |
| Publié | la page publique répond (`publicSlug` décidé par le serveur) |
| Modifications en cours | `editing` |
| N'est plus visible | `published` mais plus consultable (fin des 45 jours d'un avis gratuit) |
| Archivé | `archived` |

## « Créer un nouvel hommage »

Lien vers `/creer` (Builder invité). Vérifié : `/creer` **reprend** l'unique brouillon local du navigateur, il ne
le remplace jamais ; ce brouillon n'est effacé qu'après un transfert réussi (`run-guest-draft-transfer.ts`).
Un brouillon local non sauvegardé ne peut donc pas être écrasé : la famille le retrouve tel quel.
À la limite officielle du compte (`activeFreeDrafts ≥ maxFreeDrafts`), l'entrée est désactivée et expliquée ;
la base refuse de toute façon un 4ᵉ brouillon à la sauvegarde.

## Écarts assumés par rapport à la maquette

- **Fond** : le papier ivoire et les feuillages du Builder (assets existants) plutôt qu'un nouveau décor ; coin bordeaux, rameau, tirage papier et pictogrammes redessinés en SVG/CSS.
- **Carnet sans prénom** : « Une fleur a été déposée. » — la signature des offrandes n'existe pas en base (Lot 2).
- **Contributions** : carte présente, « Bientôt disponible », sans lien (Lot 3).
- **Ajouts validés par la PO** : sélecteur d'hommage, lien « Modifier », emplacement sans photo, échéances discrètes, compteur n / 3.
- **Mobile** : « Mon compte » réduit à son icône.

## Dépendances ouvertes

- Lot 2 : migration (signature facultative) — GO QG en chef.
- Lot 3 : dépôt public, droits et modération des contributions — GO QG en chef.
- Recette sur données réelles : à faire sur un aperçu de déploiement (cette session n'a pas accès à la base).

Captures : `docs/validation/espace-famille-lot1/`.
