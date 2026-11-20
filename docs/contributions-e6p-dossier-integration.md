# Contributions des proches — dossier E6-P : préparation de l'intégration

**Destinataire : QG.** Tout ce qui suit a été **exécuté localement** :
- harnais PostgreSQL ;
- fusion simulée dans un arbre isolé (`git merge-tree`, puis un worktree détaché) ;
- suite complète et build.

Rien n'a été appliqué en production, aucune branche de référence n'a été modifiée, et la PR #105 n'a pas été touchée.

Références au moment de l'étude :

| Branche | SHA |
|---|---|
| `main` | `0c4907a9` |
| PR #105 `claude/offrandes-signature-lot2` | `88f288ad` (6 commits, « behind » `main`) |
| Contributions `claude/m4-contributions-a13-extension` | commit E6-P, sur `0860698b` |

Les deux branches partent du même commit de `main` (`62648f4`, PR #106). Elles fusionnent chacune **sans conflit** avec le `main` actuel, qui n'a ajouté qu'un document QG-BASE-001.

## 1. Conflits avec la PR #105

### 1.1 Conflits textuels (3)

| Fichier | Cause | Résolution validée en simulation |
|---|---|---|
| `app/hommage/[slug]/page.tsx` | Le Lot 2 ajoute `signSymbolicOfferingAction` et `sign=` sur `PublicOfferingsProvider` ; M8 ajoute l'import de `contribution-actions` et `PublicContributionsProvider` autour de `MemorialAssembly` | Garder **les deux** : `PublicOfferingsProvider … sign={signSymbolicOfferingAction}`, qui englobe `PublicContributionsProvider`, qui englobe `MemorialAssembly` |
| `app/hommage/[slug]/page.test.tsx` | Mocks de `./actions` des deux côtés | Garder les mocks M8 (contributions) et le mock Lot 2 de `./actions` (`depositSymbolicOffering`, `signSymbolicOfferingAction`), qui remplace celui de M8 |
| `scripts/db/test-local.sh` | Deux blocs ajoutés au même endroit (avant `Results`) | Garder les deux blocs, M8 puis Lot 2. Aucune modification de contenu |

### 1.2 Fusions automatiques à surveiller (6)

`lib/i18n/{fr,en,es,keys}.ts`, `SymbolicOfferingsSceneV1.test.tsx` et `offerings-public.test.tsx`.
- Les clés sont disjointes : le Lot 2 ajoute 3 clés `owner.*`, et ses textes d'Offrandes sont dans `texts.ts` ; M8 ajoute `contributionsScene.*` (19) et `contributionsDeposit.*` (33).
- **Contrôle fait sur l'arbre fusionné : aucune de ces clés ne manque en FR, en EN ni en ES.**
- Attention : les tests du dépôt n'imposent la complétude que pour l'anglais (le français et l'espagnol retombent sur l'anglais). Ce contrôle est donc à refaire au moment de la vraie fusion.

### 1.3 Résultat de la fusion simulée (M8 + Lot 2), exécuté

| Étape | Résultat |
|---|---|
| `npm ci` | exit 0 |
| `npm run lint` | exit 0 (3 avertissements préexistants) |
| `npm test` | 322 fichiers, 5633 tests, 0 échec |
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run db:test` | 1810 réussis, 0 échec, avant les ajouts E6-P |

### 1.4 Dépendances et risques de régression

- **Offrandes**
  - Le Lot 2 touche `symbolic_offerings` et ses fonctions. M8 n'y touche pas.
  - Le contrôle de non-régression M8 « le déclencheur des Offrandes ouvre toujours une première publication » passe après fusion.
- **A13 et empilement** : le Lot 2 ne touche ni le solveur A13 ni la composition. M8 ne touche pas la scène des Offrandes. Aucun fichier commun hors des 9 ci-dessus.
- **Page publique** : c'est le seul point de rencontre fonctionnel, à savoir les deux fournisseurs imbriqués (§ 1.1). Les deux fonctionnent indépendamment.
- **Traductions** : clés disjointes, aucun risque d'écrasement.
- **Risque restant** : aucune revue visuelle conjointe n'a été faite. Les deux scènes réelles côte à côte (Offrandes V2 signées, puis Contributions) restent à voir sur un hommage réel, en E7.

### 1.5 Ordre d'intégration recommandé

1. **PR #105 d'abord**, sur décision QG : mise à jour sur `main`, revue, fusion. Elle est plus petite, et sa migration (`20261116120000`) est **antérieure** aux nôtres.
2. **Ensuite seulement, M8** : mise à jour de la branche Contributions avec le nouveau `main`, résolution des 3 conflits selon § 1.1, les six validations AGENTS.md et `db:test`, puis PR et revue.

Raison : l'historique des migrations reste chronologique (Lot 2, puis E1 à E4). L'outil Supabase refuse par défaut une migration locale plus ancienne que la dernière appliquée (il faut alors `--include-all`).

L'ordre inverse fonctionne aussi sur le schéma : nous l'avons testé (§ 2.3), mais il complique l'historique.

## 2. Migrations, dans l'ordre

| # | Fichier | Contenu | Données touchées |
|---|---|---|---|
| (Lot 2) | `20261116120000_lot2_offering_signature.sql` | Signature des offrandes : PR #105, sous la responsabilité de son chantier | voir son dossier |
| E1 | `20261119090000_m8_e1_contributions.sql` | Colonnes de `messages`, 6 tables, déclencheur de catégories, RPC, nouvelle version de 2 fonctions QG 017 (Q7-B), `media.purpose` + `contribution` | **Oui**, voir § 2.2 |
| E2 | `20261120090000_m8_e2_owner_contribution_settings.sql` | `read_owner_contribution_settings_v1` | Aucune (fonction STABLE) |
| E3 | `20261121090000_m8_e3_public_contributions_overview.sql` | `read_public_contributions_overview_v1` | Aucune |
| E4 | `20261122090000_m8_e4_public_contributions_reads.sql` | `read_public_contributions_v2`, `read_public_contributions_by_ids_v1` | Aucune |

### 2.1 Prérequis et vérifications

| Moment | Script, en lecture seule | Attendu |
|---|---|---|
| Avant E1 | `supabase/verifications/m8_e0_preflight.sql` (état de la table `messages` et des droits) | zéro ECHEC ou STOP |
| Avant E1 | `supabase/verifications/m8_e1_preflight.sql` (sentinelles QG 017 A2, PostgreSQL ≥ 13, NFC, colonnes historiques, aucun texte hors limites) | 24 OK |
| Après E1 | `supabase/verifications/m8_e1_postflight.sql` | 26 OK |
| Après E4 | `supabase/verifications/m8_e2_e4_postflight.sql` (nouveau, E6-P) | 16 OK |
| Avant et après | `supabase/checks/030_preflight.sql` / `030_postflight.sql` (aucune politique sur `storage.objects`) | inchangé |

Chaque migration s'applique dans **une transaction**. Elle réussit en entier ou échoue sans rien changer.

> **À ne pas utiliser comme porte E6 : `c3_security_postflight.sql`.** Il compare le catalogue à un état figé de l'époque C3 (22 tables, 184 colonnes, 82 lignes). Il est **déjà en échec sur `main`** (24 tables, avant M8 et avant le Lot 2) : nous l'avons vérifié localement. Ses contrôles de droits restent valables, mais pas ses comptages.

### 2.2 Ce qu'E1 écrit dans des données existantes

1. **`messages`** : reprise `status` / `published_at` depuis `visible`.
   - E0 a constaté une table vide en production.
   - **Relancer E0 juste avant** : si des lignes existent, la reprise reste correcte (visible devient `published`, sinon `pending`).
2. **`memorial_access_settings.avis_snapshot_keys`** : ajout de `contributions` (D1).
   - Une copie « avis » de l'offre gratuite peut ensuite porter la rubrique.
3. **Hommages déjà publiés.** Aucune ligne de catégories n'est créée par la migration. Les catégories en vigueur reprennent **les choix A15 de leur copie publiée**.
   - Conséquence : dès E1, la base **accepterait** un dépôt sur ces hommages.
   - C'est pourquoi le verrou serveur du § 3.1 est indispensable.

### 2.3 Comportement vérifié sur une base de développement représentative

Base de substitution Supabase, puis toutes les migrations du dépôt, exécutées localement :
- **Ordre chronologique**, puis **E1 à E4 avant le Lot 2** : schémas **identiques** (`pg_dump -s`, droits compris) ; postflights E1 (26 OK) et Lot 2 (10 OK) verts dans les deux cas.
- Harnais complet après fusion : 1810 réussis, 0 échec, dont le retour arrière de chaque lot sur la base qui contient l'autre.

### 2.4 Retour arrière

Ordre strictement inverse : **E4, puis E3, puis E2, puis E1** (`supabase/rollbacks/*.down.sql`, jamais appliqués automatiquement).

| Lot | Réversible ? | Détail |
|---|---|---|
| E4, E3, E2 | **Oui, entièrement** | Ils ne suppriment que des fonctions de lecture. Aucune donnée. Le retour arrière puis la réapplication sont testés |
| E1, avant tout dépôt réel | **Oui, à l'identique** | Schéma QG 017 A2 restauré exactement (`pg_dump` identique, testé), fonctions QG 017 restaurées, `contributions` retiré de `avis_snapshot_keys` |
| E1, après un dépôt réel | **Refusé par conception** | Le script refuse et ne change rien dès qu'une contribution réelle existe (photo, dépôt M8, média `contribution`). Le sort de ces données de proches relève d'une **décision QG** |
| Application (Netlify) | **Oui** | Revenir au déploiement précédent. Le code M8 sans migrations n'affiche pas la rubrique (lecture en échec, `initial = null`) |

**Moyen d'arrêt sans retour arrière de la base :**
- verrou serveur fermé (§ 3.1, état actuel) ;
- famille : catégories désactivées (O9).

## 3. Sécurité et configuration : checklist d'activation (QG)

### 3.1 Défaut avéré corrigé en E6-P : verrou de dépôt côté serveur

**Constat, dans le build de production :** les quatre Server Actions de dépôt sont enregistrées comme points d'entrée de `/hommage/[slug]`, même sans fenêtre affichée. Ce sont `openContributionWindow`, `depositContributionText`, `beginContributionPhoto` et `completeContributionPhoto`. Le verrou E4 ne bloquait que l'import de l'interface.

Une fois E1 appliquée et le secret posé, un appel direct aurait permis un dépôt avant Q6.

**Correction :** `app/hommage/[slug]/contribution-actions.ts` répond `unavailable`, **sans rien construire ni écrire**, tant que `CONTRIBUTIONS_DEPOSIT_PUBLIC_READY` est fermé.
- La lecture (Album, liens photo) n'est pas concernée.
- Tests : `contribution-actions.test.ts` et `contributions-deposit-readiness.test.ts`.

### 3.2 Checklist

| # | Point | État actuel | Action au GO |
|---|---|---|---|
| 1 | `CONTRIBUTIONS_FORM_TOKEN_SECRET` | Absent : tout dépôt répond `unavailable` (échec fermé, testé) | Le QG crée une valeur aléatoire d'**au moins 32 octets**, dans Netlify uniquement, jamais dans le dépôt. Au moins 32 octets aléatoires : `openssl rand -base64 48` |
| 2 | `CONTRIBUTIONS_FORM_TOKEN_SECRET_PREVIOUS` | Absent | Seulement lors d'une rotation : l'ancienne valeur, pendant 2 h (durée maximale d'un jeton), puis la retirer |
| 3 | Verrou `CONTRIBUTIONS_DEPOSIT_PUBLIC_READY` | `false` (interface et serveur) | Passer à `true` par une PR **après** Q6, l'habillage définitif et E6 |
| 4 | Bucket `memorial-media` | Privé, ≤ 15 Mo, JPEG/PNG/WebP, **aucune politique** sur `storage.objects` | Lancer `030_preflight` / `030_postflight` avant et après. Aucune politique ne doit apparaître |
| 5 | Visiteurs | Aucun droit de table. RPC `service_role` seulement, derrière le serveur. Jeton HMAC (≥ 3 s, ≤ 2 h), champ piège, permission d'envoi pour un seul objet, ticket photo | Rien |
| 6 | Familles | Lecture de leurs seuls `messages` (RLS), jamais `idempotency_key`. Modération par RPC avec le propriétaire résolu depuis la session | Rien |
| 7 | Abus | R2 (par heure et par jour, par type), R3 (200 en attente), doublons (même clé ou même texte sous 10 min), plafonds R5 affichés, Q2 (longueurs en caractères visibles) | Ajuster `contribution_settings` seulement sur décision |
| 8 | Liens photo | URL signées de 5 min ; renouvellement par identifiants (au plus 100, publiés et visibles seulement) | Rien |
| 9 | Nettoyage des médias abandonnés | `off` : aucune fonction planifiée, variable absente | Rester `off`. Mise en service séparée : `docs/contributions-medias-abandonnes.md` § 4 |
| 10 | Lectures publiques anonymes (`loadContributions`, `renewContributionPhotos`) | Bornées (100 éléments ou 100 liens par appel), sans limite de fréquence propre | Réserve : surveiller. Une limite de fréquence relèverait de la plateforme (Netlify) |

## 4. Procédure d'intégration (chaque étape sur GO QG)

1. **PR #105** : mise à jour sur `main`, fusion (§ 1.5).
2. **Branche Contributions** :
   - fusion du `main` à jour, puis les 3 résolutions du § 1.1 ;
   - `npm ci`, `lint`, `test`, `typegen`, `tsc`, `build`, `db:test`, tous verts ;
   - PR et revue. **Le verrou reste fermé.**
3. **Production `nudqzbdfnjzlnyffllgs`** (vérifier la référence dans le tableau de bord ; **jamais** `pbgzyyqdbdrhgnkzmxyn`) :
   - 3.1 `030_preflight`, `m8_e0_preflight` (aucun ECHEC ni STOP), `m8_e1_preflight` (24 OK) ;
   - 3.2 Lot 2 (si ce n'est pas déjà fait par son chantier), avec ses pré- et postflights ;
   - 3.3 E1, puis `m8_e1_postflight` (26 OK) ;
   - 3.4 E2, E3, E4, puis `m8_e2_e4_postflight` (16 OK) ;
   - 3.5 `030_postflight`.
4. **Netlify** : `CONTRIBUTIONS_FORM_TOKEN_SECRET`, posé par le QG. Le verrou étant fermé, aucun dépôt public n'est encore possible.
5. **Déploiement** de `main`.
   - Contrôle : la rubrique d'un hommage publié avec A15 affiche l'état vide ; un dépôt direct répond `unavailable`.
6. **Recette E7** (§ 5), puis ouverture du verrou par une PR distincte, après Q6 et l'habillage définitif.

**En cas d'incident :**
- application : revenir au déploiement précédent ;
- base, avant tout dépôt réel : retour arrière E4 → E1 (§ 2.4) ;
- après des dépôts réels : ne pas faire de retour arrière ; fermer les catégories, puis décision QG.

## 5. Conditions de démarrage de la recette E7

Matrice : `docs/contributions-e7-recette.md`.

| Catégorie | Scénarios (n° de la matrice) |
|---|---|
| **Prouvés localement** (harnais, tests, navigateur sur banc simulé) | Logique de 1 à 18 : dépôts et états D2, modération, suppression, O9, P1 et Album sans plafond, curseur familial, offres gratuite et complète, R2/R3/R5, jeton, verrou |
| **Nécessitent le Supabase réel** (après les étapes 3 à 5) | Envoi réel vers Storage et finalisation (3) ; suppression réelle des octets (6) ; requêtes PostgREST du curseur composé (9) ; volume réel de l'Album au-delà de 100 (8) ; écran familial du chantier n° 01 (4, 5) ; revue visuelle Offrandes + Contributions (17) |
| **Nécessitent des photos réelles** | Poids et qualité du profil `contribution` (11), avec un échantillon de téléphones récents, portrait et paysage, HEIC converti par le téléphone |
| **Dépendent d'une validation PO ou juridique** | Mention de confidentialité et contact de retrait (Q6) ; habillage définitif « La lettre des proches » (16, version finale) ; ouverture du verrou (18) |

Le parcours navigateur 22/22 a été joué sur un **transport simulé**. Il ne vaut pas recette réelle.

**Pour démarrer E7 :**
- étapes 1 à 5 du § 4 faites ;
- postflights verts ;
- un hommage de test publié (gratuit et complet) sur le projet de production ;
- un compte famille de test ;
- un échantillon de photos réelles.

## 6. Décisions et GO encore nécessaires

| # | Décision | Autorité |
|---|---|---|
| 1 | Fusion de la PR #105, puis de la branche Contributions, dans cet ordre | QG |
| 2 | Application de E1 à E4 sur `nudqzbdfnjzlnyffllgs` | QG (GO distinct) |
| 3 | Création de `CONTRIBUTIONS_FORM_TOKEN_SECRET` dans Netlify | QG |
| 4 | Déploiement de production | QG |
| 5 | Mention de confidentialité Q6 et contact de retrait | Juridique / PO |
| 6 | Fabrication et intégration des Masters « La lettre des proches » | PO (phase finale) |
| 7 | Ouverture du verrou de dépôt | PO + QG, après 5 et 6 |
| 8 | Nettoyage des médias abandonnés : `dry-run`, puis `apply` | QG |
| 9 | Sort d'un média `pending` d'un hommage archivé | QG |
| 10 | Remplacement des comptages figés de `c3_security_postflight.sql` | QG (hors périmètre Contributions) |
| 11 | Raccordement Brevo du récapitulatif quotidien | PO + QG, mission distincte |
