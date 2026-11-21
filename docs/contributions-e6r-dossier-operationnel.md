# Contributions + Modération familiale — dossier opérationnel E6-R

> **Préparation technique seulement.** Aucune opération de ce dossier n'est autorisée par sa rédaction.
> Chaque étape marquée **[GO QG]** exige une autorisation distincte et nominative.
> Rien n'a été fusionné, migré, configuré ni déployé.

## 0. Actualisation M8-E6-T (2026-11-21)

- **Lot 3 intégré à la branche Contributions.** `opus/lot3-family-contributions` @ `4f38b8c`, construit sur M8, est fusionné sans conflit dans `claude/m4-contributions-a13-extension`. **Une seule branche** porte désormais M8 + Lot 3 + Q6 + le kit E7 corrigé : l'étape 2 du § 4 fusionne cette branche seulement. La branche du Lot 3 n'est pas modifiée.
- **Q6** (`fccecbc`) : mentions par type et notice, FR/EN/ES, marquées « non validées juridiquement ».
- **Contact** `contact@herelys.com` **opérationnel** : redirection IONOS créée et réception réelle réussie (confirmation PO, M8-E6-T). Il s'affiche en lien `mailto:`. Cela ne valide pas les textes Q6 : le statut juridique reste « proposition ».
- **Recette locale intégrée** (M8-E6-R2) : **29 / 29** scénarios du Lot 3 et **4 / 4** contrôles des Offrandes signées dans l'espace famille, sur `main` → PR #105 → M8 → Lot 3, avec une pile Supabase locale complète.
- **Kit E7** : `seed-db.sh` pose maintenant la preuve d'adresse QG 004-B des deux comptes de test. Vérifié sur une base neuve, sans déclencheur de banc : publications acceptées.
- **Fusion avec la PR #105** revérifiée sur la branche actuelle : toujours les **3 mêmes conflits** (§ 3) ; aucun conflit avec `main`.

## 1. SHA vérifiés (2026-11-20, revérifiés le 2026-11-21)

| Référence | SHA | État |
|---|---|---|
| `main` | `0c4907a900b3a7b113537a610bad5a82979754a3` | inchangé |
| PR #105 `claude/offrandes-signature-lot2` | `88f288ad7914308ddd947a22dcf124a6e13aabb1` | ouverte, non fusionnée |
| Contributions `claude/m4-contributions-a13-extension` | `934cd64fcdbf59fc0e7b89ea69d1dbe358a85ca3` (avant ce dossier) | — |
| Lot 3 `opus/lot3-family-contributions` | `4f38b8cdfba0cfb9a4951baa2f8fbcf32458dc0c` | construit **sur** M8 `934cd64` (le contient intégralement, + 5 commits). **Intégré** à la branche Contributions en E6-T |
| Branche Contributions **après E6-T** | voir le rapport E6-T (SHA du commit E6-T) | M8 + Lot 3 + Q6 + kit E7 corrigé : **c'est elle qui est fusionnée à l'étape 2** |

**À revérifier juste avant l'exécution.** Si un SHA a changé : STOP, puis nouvelle simulation.

## 2. Résultat de l'intégration simulée

Elle a été réalisée dans un worktree détaché et isolé, avec des commits locaux jamais poussés, dans l'ordre `main` → PR #105 → M8 → Lot 3.

| Étape | Conflits | Résolution |
|---|---|---|
| `main` + PR #105 | aucun | — |
| + M8 | 3 : `app/hommage/[slug]/page.tsx`, `page.test.tsx`, `scripts/db/test-local.sh` | Mêmes principes qu'en E6-I (§ 3), appliqués au contenu **actuel** de M8 (verrou et actions de dépôt E6-F compris) |
| + Lot 3 | **aucun** | 6 fichiers fusionnés automatiquement avec la PR #105 : `app/owner/page.test.tsx`, `components/owner/FamilyFeatures.tsx`, `lib/i18n/{fr,en,es,keys}.ts` |

**Écrans du Lot 3 : ni perdus ni dupliqués** (vérifié) :
- les 48 fichiers propres au Lot 3 sont identiques à l'octet à leur version Lot 3 ;
- dans les 6 fichiers communs, 100 % des lignes ajoutées par le Lot 3 et par la PR #105 sont présentes, sans doublon.

**Validations de l'arbre intégré :**

| Contrôle | Résultat |
|---|---|
| `npm ci` | 0 |
| `npm run lint` | 0 (3 avertissements préexistants) |
| `npm test` | **5691 / 0 échec** |
| `npx next typegen` · `tsc --noEmit` · `npm run build` | 0 · 0 · 0 |
| `npm run db:test` | **1813 / 0 échec** |

