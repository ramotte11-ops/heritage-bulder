# M8-DB-02 — Installation des cinq migrations depuis le SQL Editor Supabase

> **Statut : installation Supabase TERMINÉE — CLOSED** (décision QG, mission M8-DB-02-FINAL).
> Les cinq migrations sont installées sur `nudqzbdfnjzlnyffllgs`. Aucune nouvelle exécution des fichiers 01 à 05 n'est prévue.
> Les §§ 1 à 7 décrivent la **procédure historique**, conservée comme référence. Le § 0 donne les **résultats réels**.

```text
Référentiel QG-BASE-001 lu : oui
Production officielle : nudqzbdfnjzlnyffllgs
Cible de la mission : nudqzbdfnjzlnyffllgs
Écriture Supabase : réalisée sous GO QG + PO (installation 1/5 à 5/5), puis CLOSED
Modification des raccordements de production : interdite
```

## 0. Installation réelle — résultats (CLOSED)

**Source des résultats.** Ce sont ceux affichés par le SQL Editor Supabase du projet `nudqzbdfnjzlnyffllgs`, lors de l'exécution des fichiers par la PO. La PO les a transmis et le QG central les a validés. **Ce ne sont pas des tests rejoués par l'agent** : les essais locaux de préparation sont décrits séparément, au § 7.

**Déroulement.**
1. **Premier essai de l'étape 1 :** arrêt « STOP … empreinte différente », sans aucune modification de la base (§ 8).
2. **Correction :** le texte des migrations voyage en base64.
3. **Installation :** les cinq migrations ont ensuite été installées dans l'ordre, depuis le SQL Editor.

| Contrôle (SQL Editor, production) | Résultat validé par le QG |
|---|---|
| Historique avant l'étape 1 | 44 migrations |
| Installations 1/5 à 5/5 | **5 / 5 OK** |
| Empreintes SHA-256 des textes installés | **5 / 5 conformes** |
| Postflight Lot 2 (`lot2_signature_postflight`) | **10 / 10 OK** |
| Postflight M8-E1 (`m8_e1_postflight`) | **26 / 26 OK** |
| Postflight M8-E2 à E4 (`m8_e2_e4_postflight`) | **16 / 16 OK** |
| Contrôle global Z1 (`030_postflight`) | Aucun ECHEC |
| Contrôle final Z2 (`99_etat_apres_installation`) | **66 / 66 OK** |
| Historique après l'étape 5 | **49 migrations**, soit les 49 fichiers de `supabase/migrations/` |
| Données existantes | Conservées : 35 médias, 3 offrandes symboliques |

**Incident de copier-coller :** la cause, des fins de ligne Windows (CRLF), a été identifiée. La correction par transport base64 a été **validée en conditions réelles** par cette installation (§ 8).

**Ce qui reste hors de cette clôture.** Les opérations suivantes ne font pas partie de l'installation Supabase. Elles relèvent du dossier `docs/contributions-e6r-dossier-operationnel.md` § 4, et chacune exige son propre GO :
- le secret du formulaire Netlify ;
- la publication unique ;
- la recette E7 ;
- l'ouverture publique.

Les retours arrière R5 → R1 (§ 6) restent disponibles, uniquement sur décision du QG.

---

*Procédure historique, conservée comme référence (§§ 1 à 7).*

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
| D1 | `00a_diagnostic_copier_coller.sql` | Lecture seule : identifie ce que le SQL Editor modifie dans le texte collé (§ 8) |
| D2 | `00b_test_transport.sql` | Lecture seule : vérifie que les cinq textes encodés arrivent intacts, y compris le plus gros (E1) |
| 1 | `01_installation_20261116120000_lot2_offering_signature.sql` | Signature des offrandes (Lot 2) |
| 2 | `02_installation_20261119090000_m8_e1_contributions.sql` | Contributions des proches : données |
| 3 | `03_installation_20261120090000_m8_e2_owner_contribution_settings.sql` | Réglages de la famille (lecture) |
| 4 | `04_installation_20261121090000_m8_e3_public_contributions_overview.sql` | Aperçu public (lecture) |
| 5 | `05_installation_20261122090000_m8_e4_public_contributions_reads.sql` | Album public (lecture) |
| Z | `99_etat_apres_installation.sql` | Contrôle en lecture seule à la fin |
| R5 → R1 | `R5_…` à `R1_…` | Retours arrière, **uniquement sur décision du QG**, dans l'ordre 5, 4, 3, 2, 1 |

## 3. Comment chaque fichier se protège

1. **Le texte est le bon.** Le fichier contient le texte exact de la migration GitHub, **encodé en base64** : uniquement des lettres, des chiffres et `+ / =`. Il contient aussi son empreinte SHA-256. Une fois décodé, le texte doit avoir exactement cette empreinte. L'encodage résiste à ce qui a provoqué l'arrêt 1/5 (§ 8) : fins de ligne Windows, espaces, indentation, normalisation des accents, retrait des commentaires. Toute autre altération (caractère changé, ligne perdue, collage incomplet) donne un STOP. Le texte exécuté est donc toujours le fichier GitHub, à l'octet près.
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

## 4. Avant de commencer (QG) — référence historique, réalisé

- [ ] GO explicite du QG et de la PO.
- [ ] **Bonne base :** l'adresse du navigateur contient `supabase.com/dashboard/project/nudqzbdfnjzlnyffllgs/`. Le nom affiché doit être `HERITAGE HOMMAGE - PRODUCTION`. **La référence prévaut sur le nom.** Si l'adresse contient `pbgzyyqdbdrhgnkzmxyn`, c'est l'ancien projet : **STOP**.
- [ ] **Sauvegardes :** relever, dans Database → Backups, ce que l'offre gratuite propose, et noter l'heure de la dernière sauvegarde. Sans offre payante, il n'y a pas de restauration à un instant précis (PITR). La protection repose alors sur trois éléments :
  - des étapes tout-ou-rien ;
  - des retours arrière testés (§ 6) ;
  - l'instantané « E. info » du fichier `00`.

  Si une personne technique est disponible, `scripts/db/backup-supabase.sh` permet une sauvegarde complète du schéma `public`, vérifiable en local.
