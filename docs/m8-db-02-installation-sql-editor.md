# M8-DB-02 — Installation des cinq migrations depuis le SQL Editor Supabase

> **Préparation seulement — STOP PRODUCTION.** Ce document n'autorise rien.
> L'exécution exige un **GO explicite du QG et de la PO**.

```text
Référentiel QG-BASE-001 lu : oui
Production officielle : nudqzbdfnjzlnyffllgs
Cible de la mission : nudqzbdfnjzlnyffllgs (préparation seulement)
Écriture Supabase autorisée : non (préparation) — GO distinct requis
Modification des raccordements de production : interdite
```

## 1. Le principe, en une phrase

Chaque étape est **un seul fichier**, collé en entier dans le SQL Editor puis exécuté avec « Run ». Il fait tout ou rien :
- il vérifie qu'il est le bon fichier, au bon moment, sur la bonne base ;
- il installe la migration ;
- il l'inscrit dans l'historique ;
- il affiche une ligne **OK**.

Au moindre problème, il s'arrête sur un message qui commence par **STOP**, et **rien n'est modifié**.

Aucune CLI, aucun abonnement payant, aucune connaissance technique ne sont nécessaires.

## 2. Les fichiers

Ils se trouvent dans `supabase/installation/m8-sql-editor/`. Ils sont générés par `scripts/db/build-sql-editor-installation.py` et ne doivent pas être modifiés à la main.

| Ordre | Fichier | Rôle |
|---|---|---|
| A | `00_etat_avant_installation.sql` | Contrôle en lecture seule avant de commencer |
| 1 | `01_installation_20261116120000_lot2_offering_signature.sql` | Signature des offrandes (Lot 2) |
| 2 | `02_installation_20261119090000_m8_e1_contributions.sql` | Contributions des proches : données |
| 3 | `03_installation_20261120090000_m8_e2_owner_contribution_settings.sql` | Réglages de la famille (lecture) |
| 4 | `04_installation_20261121090000_m8_e3_public_contributions_overview.sql` | Aperçu public (lecture) |
| 5 | `05_installation_20261122090000_m8_e4_public_contributions_reads.sql` | Album public (lecture) |
| Z | `99_etat_apres_installation.sql` | Contrôle en lecture seule à la fin |
| R5 → R1 | `R5_…` à `R1_…` | Retours arrière, **uniquement sur décision du QG**, dans l'ordre 5, 4, 3, 2, 1 |

## 3. Comment chaque fichier se protège

1. **Le texte est le bon.** Le fichier contient le texte exact de la migration GitHub et son empreinte SHA-256. Un copier-coller incomplet ou altéré donne un STOP.
2. **Pas de double installation.** Si la version figure déjà dans `supabase_migrations.schema_migrations`, c'est un STOP.
3. **L'ordre est respecté.** La dernière version enregistrée doit être exactement la précédente : `20261116100000` avant l'étape 1, puis chaque étape à son tour. Le nombre de versions doit aussi être exact : 44, puis 45 et ainsi de suite. Sinon, c'est un STOP. Ce contrôle aide aussi à détecter une mauvaise base, sans remplacer la vérification de l'adresse.
4. **Aucun objet de la migration n'existe déjà.** S'il en existe un, c'est qu'il a été créé sans être inscrit dans l'historique : STOP.
5. **L'exécution est transactionnelle.** Tout est contenu dans une seule instruction `DO` : la migration exécutée est le fichier GitHub à l'octet près, privé de ses seules lignes `begin;` et `commit;`, et l'inscription dans l'historique se fait dans la même transaction. Une erreur en cours de route annule tout.
6. **L'historique est cohérent avec GitHub.** La ligne enregistrée contient :
   - `version` : le numéro du fichier ;
   - `name` : son nom, sans numéro ni extension, comme le fait la CLI Supabase ;
   - `statements` : le texte exact du fichier.

   Les colonnes facultatives (`created_by`, `idempotency_key`, `rollback`) restent vides. Après l'étape 5, l'historique compte **49 versions**, exactement les 49 fichiers de `supabase/migrations/` : un futur `supabase db push` n'aurait rien à appliquer.