**Comparaison test par test** : tout test vert dans `main` + PR #105 et dans le Lot 3 seul l'est dans l'arbre intégré.
- Les absences sont des remplacements voulus et déjà connus :
  - 3 renommages par M8 (E6-I) ;
  - 1 par la PR #105 (signature) ;
  - 1 par le Lot 3 : la carte « Bientôt disponible » de `/owner`, remplacée par deux tests de la carte réelle avec son compteur.
- **Aucune perte.**

**Builder et scènes, préservés** (navigateur Chromium, `main` + PR #105 comparé à l'arbre intégré) :
- 42 captures de scènes sur 42 identiques au pixel : Hero, Avis, Cérémonie, Récit, Traditions, Galerie A13, Offrandes, en Light/Dark à 1440, 390 et 320 px ;
- 18 pages sur 18 identiques ;
- Builder invité parcouru de bout en bout : 20 écrans sur 20 au texte identique ; seul ajout, l'écran A15 (M7, autorisé).

« La lettre des proches » et la rubrique publique sont identiques à M8. **Le verrou de dépôt reste fermé** (`CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = false`).

**Scénarios du Lot 3 (29) : non rejoués ici.** La pile Supabase locale ne peut pas démarrer dans cet environnement : le proxy refuse l'hôte `pkg-containers.githubusercontent.com`, où sont stockées les images Docker. Évaluation de l'impact :
- l'arbre intégré ne diffère du Lot 3 testé que par les fichiers de la PR #105 ;
- **aucun fichier de la modération ni des Contributions** n'en fait partie ;
- seule zone commune à l'exécution : `FamilyFeatures.tsx` (libellés des offrandes signées, dans la carte « attentions » de `/owner`), couverte par les tests unitaires de `/owner`, verts avec les deux lots.

**Recommandation : rejouer le kit `scripts/local-e2e/lot3-contributions/` sur l'arbre intégré**, dans l'environnement « HERITAGE (Supabase local) », avant l'étape 2 du § 4.

## 3. Résolutions nécessaires (à refaire telles quelles lors de la vraie fusion)

À faire dans l'ordre, en voyant l'ancêtre commun (`git checkout --conflict=diff3 -- <fichier>`) :

1. **`app/hommage/[slug]/page.tsx`, imports.**
   - Garder la ligne du Lot 2 : `import { depositSymbolicOffering, signSymbolicOfferingAction } from "./actions";`
   - Puis **tout** ce que M8 ajoute après la ligne de base : `CONTRIBUTIONS_DEPOSIT_PUBLIC_READY` et les six actions de `./contribution-actions`.
2. **`page.tsx`, rendu.**
   - Commentaire et fournisseur du Lot 2 : `<PublicOfferingsProvider … sign={signSymbolicOfferingAction}>`, à l'extérieur.
   - Puis, de M8, `<PublicContributionsProvider … deposit={deposit}>` autour de `<MemorialAssembly>`, à l'intérieur.
3. **`page.test.tsx`.**
   - Garder tous les mocks de M8 : hôte, lecture, six actions, verrou.
   - Remplacer leur mock de base de `./actions` par celui du Lot 2 (`depositSymbolicOffering` + `signSymbolicOfferingAction`).
4. **`scripts/db/test-local.sh`.** Garder les deux blocs, **Lot 2 puis M8**, sans en modifier une ligne. L'ancêtre est vide.
5. **Contrôle.** `git diff --cc` doit montrer chaque ligne issue d'un seul côté. Ensuite, les six étapes AGENTS.md plus `db:test` (attendu 1813 / 0) et le kit Lot 3.

## 4. Ordre des opérations

Chaque ligne exige son propre **[GO QG]**. Les opérations Netlify (variable et déploiement) sont **regroupées dans une seule fenêtre**, grâce à la suspension de la publication automatique.

| # | Opération | Avant | Après | Retour arrière |
|---|---|---|---|---|
| 0 | **[GO QG]** Netlify, projet `hommages` : **suspendre la publication automatique** (« Stop auto publishing ») | Noter le déploiement publié en cours (son identifiant) | Les fusions sur `main` construisent sans publier | Réactiver la publication automatique |
| 1 | **[GO QG]** PR #105 mise à jour sur `main`, revue, fusion | SHA § 1 ; CI verte | CI de `main` verte | Revert du commit de fusion (aucune donnée) |
| 2 | **[GO QG]** PR de la branche Contributions (M8 + Lot 3 + Q6) : `main` fusionné dans la branche, résolutions § 3, revue, fusion | Les 3 conflits seulement ; six étapes AGENTS.md + `db:test` verts | CI de `main` verte ; `db:test` 1813 / 0 | Revert de la fusion (aucune donnée) |
| 3 | **[GO QG]** Migrations sur `nudqzbdfnjzlnyffllgs` (jamais `pbgzyyqdbdrhgnkzmxyn`), **avant toute publication du nouveau code** | Référence du projet vérifiée dans le tableau de bord ; `030_preflight` | `030_postflight` (aucune politique sur `storage.objects`) | voir § 5 |
| 3a | `20261116120000_lot2_offering_signature.sql` | `lot2_signature_preflight` (9 OK) | `lot2_signature_postflight` (10 OK) | |
| 3b | `20261119090000_m8_e1_contributions.sql` | `m8_e0_preflight` (zéro ECHEC ou STOP), `m8_e1_preflight` (24 OK) | `m8_e1_postflight` (26 OK) | |
| 3c | `20261120090000_m8_e2…`, `20261121090000_m8_e3…`, `20261122090000_m8_e4…` | — | `m8_e2_e4_postflight` (16 OK) | |
| 4 | **[GO QG]** Netlify : `CONTRIBUTIONS_FORM_TOKEN_SECRET` (≥ 32 octets aléatoires, `openssl rand -base64 48`), posé par le QG, contexte production | — | Présence vérifiée (valeur jamais affichée) | Retirer la variable : tout dépôt répond `unavailable` |
| 5 | **[GO QG]** **Une seule publication** : le dernier déploiement de `main`, construit **après** l'étape 4 (relancer une construction si besoin), puis réactiver la publication automatique | Construction verte | `/owner` : carte « Gérer les contributions » avec compteur ; offrandes signées affichées à la famille ; page publique : **aucune rubrique Contributions** (verrou fermé) ; appel direct aux actions de dépôt → `unavailable` | Republier le déploiement noté à l'étape 0 (« Publish deploy ») |
| 6 | Recette E7 réelle (§ 6), sur un **déploiement de recette** où seul le verrou est ouvert | Étapes 0 à 5 conformes | Séquence en 12 étapes de `docs/contributions-e7-recette.md` | Verrou refermé ; données de recette supprimées par la famille de test |
| 7 | **[GO PO + QG]** Ouverture publique (PR distincte : `CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = true`) | **Q6 validée juridiquement** (`privacyPublicationBlockers()` vide), recette E7 passée, GO nettoyage des médias décidé | Rubrique et dépôt visibles | Refermer le verrou (PR) : la rubrique disparaît, les données restent |

**Pourquoi les migrations avant la publication ?** Elles sont additives : l'ancien code reste fonctionnel sur la base migrée. À l'inverse, le nouveau code publié sans elles rendrait la carte « Gérer les contributions » sans compteur lisible, et la signature des offrandes inopérante.

**Ne pas utiliser `c3_security_postflight.sql` comme porte** : il compare des comptages figés et échoue déjà sur `main` (E6-P).

## 5. Conditions de retour arrière de la base (ordre inverse : E4 → E3 → E2 → E1 → Lot 2)

| Lot | Réversible | Condition |
|---|---|---|
| E4, E3, E2 | Oui, entièrement | Fonctions de lecture seulement |
| E1 | Oui, à l'identique, **tant qu'aucune contribution réelle n'existe** | Après un dépôt réel, le script **refuse** et ne change rien (testé) : décision QG sur ces données |
| Lot 2 | Oui, mais **efface définitivement les signatures reçues** | Le script ne refuse pas : export préalable décidé par le QG (RGPD) ; retirer d'abord le code de signature |
| Lot 3 | Aucune migration | Revert du code seulement |

## 6. Vérifications indispensables avant d'ouvrir E7

1. Étapes 1 à 5 du § 4 faites, et chaque contrôle « Après » conforme.
2. Kit Lot 3 : **29 / 29 sur l'arbre intégré** (E6-R2), et `seed-db.sh` corrigé en E6-T. À rejouer seulement si la fusion réelle diffère de la simulation.
3. **Verrou ouvert uniquement sur un déploiement de recette**, jamais en production, pour la séquence de recette en 12 étapes de `docs/contributions-e7-recette.md`.
4. Photos réelles : profil `contribution` mesuré.
5. Modération familiale réelle :
   - approuver, refuser avec confirmation, masquer, réafficher, supprimer (les octets disparaissent du bucket) ;
   - fermer une catégorie (données conservées) ;
   - isolation entre deux familles.
6. Nettoyage des médias abandonnés : **reste désactivé**. GO séparé (dry-run, puis apply) avant l'ouverture des photos.
7. Q6 : contact opérationnel (E6-T) ; **textes à valider juridiquement** (`docs/contributions-q6-confidentialite-proposition.md` § 8). Le verrou ne peut pas s'ouvrir avant.