- [ ] Netlify `hommages` : le déploiement `6afbd1d6759c7fa4752d391b` est toujours publié et **verrouillé**. Il le reste jusqu'à la fin.
- [ ] Prévoir environ 30 minutes, sans interruption.

## 5. Pas à pas (PO, avec le QG) — référence historique, exécuté (résultats au § 0)

> Ne pas rejouer les fichiers 01 à 05 : ils répondraient « STOP … DÉJÀ INSTALLÉE » sans rien modifier.

**Pour chaque fichier :**
1. Sur GitHub, ouvrir le fichier, puis cliquer sur « Copy raw file ».
2. Dans Supabase, ouvrir SQL Editor, puis « New query ».
3. Coller avec Ctrl+V (Cmd+V sur Mac). **Ne rien sélectionner.**
4. Cliquer sur « Run ». Si une fenêtre avertit d'opérations destructives, cliquer sur « Run this query » : c'est attendu.
5. Faire une capture du résultat et l'envoyer au QG. **Attendre son accord avant le fichier suivant.**

| # | Coller ce fichier | Résultat attendu | STOP si |
|---|---|---|---|
| D1 | `00a_diagnostic_copier_coller.sql` | Tableau complet à transmettre au QG. La **dernière ligne (99)** doit indiquer « OK : la procédure corrigée passera » | La ligne 99 n'est pas OK, ou erreur |
| D2 | `00b_test_transport.sql` | **5 lignes OK** | Une ligne ECHEC, ou erreur (fichier trop gros pour l'éditeur, par exemple) |
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

## 7. Preuves de préparation (essai local, avant l'installation réelle)

Cette section décrit les essais faits **avant** l'installation, sur une base locale jetable et non sur la production. Les résultats réels sont au § 0.

`bash scripts/db/test-sql-editor-installation.sh` rejoue tout sur un PostgreSQL jetable : base au niveau de la production (44 versions, 3 offrandes, aucun message). Chaque fichier y est envoyé en **une seule requête**, comme le fait le SQL Editor. Résultat : **78 contrôles réussis sur 78**, transport altéré compris (§ 8).
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

## 8. Incident du 21/11/2026 : arrêt de l'installation 1/5

**Constat.** Le fichier `01` a répondu :

> STOP [20261116120000] : texte de la migration altéré au copier-coller (empreinte différente). Rien n'a été modifié.

L'erreur se situe à la ligne 169 du bloc `DO`. **La protection a joué son rôle : la base n'a pas été modifiée.**

**Diagnostic.**
- **Le fichier publié est correct.** Le fichier sur GitHub est identique, octet pour octet, au fichier généré et testé. Les cinq migrations sont propres : UTF-8, fins de ligne LF uniquement, aucune tabulation, aucun espace en fin de ligne, aucun BOM, aucun caractère invisible. Elles contiennent en revanche des accents et des tirets (é, è, —, œ, «, », →).
- **Le texte est arrivé avec le même nombre de lignes.** La ligne 169 est exactement le contrôle d'empreinte du fichier d'origine. Aucune ligne n'a donc été perdue, ajoutée ou fusionnée : l'altération s'est produite **à l'intérieur des lignes**, entre GitHub, le presse-papiers, le SQL Editor et PostgreSQL.
- **Reproduction locale.** Cinq altérations de ce type, appliquées à l'ancien fichier `01`, produisent **exactement** ce message, à la ligne 169 :
  - fins de ligne Windows (CRLF) ;
  - accents décomposés (Unicode NFD) ;
  - commentaires retirés ;
  - indentation retirée ;
  - espaces ajoutés en fin de ligne.

  Le fichier intact, lui, s'installe normalement. À ce stade, la plus probable était la conversion en fins de ligne Windows (CRLF) lors d'un copier-coller sous Windows. Le fichier `00a`, collé de la même façon, permet d'identifier la cause réelle sur le poste de la PO, en lecture seule.

**Cause confirmée.** Le QG a confirmé la cause : **fins de ligne Windows (CRLF)** introduites au copier-coller.

**Correction.**
- Le texte des migrations et des retours arrière voyage désormais en base64, et l'empreinte SHA-256 est vérifiée sur le texte décodé. La protection garde donc toute sa force : le texte exécuté est le fichier GitHub à l'octet près, et toute autre altération donne un STOP.
- Les cinq migrations, les contrôles et les retours arrière sont inchangés.
- L'essai local (§ 7) comprend désormais la section « transport altéré ». Sous chacune des cinq altérations, et sous leur cumul :
  - le diagnostic nomme la cause ;
  - le test de transport donne 5 OK ;
  - l'étape 1 s'installe ;
  - les étapes 1 à 5 cumulées donnent un schéma et des droits identiques à une application classique.

**Résolution.** Avec la procédure corrigée, l'installation réelle a réussi : 5 / 5 OK, empreintes conformes et contrôle final 66 / 66 OK (§ 0). **Incident clos.**

## 9. Après l'installation

L'installation Supabase est **CLOSED** (§ 0). La suite ne relève plus de ce document. Elle est décrite dans `docs/contributions-e6r-dossier-operationnel.md` § 4 : le secret du formulaire, puis une seule publication. Chaque opération y exige son propre GO.
