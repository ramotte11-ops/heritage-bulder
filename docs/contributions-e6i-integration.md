# Contributions des proches — E6-I : intégration contrôlée et protection du Builder

**Destinataire : QG / PO.** Toutes les preuves ci-dessous ont été **exécutées
localement**, dans des arbres de travail isolés et détachés.
- Aucune branche de référence n'a été modifiée et aucune PR n'a été créée.
- La PR #105 n'a pas été touchée.
- Aucune base Supabase de production ou historique n'a été approchée.
- Les commits de simulation sont restés locaux et n'ont jamais été poussés.

Ce qui distingue les niveaux de preuve :

| Repère | Signification |
|---|---|
| **AUTO** | Test automatisé (vitest ou harnais PostgreSQL) |
| **NAV** | Contrôle navigateur réel (Chromium), avant/après comparé |
| **BASE** | Base PostgreSQL locale représentative (substituts Supabase et migrations du dépôt) |
| **NON LOCAL** | Impossible à prouver ici, renvoyé à la recette E7 réelle |

## 1. Références Git vérifiées (2026-11-20)

| Référence | SHA | État |
|---|---|---|
| `main` | `0c4907a900b3a7b113537a610bad5a82979754a3` | inchangé depuis E6-P |
| PR #105 `claude/offrandes-signature-lot2` | `88f288ad7914308ddd947a22dcf124a6e13aabb1` | ouverte, non fusionnée, « behind », dernière activité le 2026-11-17 |
| Contributions `claude/m4-contributions-a13-extension` | `c3ebb49b…` au départ | égal au distant, arbre propre |

La PR #105 **est** le Lot 2 du chantier n° 01. Elle porte la signature des Offrandes **et** le carnet familial (`components/owner/FamilyFeatures.tsx`, `family-space-repository`). Il n'existe aucune autre branche « Tableau de bord ».

**Disponibilité.** La PR est techniquement prête à être mise à jour sur `main`, mais elle n'est **ni fusionnée ni modifiée depuis 3 jours**. Je n'ai aucun canal direct vers le chef de projet n° 01 depuis cette session : **sa confirmation reste à obtenir par le QG**.

## 2. Simulation dans l'ordre réel

Les trois arbres sont des worktrees détachés hors du dépôt, avec des commits de simulation locaux :

| Arbre | Composition |
|---|---|
| référence « avant » | `main` + PR #105 |
| référence M8 | `main` + Contributions |
| **intégré** | `main` + PR #105, **puis** Contributions |

**Partition vérifiée :**
- l'arbre intégré diffère de `main` + PR #105 **exactement** par les fichiers de M8 ;
- il diffère de `main` + M8 **exactement** par ceux de la PR #105.

## 3. Conflits et résolutions (mode diff3, ancêtre commun visible)

Aucune résolution « tout d'un côté » n'a été utilisée. Le diff combiné montre que **chaque ligne de l'arbre intégré vient d'un seul côté**, sans perte.

| Fichier | Ce que fait chaque côté (diff3) | Résolution | Justification |
|---|---|---|---|
| `app/hommage/[slug]/page.tsx`, import | Lot 2 : `+ signSymbolicOfferingAction` ; M8 : `+ import … contribution-actions` | Union des deux imports | Deux ajouts indépendants, tous deux utilisés |
| `app/hommage/[slug]/page.tsx`, rendu | Lot 2 : commentaire + `sign={signSymbolicOfferingAction}` sur `PublicOfferingsProvider` ; M8 : `PublicContributionsProvider` autour de `MemorialAssembly` | Fournisseur Offrandes **externe** avec `sign`, Contributions **imbriqué** autour de l'assemblage | Les fournisseurs sont indépendants (contextes distincts) ; la structure attendue par les tests des deux côtés est conservée (`element.props.children.props.sign` ; `…children.props.children.props.initial`) |
| `app/hommage/[slug]/page.test.tsx` | Lot 2 : le mock de `./actions` gagne `signSymbolicOfferingAction` ; M8 : mocks Contributions **et** reprise du mock de base de `./actions` | Mocks M8 conservés ; le mock de base de `./actions` est remplacé par celui du Lot 2, qui le contient | Le mock du Lot 2 est un sur-ensemble ; deux `vi.mock("./actions")` seraient en conflit. Les tests sont **structurels** (arbre React inspecté, non rendu) : le mock M8 qui rend `null` ne neutralise aucune assertion |
| `scripts/db/test-local.sh` | Ancêtre vide : deux insertions au même endroit | Les deux blocs, **Lot 2 puis M8** (ordre chronologique des migrations), sans modifier une ligne | Aucune collision de variable, de fonction ni de base temporaire (vérifié) |

