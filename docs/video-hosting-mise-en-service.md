# VID-07 — Hébergement vidéo premium (Mux) : mise en service

**État : préparé, NON activé.** Rien de ce document n'a été exécuté. Chaque
étape ci-dessous attend une autorisation PO/QG **explicite et nominative**.
Tant que l'étape 6 n'est pas faite, le formulaire A16 reste exactement celui
de VID-06 (préparation locale, aucun envoi) : le code est inerte.

## Ce qui est livré dans le dépôt

| Élément | Emplacement | État |
| --- | --- | --- |
| Table `memorial_videos`, journal `memorial_video_events`, RPC `service_role` | `supabase/migrations/20261125090000_vid07_memorial_videos.sql` | écrite, testée sur PostgreSQL jetable, **non appliquée** |
| Retour arrière | `supabase/rollbacks/20261125090000_vid07_memorial_videos.down.sql` | testé localement |
| Actions serveur du Builder (session rejouée, offre lue côté serveur) | `app/builder/[memorialId]/video-actions.ts` | inertes sans configuration |
| Point de notification signé | `app/api/mux/webhook/route.ts` | répond 503 sans configuration |
| Client Mux, signature, lecture signée 720p, réconciliation | `lib/memorial/video/hosting/` | testés contre des doubles, **jamais contre Mux** |
| Envoi direct navigateur → Mux, reprenable | `lib/memorial/video/hosting/direct-upload.ts`, `video-transfers.ts` | testés contre un faux point d'envoi |
| États dans A16 (transfert, progression, traitement, disponibilité, erreur, reprise) | `components/builder/VideoStep.tsx`, `useVideoHosting.ts` | testés avec doubles |
| Lecture publique (après publication premium) | `lib/memorial/video/hosting/public-video-playback.ts` | préparée, **non branchée** à la page publique |

## Ordre de mise en service

1. **Appliquer la migration** sur le projet Supabase réel
   (`20261125090000_vid07_memorial_videos.sql`), après revue SQL.
   Vérification : `select to_regclass('public.memorial_videos')` non nul ;
   les RPC ne sont exécutables que par `service_role`.
2. **Créer un jeton d'API Mux** (environnement Mux dédié à HERITAGE,
   permissions *Mux Video* lecture + écriture ; aucune autre).
3. **Créer une clé de lecture signée** (Mux → Settings → Signing Keys).
   Garder la clé privée hors de toute capture, de tout ticket et de GitHub.
4. **Créer la notification (webhook)** vers
   `https://<domaine>/api/mux/webhook`, pour les événements :
   `video.upload.asset_created`, `video.upload.cancelled`,
   `video.upload.errored`, `video.asset.ready`, `video.asset.errored`,
   `video.asset.deleted`. Noter son secret de signature.
5. **Renseigner les secrets dans Netlify** (contexte voulu seulement ; jamais
   dans le dépôt) : `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`,
   `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE` (PEM encodé en base64),
   et vérifier `NEXT_PUBLIC_SITE_URL` (seule origine autorisée à envoyer).
   `SUPABASE_SERVICE_ROLE_KEY` doit déjà être présent.
6. **Activer** : `HERITAGE_VIDEO_HOSTING=enabled`, puis redéployer.
7. **Recette réelle** (une famille test, offre complète, hommage non publié) :
   - une vidéo courte de téléphone : progression, « mise en forme », puis
     « Vidéo conservée avec votre hommage » ;
   - coupure réseau pendant l'envoi, puis reprise ;
   - annulation ; remplacement ; retrait (l'asset disparaît chez Mux) ;
   - dépassement mesuré (vidéo annoncée plus courte qu'en réalité) : refus
     expliqué, asset supprimé chez Mux, vidéo toujours visible avec sa raison ;
   - lecture de l'aperçu sur iPhone (HLS natif) et sur Chrome Android/ordinateur
     (voir décision D1).
8. **Réconciliation planifiée** (facultative, décision D2) : la réconciliation
   ciblée s'exécute déjà à chaque ouverture de A16 ; une tâche globale
   (`service.reconcile`) n'est pas planifiée — aucune fonction Netlify n'est
   créée sans GO.

## Décisions PO en attente

- **D1 — lecture hors Safari.** Sans HLS natif (Chrome, Firefox, Android),
  l'aperçu d'une vidéo hébergée ne se lit que si un MP4 720p existe :
  soit `HERITAGE_VIDEO_MP4_FALLBACK=enabled` (stockage Mux supplémentaire),
  soit l'ajout de la bibliothèque `hls.js` (dépendance et `package-lock.json`
  partagés : coordination Chef 06). Tant que la décision n'est pas prise,
  l'aperçu local (fichier encore sur l'appareil) fonctionne partout.
- **D2 — réconciliation globale planifiée** (fonction programmée Netlify).
- **D3 — rubrique publique** : branchement de `readPublicMemorialVideos` à
  la page publique, avec l'ordre des rubriques (décision QG).

## Garanties vérifiées localement

- Aucun secret côté navigateur ; aucune valeur dans le dépôt
  (`server-only-boundary.test.ts`).
- 3 vidéos, 600 s cumulées, durée inconnue jamais comptée zéro : revérifié
  sous verrou en base, puis sur la durée **mesurée** par Mux à l'arrivée.
- Notifications : signature HMAC vérifiée (tolérance 5 min), idempotentes,
  ordre indifférent, jamais de retour en arrière d'état.
- Lecture : signée, plafonnée à 720p, courte durée ; publique seulement pour
  un hommage publié en offre complète, vidéo présente dans la copie publiée.

## Retour arrière

`HERITAGE_VIDEO_HOSTING` retiré → A16 revient à la préparation locale
immédiatement (les vidéos déjà hébergées restent chez Mux et en base).
Retrait complet : supprimer les assets Mux restants, puis appliquer le
fichier `supabase/rollbacks/…down.sql` (sur GO uniquement).
