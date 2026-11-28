# A15-R — Contributions des proches : recette réelle isolée

> **Branche de recette `recette/a15-contributions` : ne jamais fusionner dans `main`.**
> Rien de ce dossier n'est autorisé par sa rédaction. Chaque étape **[GO]** exige un GO QG distinct et nominatif.
> La production reste inchangée : son déploiement publié est verrouillé, et `main` garde le verrou A15 fermé.
> Les textes Q6 restent des **propositions non validées juridiquement**, même si la recette réussit.

## 1. Ce que contient la branche

| Fichier | Changement |
|---|---|
| `config/contributions-deposit-readiness.ts` | `CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = true`, `CONTRIBUTIONS_DEPOSIT_RECETTE = true`, et la barrière `contributionsDepositOpenFor(slug)` (voir ci-dessous) |
| `app/hommage/[slug]/page.tsx` | La rubrique n'est lue et le dépôt n'est transmis que si `contributionsDepositOpenFor(slug)` |
| `app/hommage/[slug]/contribution-actions.ts` | Les 4 actions de dépôt vérifient le verrou, **puis le slug**, avant toute lecture |
| Tests (4 fichiers) | Adaptés au verrou ouvert en mode recette. Ajout de tests de la barrière : échec fermé, slug hors liste |
| `scripts/local-e2e/a15-recette/` | Kit local : semis de données, parcours navigateur de 40 contrôles |
| `supabase/verifications/a15r_recette_*.sql` | État (lecture seule), arrêt d'urgence, purge |
| `docs/recette/a15/` | Portrait et photo **fictifs**. La photo porte un EXIF GPS fictif, pour vérifier son retrait |

**Barrière propre à la branche : `CONTRIBUTIONS_RECETTE_SLUGS`.** Variable serveur, non secrète, qui liste les slugs des hommages de test (au plus 4, de la forme publique hexadécimale).
- Absente, vide, ou si un seul élément est mal formé : **aucun** hommage n'est ouvert.
- Tout autre hommage est servi exactement comme sur `main` : aucune rubrique, aucun dépôt.

Rien d'autre ne change : jeton anti-robots, plafonds R2/R3/R5, catégories O9, offre gratuite, droits de la famille, base de données, Masters, empilement, parcours A15.

## 2. Prérequis

| # | Contrôle | État | Qui / comment |
|---|---|---|---|
| P1 | Migrations M8 E1 à E4 (et Lot 2) en production | Preuve documentaire (M8-DB-02 CLOSED). **À confirmer en lecture seule** | PO : SQL Editor du projet `nudqzbdfnjzlnyffllgs`, coller `supabase/verifications/a15r_recette_etat.sql` tel quel → ligne « 1 migrations M8 présentes » = `5 / OK`, ligne 6 = `0 / OK` |
| P2 | `CONTRIBUTIONS_FORM_TOKEN_SECRET` | **À vérifier par la PO**. L'outil Netlify de la session affiche en clair les variables non marquées secrètes : il n'a pas été utilisé, pour ne jamais exposer de valeur | Netlify → `hommages` → Project configuration → Environment variables : noter seulement « présente / absente », la case « secret » et les contextes |
| P3 | Base Supabase des déploiements de branche | **À vérifier par la PO** | Même écran : `NEXT_PUBLIC_SUPABASE_URL`, valeur du contexte « Branch deploys » (non secrète) : doit contenir `nudqzbdfnjzlnyffllgs`. Le 26/11 (VID-12), `SUPABASE_SERVICE_ROLE_KEY` était **vide** en Branch deploys |
| P4 | Déploiements de branche | **À vérifier par la PO** | Project configuration → Build & deploy → Continuous deployment → Branches and deploy contexts : noter le réglage actuel de « Branch deploys » (il sera rétabli à la fin) |
| P5 | Accès réservé à l'équipe hors production | **Vérifié (lecture Netlify, 28/11)** : `requiresSSOTeamLogin` pour `non_production`, pas de mot de passe | La PO confirme dans Visitor access que la protection est toujours active |
| P6 | Production inchangée | **Vérifié (28/11)** : déploiement publié `6b09d2f3…` (commit `83582ba`), `locked: true` | — |

## 3. Environnement de recette proposé

Il n'existe pas de projet Supabase isolé : le projet A `pbgzyyqdbdrhgnkzmxyn` est interdit, et un troisième projet engagerait une décision de dépense. La recette réelle reprend donc le dispositif de la recette vidéo VID-12 :