**Fusions automatiques vérifiées :**
- `lib/i18n/{fr,en,es,keys}.ts` : le Lot 2 ajoute 3 clés `owner.*`, M8 en ajoute 52 `contributions*`. **Aucune n'est absente, en FR, EN ou ES.**
- Tests des Offrandes : tous verts dans l'arbre intégré.

## 4. Résultats des tests

| Contrôle | Référence `main`+L2 | Référence `main`+M8 | **Intégré** |
|---|---|---|---|
| `npm ci` | 0 | 0 | **0** |
| `npm test` | 5323 / 0 échec | 5575 / 0 échec | **5636 / 0 échec** |
| `npm run lint` | — | — | **0** (3 avertissements préexistants) |
| `npx next typegen` · `tsc --noEmit` | — | — | **0 · 0** |
| `npm run build` | — | — | **0** |
| `npm run db:test` | 1607 / 0 | 1762 / 0 | **1813 / 0** |

**Avant/après, test par test** (rapport JSON de vitest) :
- tout test vert dans une référence **existe et est vert** dans l'arbre intégré ;
- les quatre absences apparentes sont des renommages faits par le côté qui a modifié le test, et chaque successeur est vert :
  - rendus Intemporel « six » → « existants » (M8) ;
  - D1 « avis exclut les contributions » → « avis permet condoléances, récits, photos » (M8, changement de règle décidé, voir § 5-A) ;
  - clés de la copie gratuite (M8-E1) ;
  - lecture des gestes avec signature (Lot 2).

**Harnais, contrôle par contrôle :**
- 0 contrôle perdu du côté du Lot 2 ;
- 1 seul côté M8 : `symbolic_offerings … (exact column set)`, **adapté délibérément par le Lot 2**, qui ajoute `signature` et `signed_at` à l'ensemble attendu.

### Défaut corrigé (notre périmètre) : test O12 dépendant de l'heure

Ce défaut a été découvert pendant E6-I. Le contrôle O12 figeait `DAY1 = 2026-11-20 08:00 (Paris)`, mais déposait la contribution à l'heure réelle.
- Depuis le 2026-11-20 à 07:00 UTC, le dépôt devenait postérieur à `DAY1` et quatre contrôles échouaient, **sur la branche M8 seule comme dans l'arbre intégré**.
- La fusion n'y est pour rien, et le récapitulatif non plus : il exclut à juste titre ce qui est postérieur à `p_now`.
- **Correction :** le dépôt est daté explicitement avant `DAY1`.
- Les autres dates du bloc sont relatives à `now()` ou explicites ; la visibilité d'un hommage complet ne dépend pas de sa date de publication (`memorial_publicly_visible_v1`).

## 5. Matrice de non-régression du Builder

### A — Parcours Builder