Les droits de sécurité ne sont pas touchés. Le schéma obtenu, droits compris, est **identique** à celui d'une application classique des cinq fichiers (prouvé par l'essai local du § 7).

## 4. Avant de commencer (QG)

- [ ] GO explicite du QG et de la PO.
- [ ] **Bonne base :** l'adresse du navigateur contient `supabase.com/dashboard/project/nudqzbdfnjzlnyffllgs/`. Le nom affiché doit être `HERITAGE HOMMAGE - PRODUCTION`. **La référence prévaut sur le nom.** Si l'adresse contient `pbgzyyqdbdrhgnkzmxyn`, c'est l'ancien projet : **STOP**.
- [ ] **Sauvegardes :** relever, dans Database → Backups, ce que l'offre gratuite propose, et noter l'heure de la dernière sauvegarde. Sans offre payante, il n'y a pas de restauration à un instant précis (PITR). La protection repose alors sur trois éléments :
  - des étapes tout-ou-rien ;
  - des retours arrière testés (§ 6) ;
  - l'instantané « E. info » du fichier `00`.

  Si une personne technique est disponible, `scripts/db/backup-supabase.sh` permet une sauvegarde complète du schéma `public`, vérifiable en local.
- [ ] Netlify `hommages` : le déploiement `6afbd1d6759c7fa4752d391b` est toujours publié et **verrouillé**. Il le reste jusqu'à la fin.
- [ ] Prévoir environ 30 minutes, sans interruption.

## 5. Pas à pas (PO, avec le QG)

**Pour chaque fichier :**
1. Sur GitHub, ouvrir le fichier, puis cliquer sur « Copy raw file ».
2. Dans Supabase, ouvrir SQL Editor, puis « New query ».
3. Coller avec Ctrl+V (Cmd+V sur Mac). **Ne rien sélectionner.**
4. Cliquer sur « Run ». Si une fenêtre avertit d'opérations destructives, cliquer sur « Run this query » : c'est attendu.
5. Faire une capture du résultat et l'envoyer au QG. **Attendre son accord avant le fichier suivant.**

| # | Coller ce fichier | Résultat attendu | STOP si |
|---|---|---|---|
| A1 | `00_etat_avant_installation.sql` | **61 lignes OK**, aucune ligne ECHEC ; les lignes INFO sont à transmettre au QG | Une ligne ECHEC |
| A2 | `supabase/checks/030_postflight.sql` | Aucune ligne ECHEC (aucune politique sur `storage.objects`) | Une ligne ECHEC |
| A3 | `supabase/verifications/lot2_signature_preflight.sql` | **9 OK**, 0 ECHEC (déjà constaté par le QG) | Un ECHEC |
| 1 | `01_installation_…lot2_offering_signature.sql` | Une ligne : **« OK — étape 1/5 installée et enregistrée »**, 45 versions | Message STOP ou erreur |
| 1b | `supabase/verifications/lot2_signature_postflight.sql` | **10 OK**, 0 ECHEC | Un ECHEC |
| 2a | `supabase/verifications/m8_e0_preflight.sql` | 0 ECHEC, 0 STOP | Un ECHEC ou un STOP |
| 2b | `supabase/verifications/m8_e1_preflight.sql` | **24 OK**, 0 ECHEC | Un ECHEC |
| 2 | `02_installation_…m8_e1_contributions.sql` | **« OK — étape 2/5 »**, 46 versions | Message STOP ou erreur |
| 2c | `supabase/verifications/m8_e1_postflight.sql` | **26 OK**, 0 ECHEC | Un ECHEC |
| 3 | `03_installation_…m8_e2…` | **« OK — étape 3/5 »**, 47 versions | Message STOP ou erreur |
| 4 | `04_installation_…m8_e3…` | **« OK — étape 4/5 »**, 48 versions | Message STOP ou erreur |
| 5 | `05_installation_…m8_e4…` | **« OK — étape 5/5 »**, 49 versions | Message STOP ou erreur |
| 5b | `supabase/verifications/m8_e2_e4_postflight.sql` | **16 OK**, 0 ECHEC | Un ECHEC |
| Z1 | `supabase/checks/030_postflight.sql` | Aucune ligne ECHEC | Un ECHEC |
| Z2 | `99_etat_apres_installation.sql` | **66 lignes OK**, aucune ligne ECHEC | Une ligne ECHEC |