- **Code :** un *branch deploy* Netlify de la seule branche `recette/a15-contributions`, à l'adresse `https://recette-a15-contributions--hommages.netlify.app`. Il est construit dans le contexte « branch deploy », jamais en production.
- **Base :** le projet B `nudqzbdfnjzlnyffllgs`. Les écritures sont confinées à deux hommages **fictifs** nommés « TEST RECETTE A15 », par la liste de recette.
- **Accès :** connexion Netlify de l'équipe, obligatoire pour toute adresse hors production. Les visiteurs extérieurs ne peuvent ni ouvrir la page ni appeler les actions.
- **Rôles :**
  - **Famille :** compte de test connecté. La modération se fait sur le **site habituel** `hommages.netlify.app/owner` : même base, écrans du Lot 3 déjà en production, connexion habituelle.
  - **Visiteur :** fenêtre privée, connectée à Netlify mais **pas** à HERITAGE. Il dépose et consulte sur l'adresse de recette.
- **Variables propres à la branche** (valeurs « par branche », jamais Production ni toutes les branches). Portées Functions et Runtime, plus Builds pour `NEXT_PUBLIC_*` :

| Variable | Valeur | Secret | Posée par |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role du projet B (Supabase → Project Settings → API keys) | oui | PO |
| `CONTRIBUTIONS_FORM_TOKEN_SECRET` | **Nouvelle** valeur aléatoire, au moins 32 caractères, distincte de celle de production (gestionnaire de mots de passe : 64 caractères) | oui | PO |
| `CONTRIBUTIONS_RECETTE_SLUGS` | `<slug complet>,<slug gratuit>` | non | QG, ou la session sur GO |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Celles du projet B, si P3 montre une autre valeur | non / non | PO |

## 4. Risques pour la base de production, et parades

| Risque | Parade |
|---|---|
| Dépôt sur un vrai hommage | Liste de recette, échec fermé (testé) ; accès réservé à l'équipe ; production publiée inchangée et verrouillée |
| Données de test dans B | Deux hommages « TEST RECETTE A15 » seulement. Après la recette : purge ciblée, avec garde-fou sur le nom (testé en local) |
| **Retour arrière M8-E1 (R2) bloqué** | Dès le premier dépôt, le script R2 refuse de s'exécuter (« real contributions exist »). Les contributions **refusées** ne peuvent pas être supprimées depuis l'écran famille. Seule la purge (§ 7) rend R2 de nouveau possible (vérifié en local : « R2 possible : oui ») |
| Envoi photo interrompu | Le fichier brut reste dans le bucket privé, illisible, car le balayage n'est pas raccordé. `a15r_recette_etat.sql` § 5 indique le dossier à vider dans Storage |
| Adresse permanente d'un ancien déploiement de recette encore ouverte | Accès réservé à l'équipe, et seulement pour les slugs de recette. L'archivage des deux hommages (arrêt ou purge) refuse aussitôt tout dépôt, sur tous les déploiements |
| Construction de branche | Consomme des minutes de construction du forfait Netlify. Aucune dépense prévue au-delà du forfait : à confirmer par le QG |
| Textes Q6 | La lettre affiche « Proposition de texte — non validée juridiquement ». Une recette réussie ne valide rien juridiquement |

## 5. Opérations nécessitant un GO

| GO | Opération | Par |
|---|---|---|
| GO-1 | Contrôles P1 à P5 (lecture seule) | PO |
| GO-2 | Création et publication des deux hommages fictifs sur le site habituel, avec deux comptes de test | PO |
| GO-3 | Netlify : branch deploy de la seule branche `recette/a15-contributions`, et variables **par branche** (§ 3) | PO + QG |
| GO-4 | Déclenchement de la construction : la session pousse un commit sur la branche, **sans** « [skip netlify] » | Session |
| GO-5 | Recette navigateur (§ 6) | PO |
| GO-6 | Fin de recette : retrait des variables par branche, réglage « Branch deploys » rétabli (P4) | PO + QG |
| GO-7 | Purge SQL ciblée (§ 7) | QG (exécution PO dans le SQL Editor) |
| — | Arrêt d'urgence (`a15r_recette_arret.sql`), à tout moment en cas d'incident, signalé ensuite au QG | PO |

## 6. Étapes de la PO dans son navigateur

### Préparation (GO-2), sur `hommages.netlify.app`

1. **Famille A, offre complète.**
   - Avec le compte de test habituel, qui doit avoir un mot de passe : console d'administration → clé d'activation → `/activate`.
   - Nom : `TEST RECETTE A15 — Complet`. Portrait : `docs/recette/a15/portrait-fictif-recette.jpg`.
   - Écran « Les mots de vos proches » : cocher **les trois** catégories.
   - Publier, avec le code reçu par e-mail.
2. **Famille B, offre gratuite.**
   - Avec un **second** compte de test, sur une autre adresse de la PO, mot de passe défini.
   - Nom : `TEST RECETTE A15 — Gratuit`, même portrait, les trois catégories cochées.
   - Publier en offre gratuite.
