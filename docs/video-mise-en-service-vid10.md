# VID-10 — Mise en service de la rubrique vidéo : procédure par phases

Complète `docs/video-hosting-mise-en-service.md` (principes, coûts, décisions).
Ici : **qui fait quoi, dans quel ordre, avec quel contrôle et quel retour
arrière**. Chaque phase marquée **GO** attend l'accord explicite de la PO.
Aucune valeur secrète dans ce document ; aucune clé ne transite par une
conversation.

## 0. État de départ (relevé VID-10, 26 novembre 2026)

| Élément | État |
|---|---|
| GitHub `main` | `cf1e591` (fusion #129, VID-05A à VID-09), contrôles verts |
| Netlify `hommages` — production publiée | déploiement `6b03311329c08193f8771ee2`, commit `3dc435a` (PR #121), **verrouillé** : le nouveau Builder n'est PAS en ligne |
| Netlify — builds de `main` | automatiques à chaque fusion (non publiés tant que le verrou tient) |
| Netlify — déploiements non publiés | protégés par la connexion SSO de l'équipe (visiteurs exclus) |
| Supabase | projet B `nudqzbdfnjzlnyffllgs` (jamais A `pbgzyyqdbdrhgnkzmxyn`) ; migrations vidéo **non appliquées** |
| Mux | environnement d'essai HERITAGE : 0 asset ; jeton de cette session en lecture seule |

## 1. GO-1 — Supabase : migrations VID-07, VID-08, VID-09 (PO, SQL Editor)

Ouvrir `https://supabase.com/dashboard/project/nudqzbdfnjzlnyffllgs/sql/new`
(vérifier la référence dans l'adresse). Pour chaque fichier : nouvelle requête
vide, coller **tout** le fichier, « Run », relever le résultat.

| # | Fichier | Attendu |
|---|---|---|
| 1 | `supabase/installation/vid-sql-editor/00_etat_avant_installation.sql` | uniquement OK / INFO |
| 2 | `supabase/verifications/vid_preflight.sql` | 16 lignes OK |
| 3 | `supabase/installation/vid-sql-editor/00b_test_transport.sql` | 3 lignes OK |
| 4 | `…/01_installation_20261125090000_vid07_memorial_videos.sql` | « OK — étape 1/3 » |
| 5 | `…/02_installation_20261125100000_vid08_video_publication_reconcile.sql` | « OK — étape 2/3 » |
| 6 | `…/03_installation_20261126090000_vid09_published_replacement.sql` | « OK — étape 3/3 » |
| 7 | `supabase/verifications/vid_postflight.sql` | 31 lignes OK |
| 8 | `…/99_etat_apres_installation.sql` | uniquement OK / INFO |

- Un ECHEC ou un STOP : **arrêter**, rien n'a été modifié par l'étape en
  cause (chaque étape est tout ou rien) ; transmettre le tableau.
- Les étapes 1 à 3 supposent le lot M8 installé (49 versions, dernière
  `20261122090000`). Si la production diffère, le fichier 1 le montre et
  l'étape 4 s'arrête d'elle-même.
- Sans risque pour l'existant : uniquement des créations (tables, fonctions,
  colonnes de la table vidéo) ; aucune donnée familiale lue ni modifiée ;
  droits des rubriques existantes inchangés. Le code en ligne actuel ne
  dépend d'aucun de ces objets ; le nouveau code fonctionne aussi sans eux
  tant que la vidéo n'est pas activée.
- Preuve locale : `bash scripts/db/test-vid-sql-editor-installation.sh`
  (30 contrôles : refus, tout ou rien, schéma identique à `psql -f`,
  données intactes, retours arrière jusqu'au schéma initial).
- Sauvegarde : relever dans le tableau de bord la sauvegarde quotidienne la
  plus récente (Database → Backups) avant l'étape 4.
- **Retour arrière** : `R3_…`, puis `R2_…`, puis `R1_…` (même dossier).
  `R1` refuse tant qu'une vidéo hébergée existe (assets Mux à supprimer
  d'abord).

## 2. GO-2 — Mux : jeton, clé de lecture signée, notification (PO, tableau de bord)

Dans `https://dashboard.mux.com`, environnement d'essai HERITAGE :

1. **Jeton serveur** (Settings → Access Tokens → Generate new token) :
   permissions *Mux Video* **Read + Write** seulement (ni System, ni Data).
   Noter l'identifiant et le secret **directement dans Netlify** (phase 3).
2. **Clé de lecture signée** (Settings → Signing Keys → Generate) : noter
   l'identifiant et la clé privée (déjà encodée en base64 par Mux).
3. **Notification** (Settings → Webhooks → Create) : URL
   `https://hommages.netlify.app/api/mux/webhook`. Noter le secret de
   signature. Voir § 4 : tant que le nouveau code n'est pas publié, cette
   adresse ne répond pas encore ; la recette fonctionne sans elle.
4. Facultatif, pour la phase 7 : un second jeton *Mux Video Read*, de
   **basse priorité**, réservé à la réconciliation.

Aucune souscription ni changement de formule : un environnement d'essai
suffit pour la recette.

## 3. GO-3 — Netlify : variables (PO)

`https://app.netlify.com/projects/hommages/configuration/env` — contexte
**Production** (le build non publié de `main` l'utilise ; la production
reste verrouillée sur l'ancien déploiement), portée : toutes (Builds,
Functions, Runtime). Cocher « secret » pour les valeurs secrètes.

| Nom | Valeur | Secret |
|---|---|---|
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | jeton serveur (phase 2.1) | oui |
| `MUX_SIGNING_KEY_ID` / `MUX_SIGNING_KEY_PRIVATE` | clé signée (phase 2.2) | oui |
| `MUX_WEBHOOK_SECRET` | secret de la notification (phase 2.3) | oui |
| `HERITAGE_VIDEO_HOSTING` | `enabled` | non |
| `HERITAGE_VIDEO_DEPLOY_ORIGINS` | `enabled` (recette sur déploiement non publié ; à retirer ensuite) | non |
| `NEXT_PUBLIC_SITE_URL` | inchangée (`https://hommages.netlify.app`) | non |

Puis Deploys → « Trigger deploy » → « Deploy site » : un build de `main`
**non publié** (verrou). Relever son adresse permanente
`https://<deploy-id>--hommages.netlify.app`.

Contrôles : le déploiement publié est toujours `6b03311…` ; dans le build,
aucune valeur ne figure dans le code envoyé au navigateur (garanti par
`lib/entitlement/server-only-boundary.test.ts` : seules les adresses déjà
signées et l'adresse d'envoi à usage unique quittent le serveur).

L'activation ne remplace jamais le contrôle des droits : chaque action
rejoue la session, lit l'offre en base et la base revérifie tout sous verrou.

## 4. GO-4 — Recette réelle sur le déploiement non publié (PO, guidée)

Fichiers de test synthétiques (aucune donnée personnelle) : une vidéo de
15 s en 720p, une vidéo de 11 min en 360p (doit être refusée).

1. Ouvrir l'adresse permanente (connexion Netlify de l'équipe requise).
2. « J'ai déjà un compte » : compte de test (e-mail + mot de passe).
3. Hommage de test en **offre complète**, obtenue par le mécanisme habituel
   (console d'administration → clé d'activation → `/activate`), jamais par
   une modification SQL.
4. A16 : ajouter la vidéo de 15 s → progression → « Vidéo reçue : mise en
   forme » → « Vidéo conservée avec votre hommage » (quelques minutes).
   Sans notification joignable (§ 2.3), l'écran laissé ouvert fait
   interroger Mux par le serveur dès qu'une étape reste sans nouvelle plus
   de 2 minutes (réconciliation ciblée) : compter jusqu'à 5 minutes.
5. Recharger la page : la vidéo est toujours conservée (« hébergée »).
6. « Voir l'aperçu » : la rubrique lit la vidéo hébergée.
7. Ajouter la vidéo de 11 min : refus « les 10 minutes au total seraient
   dépassées ».
8. Hommage de test **gratuit** : A16 reste en préparation locale, aucun envoi.
9. Publier l'hommage de test (code de vérification de l'adresse), puis
   ouvrir `/hommage/<slug>` sur l'adresse permanente : la vidéo est lue.
10. Remplacer la vidéo : la page publique garde l'ancienne jusqu'à la
    republication ; republier : la nouvelle apparaît.
11. Nettoyage : retirer les vidéos dans A16 (suppression des assets Mux) ;
    vérifier dans Mux → Assets que la liste est vide.

Limites de cette recette : la notification signée de Mux ne peut pas
atteindre un déploiement protégé par la connexion d'équipe ; sa vérification
réelle a lieu à la phase 5 (ou en levant temporairement la protection des
déploiements non publiés : décision PO). Les écritures vont dans le projet
Supabase B (hommage et compte de test identifiés), faute de projet isolé.

## 5. GO-5 — Publication en production (PO)

1. Deploys → déploiement validé à la phase 4 → « Publish deploy ».
2. Contrôles immédiats : page d'accueil, un hommage publié existant, A16
   d'un hommage de test ; Mux → Webhooks : livraisons en `200`.
3. Retirer `HERITAGE_VIDEO_DEPLOY_ORIGINS` (prochain build).
4. **Retour arrière** : Deploys → `6b03311…` → « Publish deploy », puis
   verrouiller. Pour couper la vidéo seule : retirer `HERITAGE_VIDEO_HOSTING`
   et redéployer (A16 revient à la préparation locale, la page publique
   n'affiche plus de vidéo ; les vidéos hébergées restent chez Mux et en base).

## 6. Recette sur appareils (PO, sans manipulation technique)

Sur l'adresse de l'hommage de test publié, pour chaque appareil :
iPhone (Safari), Android (Chrome), ordinateur (Chrome, Firefox, Edge).

| Geste | Attendu |
|---|---|
| Ouvrir la page, descendre jusqu'à « Des instants pour se souvenir » | la vidéo ne démarre pas seule |
| Toucher lecture | image et son ; pas d'autre vidéo qui s'enchaîne |
| Choisir l'autre souvenir | il démarre |
| Plein écran, puis tourner le téléphone | la vidéo garde ses proportions |
| Remonter la page pendant la lecture | la vidéo se met en pause |
| Couper le réseau 10 s pendant la lecture, puis le rétablir | reprise, ou message clair |
| Laisser l'onglet ouvert plus de 2 h, puis lire | « Recharger la vidéo » fonctionne |

Noter ✓ ou ✗ et faire une capture d'écran en cas de ✗.

## 7. GO-6 — Réconciliation planifiée (après la phase 5)

1. Netlify : `HERITAGE_VIDEO_RECONCILE=enabled` ; facultatif (recommandé) :
   `MUX_RECONCILE_TOKEN_ID` / `MUX_RECONCILE_TOKEN_SECRET` (jeton de basse
   priorité, phase 2.4 ; le rythme passe alors à 1 appel par 1,1 s).
2. Ajouter la fonction planifiée (modèle dans
   `docs/video-hosting-mise-en-service.md`, toutes les 30 min) par une PR
   dédiée, puis publier.
3. Contrôle : journaux de la fonction, événement `video_reconcile_finished`,
   0 appel Mux en régime normal ; suivi des anciennes versions gardées avec
   `memorial_video_superseded_stats_v1()`.
4. Retour arrière : retirer `HERITAGE_VIDEO_RECONCILE` (la fonction ne fait
   plus rien), ou retirer la fonction par une PR.