**En cas de STOP ou d'erreur :** ne pas relancer et ne rien modifier. Copier le message, l'envoyer au QG et attendre. Rien n'a été modifié par l'étape qui a échoué. Les étapes précédentes, déjà réussies, restent installées : c'est sans danger, car l'ancien code publié fonctionne sur la base migrée.

**Relancer par erreur une étape réussie est sans danger :** le fichier répond « STOP … DÉJÀ INSTALLÉE » et ne fait rien.

## 6. Retours arrière (sur décision du QG seulement)

Ils s'appliquent dans l'ordre inverse : R5, R4, R3, R2, R1. Chaque fichier vérifie trois choses : son texte, que sa migration est bien la plus récente installée, et sa propre condition (voir le tableau). Il exécute ensuite le script `supabase/rollbacks/…down.sql` exact et retire la version de l'historique, dans la même transaction. Le résultat attendu est « OK — retour arrière n/5 effectué ».

| Retour | Condition |
|---|---|
| R5, R4, R3 | Aucune (fonctions de lecture) |
| R2 (E1) | **Refusé** par le script du dépôt s'il existe une contribution réelle (« M8-E1 rollback refused ») : décision QG sur ces données |
| R1 (Lot 2) | **Efface définitivement les signatures.** Refusé tant qu'une signature existe et que la ligne `c_signatures_exportees` vaut `false`. Le QG ne la passe à `true` qu'après l'export des signatures qu'il aura décidé (RGPD) |

Après R5 → R1, la base revient **à l'identique** à son état d'avant l'étape 1, historique compris : 44 versions.

## 7. Preuves (essai local)

`bash scripts/db/test-sql-editor-installation.sh` rejoue tout sur un PostgreSQL jetable : base au niveau de la production (44 versions, 3 offrandes, aucun message). Chaque fichier y est envoyé en **une seule requête**, comme le fait le SQL Editor. Résultat : **45 contrôles réussis sur 45**.
- **Fichiers générés :** ils sont à jour.
- **État avant :** 61 OK.
- **Refus sans aucune trace :**
  - étape lancée dans le désordre ;
  - texte altéré ;
  - objet déjà présent ;
  - échec au milieu de E1 : tout est annulé, historique compris.
- **Étapes 1 à 5 :** verdicts OK, et tous les postflights du dépôt verts (10, 26 et 16 OK ; préflight E1 : 24 OK).
- **Double installation :** refusée.
- **Schéma final identique, droits compris,** à une application classique des cinq fichiers.
- **Historique :** les 5 textes enregistrés correspondent à l'empreinte des fichiers GitHub.
- **Retours arrière R5 → R1 :**
  - R2 est refusé s'il existe une contribution, et R1 s'il existe une signature non exportée ;
  - après R5 → R1, la base revient à l'identique de l'état initial ;
  - la réinstallation complète réussit ensuite.

**Différence avec la vraie production :** l'essai tourne avec un compte administrateur local. Dans le SQL Editor, le rôle est `postgres`, celui-là même qu'utilise la CLI Supabase. Le fichier `00` vérifie que ce rôle peut écrire dans l'historique : c'est la ligne « droits du rôle courant ».

## 8. Après l'installation

La base est prête, mais rien n'est encore visible : Netlify publie toujours l'ancien déploiement verrouillé. La suite est décrite dans `docs/contributions-e6r-dossier-operationnel.md` § 4 (secret du formulaire, puis une seule publication). Chaque opération y exige son propre GO.