3. Relever les deux slugs (fin de l'adresse `/hommage/<slug>`) et les transmettre au QG.

> Le nom doit commencer exactement par `TEST RECETTE A15` : c'est le garde-fou de l'arrêt et de la purge.

### Recette (GO-5) — pour chacun des deux hommages

**Visiteur** : fenêtre privée, adresse `https://recette-a15-contributions--hommages.netlify.app/hommage/<slug>`. **Famille** : fenêtre normale, `hommages.netlify.app/owner` → l'hommage → « Gérer les contributions ».

| # | Qui | Action (textes **fictifs** uniquement) | Attendu |
|---|---|---|---|
| 1 | Visiteur | « Laisser un message » → Condoléances. Nom `Visiteur fictif 1`, message `Message fictif de recette.` → Envoyer | « Votre message est désormais visible ». La carte apparaît sans recharger la page. La lettre affiche la mention « Proposition de texte — non validée juridiquement » et `contact@herelys.com` |
| 2 | Visiteur | « Autre souvenir » → Récit. `Visiteur fictif 2`, `Récit fictif de recette.` | « visible dès que la famille l'aura validé ». Absent de la page |
| 3 | Visiteur | « Autre souvenir » → Photographie : `docs/recette/a15/photo-fictive-avec-gps.jpg`, légende `Légende fictive` | En attente, absente de la page |
| 4 | Famille | Onglet « En attente » : le récit et la photo apparaissent → Approuver les deux | Passent dans « Publiées » |
| 5 | Visiteur | Recharger la page | Récit et photo visibles |
| 6 | Famille | « Publiées » → Masquer la condoléance ; le visiteur recharge ; « Masquées » → Réafficher | Disparaît, puis revient **à sa place** |
| 7 | Visiteur | Nouveau récit `Visiteur fictif 3`, `Récit fictif à refuser.` | En attente |
| 8 | Famille | Refuser ce récit, puis confirmer | Dans « Refusées », jamais visible du visiteur |
| 9 | Famille | « Publiées » → Supprimer la photo, puis confirmer | Le visiteur recharge : la photo a disparu |
| 10 | Famille B | Coller dans la barre d'adresse l'adresse de la page « Gérer les contributions » de **A** (et inversement) | « 404 This page could not be found. », aucune contribution de l'autre famille |
| 11 | Visiteur | Ouvrir cette même adresse de modération | Renvoi vers la page de connexion |
| 12 | Visiteur | Sur l'adresse de recette, ouvrir un hommage publié **qui n'est pas** de test | Ni rubrique ni « Laisser un message » |

La PO note OK ou KO pour chaque ligne et transmet le tableau au QG. Le QG relance ensuite `a15r_recette_etat.sql` : la ligne 6 doit valoir `0 / OK`, aucune contribution hors des hommages de test.

## 7. Retour arrière et nettoyage

- **Incident pendant la recette :** `supabase/verifications/a15r_recette_arret.sql`, avec les deux slugs. Les deux hommages passent `archived` : dépôts refusés et page publique retirée, aussitôt, sur tous les déploiements. Aucune donnée n'est supprimée, et la reprise reste possible.
- **Fin de recette (GO-6, puis GO-7) :**
  1. Netlify : supprimer les trois valeurs par branche (§ 3). Remettre « Branch deploys » au réglage noté en P4. Le déploiement de recette existant reste accessible à l'équipe seule, et l'archivage de l'étape 2 y refuse tout dépôt.
  2. SQL Editor : `a15r_recette_etat.sql` (photo de l'état), puis `a15r_recette_purge.sql`, puis de nouveau l'état. Attendu :
     - aucune contribution ni média de proche sur les deux hommages ;
     - « retour arrière R2 possible : oui » ;
     - hommages `archived` ;
     - le constat de fin de purge indique `0 | 0 | archived`.
  3. Storage : vider à la main tout dossier listé à la ligne 5 de l'état, s'il y en a.
  4. La branche reste non fusionnée. Sa suppression distante demande un accord QG (AGENTS.md).
- **Production :** rien à défaire. Aucun déploiement publié, aucune variable de production, aucune migration ne sont touchés.

## 8. Preuves locales (2026-11-28)

| Contrôle | Résultat |
|---|---|
| `npm ci` · `npm run lint` · `npm test` · `npx next typegen` · `npx tsc --noEmit` · `npm run build` (sans `.env.local`, comme la CI) | 0 · 0 (3 avertissements préexistants) · **6657 / 6657** · 0 · 0 · 0 |
| `npm run db:test` (harnais PostgreSQL, toutes migrations) | **1917 / 0 échec** |
| Pile Supabase locale complète (Auth, PostgREST, Storage), les 52 migrations du dépôt, `next start` de la branche | **40 / 40** contrôles navigateur (`scripts/local-e2e/a15-recette/e2e.js`), deux fois, sur une base remise à zéro |
| Purge locale | 6 contributions, 2 réclamations, 2 médias, 2 hommages archivés. « R2 possible : oui ». Garde-fous : STOP sans modification si les slugs ne sont pas remplacés ou si un hommage n'est pas « TEST RECETTE A15 » |
| Arrêt local | Hommages archivés ; dépôt suivant refusé (`refused`) ; hommage hors recette intact |