| Point | Preuve | Résultat |
|---|---|---|
| Parcours unique, aucun ancien parcours | NAV : Builder invité réel `/creer` parcouru **de bout en bout** sur les deux arbres, en Desktop 1440 et Mobile 390 (langue, puis Hero avec envoi réel d'une photo, recadrage, ambiance, avis, cérémonie, traditions, récit, Galerie, puis la pause finale) | **Même séquence, texte identique écran par écran** (20/20 en Desktop, 20/20 en Mobile). **Seul ajout : l'écran A15** « Les mots de vos proches », après A13 (M7, GO PO + QG) |
| Formulaires et navigation | NAV, même parcours ; comparaison pixel de chaque écran | Seule différence : l'extrémité de la **barre de progression** (une étape de plus au total), plus le badge de l'outil de développement Next.js sur un écran Mobile (absent en production) |
| Sauvegarde du brouillon | NAV : indicateurs « Enregistrement… / Enregistré » identiques ; AUTO : `AutosaveIndicator`, `GuestBuilderRuntime` (rechargement, reprise sur la pause), `draft-revision` | OK |
| Magic Link | Fichiers d'authentification (`lib/auth`, `app/auth`, `app/login`, proxy) **identiques à l'octet** entre la référence et l'intégré ; AUTO : suite d'authentification verte. `/login` est identique au pixel près | **NON LOCAL** : envoi réel de l'e-mail (Supabase Auth) |
| Reprise après reconnexion | `/brouillon/reprise`, `/brouillon/sauvegarder` identiques au pixel près ; transfert de brouillon invité (QG 008 Lot 2) testé au harnais | **NON LOCAL** : reconnexion réelle |
| Gratuit / complet | AUTO + BASE : quotas, fenêtres, HD403/HD507 inchangés ; **une règle change, comme décidé : la copie gratuite « avis » accepte la rubrique Contributions (D1)** | À reconfirmer par la PO comme décision connue (D1, M8-P) |

### B — Scènes artistiques

NAV : Preview réelle du Builder (`BuilderPreviewHost` → `MemorialAssembly`) avec le jeu de l'Atelier, chaque rubrique capturée seule. Le témoin (référence contre elle-même) donne 0 pixel d'écart : le rendu est déterministe.

| Scène | Light / Dark × 1440 / 390 / 320 |
|---|---|
| Hero Intemporel · Avis de décès · Cérémonie · Récit de vie · Traditions & repères · Galerie A13 · Offrandes symboliques | **42 captures sur 42 identiques au pixel près** |
| Galerie A13, géométrie | AUTO : l'empreinte A13 calculée sur `main` **passe aussi avec le solveur de `main`** (exécutée dans la référence) **et avec celui de l'arbre intégré** : géométrie par défaut identique au bit près |
| Contributions des proches | Les fichiers de la scène sont identiques entre la référence M8 et l'intégré (partition § 2) ; AUTO : 15 tests de section, matrices de scène ; captures de M5 à E4 déjà validées |
| Emplacement Vidéo | AUTO : `memorial-section-order.test.ts` (« la Vidéo reste juste après la Galerie »), aucun rendu, publication « jamais opérationnelle ». Ordre canonique **identique** entre la référence et l'intégré |

### C — Expérience visuelle

| Point | Preuve | Résultat |
|---|---|---|
| Empilement et animation de disparition | NAV **avec mouvement activé** : 13 positions de défilement × Light/Dark × Desktop/Mobile ; hauteurs de défilement **identiques** | Écarts **dans le bruit du témoin** (le même écart de 3259 pixels apparaît en comparant la référence avec elle-même). Code d'assemblage et d'empilement **non modifié** (M8 ajoute une entrée au registre) |
| Coins, ombres, Light/Dark, typographies, cadrages, Masters | NAV : 42 captures identiques ; 26 pages (accueil, `/creer`, `/login`, `/builder/demo`, pilotes) identiques au pixel et au texte | OK |
| Responsive | 1440, 390, 320 | OK |

### D — Médias

| Point | Preuve | Résultat |
|---|---|---|
| Profils Hero et Galerie | Lignes `hero` (2400 px) et `gallery` (1600 px) **inchangées** ; `contribution` est une entrée distincte | OK |
| A13 et Contributions jamais mélangés | AUTO + BASE : les réservations Hero et Galerie refusent la finalité `contribution` ; le quota gratuit de la Galerie ignore les photos des proches ; la liste familiale ne signe qu'un média `contribution` | OK |
| Aucune suppression accidentelle | BASE : `media` identique à l'octet après E1–E4 ; le nettoyage ne voit que des lignes `pending` ; tâche planifiée **absente** et désactivée | OK |
| Droits et limites commerciales | Q7-B : une photo de proche ne réduit pas le budget de la famille ; HD507 conservé (harnais) | OK |

## 6. Supabase et sécurité (BASE, exécuté)

**Ordre :** Lot 2, puis E1, E2, E3, E4. Harnais intégré dans cet ordre : 1813 / 0. Le schéma obtenu est identique à celui de l'ordre inverse (E6-P).

**Catalogue des accès, avant et après, sur des bases ne contenant que les migrations :**
- 6 nouvelles tables, toutes avec **RLS activée et aucun droit client** ;
- **aucune politique RLS modifiée**, aucune fonction exécutable par un client, bucket inchangé et privé ;
- **un seul élargissement, voulu par E1 (GO QG)** : `authenticated` reçoit `SELECT` sur 12 colonnes de `messages`, **jamais `idempotency_key`**. Il permet à la famille de lire ses messages par sa session, selon la politique **existante et inchangée** `messages_select_own`.

**Isolation, prouvée sur la base « migrations seules » :**
- la famille A voit ses 2 messages (y compris en attente), aucun de B ;
- la famille B voit le sien ;
- une session étrangère voit 0 ligne ;
- `idempotency_key`, UPDATE, DELETE et INSERT sont refusés ;
- `anon` n'accède ni à la table ni aux RPC.

**Données existantes**, sur un jeu représentatif (hommage complet publié avec ses choix A15, brouillon gratuit, médias Hero et Galerie, messages historiques) :

| Table | Après E1–E4 |
|---|---|
| `memorials`, `memorial_drafts`, `memorial_published_snapshots`, `media`, `owners`, `entitlements`, vérifications, Offrandes, réclamations de nettoyage, `storage.buckets` | **identiques à l'octet** |
| `messages` | colonnes ajoutées ; visible → `published` ; non visible → `pending`, et reste invisible |
| `memorial_access_settings` | + `contributions` dans `avis_snapshot_keys` (D1) |
| hommage publié | catégories en vigueur = ses choix A15 publiés ; aucune ligne créée |

**Retour arrière sur ces données :**
- E4, puis E3, E2, E1 : **toutes les tables reviennent à l'empreinte d'avant E1**. Seule différence : l'horodatage `updated_at` de `memorial_access_settings`, rafraîchi ; son contenu est restauré.
- Après **un seul dépôt réel** : le retour arrière d'E1 est **refusé** (« real contributions exist ») et **aucune donnée n'est touchée** (empreintes identiques).

**Postflight C3 : limite documentée, non modifiée.** Il compare des comptages figés à l'époque C3 et échoue déjà sur `main`. Il est remplacé, pour cette intégration, par les contrôles actuels ci-dessus :
- catalogue des accès ;
- isolation ;
- `m8_e1_postflight` (26 OK) et `m8_e2_e4_postflight` (16 OK) ;
- postflights du Lot 2.

## 7. Ouverture publique

| Exigence | Preuve | Résultat |
|---|---|---|
| Les 4 actions de dépôt sont inaccessibles, **même avec migrations et secret** | Build de **production** (`next start`), `CONTRIBUTIONS_FORM_TOKEN_SECRET` défini (valeur locale aléatoire, jamais conservée), Supabase local factice qui journalise chaque requête ; actions appelées **par HTTP** avec leurs identifiants du manifeste | Les 4 répondent `unavailable` avec **0 requête vers Supabase** ; témoin `loadContributions` : 1 requête `read_public_contributions_v2`, ce qui prouve que le montage n'est pas vide |
| Les lectures publiques n'exposent ni attente, ni refus, ni masqué, ni privé | AUTO (harnais) : P1 « pending, rejected and hidden are never read » ; by-ids refuse masqué et autre hommage ; aperçu public qui ne compte que le publié ; `read_public_memorial_v1` n'expose aucune photo de proche ; colonnes exactes, sans `idempotency_key` | OK |
| Formulaire fermé avant Masters et Q6 | `CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = false` ; aucune page publique n'importe la fenêtre (test) ; verrou serveur ci-dessus | OK |

## 8. Limites des simulations

- **Sans Supabase réel :** e-mails Magic Link, reconnexion réelle, Storage (envoi et suppression d'octets), PostgREST (requête du curseur composé), données réelles en volume.
- **Animation :** la comparaison avec mouvement activé n'est pas déterministe au pixel. Elle est interprétée contre un témoin et complétée par l'identité du code d'assemblage.
- **Données de production :** non lues (interdit). Le jeu représentatif est construit d'après le préflight E0.
- **`faketime` absent :** la robustesse du harnais aux dates futures repose sur la lecture du code, non sur une exécution.
- **Scènes Contributions et Vidéo :** absentes du jeu de l'Atelier, donc non capturées avant/après. Elles sont couvertes par l'identité des fichiers et par les tests.

## 9. Opérations soumises à un GO QG

1. Confirmation par le chef de projet n° 01 de la disponibilité de la PR #105, puis sa mise à jour sur `main` et sa fusion.
2. Mise à jour de la branche Contributions sur ce `main`, avec les résolutions du § 3, puis PR et revue.
3. Migrations E1 à E4 sur `nudqzbdfnjzlnyffllgs` (dossier E6-P § 4).
4. Création de `CONTRIBUTIONS_FORM_TOKEN_SECRET` dans Netlify.
5. Déploiement.
6. Ouverture du verrou, après les Masters « La lettre des proches » et Q6.
7. Nettoyage des médias abandonnés.

**À confirmer par la PO :** la règle commerciale D1, qui ouvre la rubrique Contributions à l'offre gratuite. C'est une décision connue (M8-P), mais visible pour les familles de l'offre gratuite.
