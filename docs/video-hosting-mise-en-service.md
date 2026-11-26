# VID-07 / VID-08 — Hébergement vidéo premium (Mux) : mise en service

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
| Lecture publique (après publication premium) | `lib/memorial/video/hosting/public-video-playback.ts`, `app/hommage/[slug]/page.tsx` | **VID-08 : branchée**, inerte sans configuration |
| Règle « version prête au moment de la publication », réservations de réconciliation | `supabase/migrations/20261125100000_vid08_video_publication_reconcile.sql` | écrite, testée sur PostgreSQL jetable, **non appliquée** |
| Lecture HLS universelle (Safari natif, hls.js ailleurs) | `components/memorial/video/use-stream-playback.ts` | testée avec un double de hls.js, **pas sur navigateurs réels** |
| Rubrique dans l'aperçu et sur la page publique | `components/memorial/video/VideoHommageV1Section.tsx`, `video-preview-host.tsx` | ordre PO : Offrandes → Contributions → Vidéo |
| Réconciliation globale | `lib/memorial/video/hosting/global-reconcile.ts`, `scheduledVideoReconcile` | préparée, **non planifiée** |

## Ordre de mise en service

1. **Appliquer les migrations** sur le projet Supabase réel, dans l'ordre
   (`20261125090000_vid07_memorial_videos.sql` puis
   `20261125100000_vid08_video_publication_reconcile.sql`), après revue SQL.
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
   - lecture sur iPhone et Mac Safari (HLS natif), Chrome ordinateur et
     Android, Firefox et Edge (hls.js) : non exécutée à ce jour ;
   - publication en offre complète, puis lecture sur la page publique ;
     vérifier qu'une vidéo ajoutée après la publication n'y apparaît pas
     avant la publication suivante.
8. **Réconciliation globale planifiée** (VID-08, sur GO) : voir ci-dessous.

## Réconciliation globale (VID-08) : préparée, non planifiée

Rôle : rattraper les notifications Mux perdues (vidéo restée « en mise en
forme »), les envois abandonnés, et les suppressions d'assets restées en
attente (vidéo retirée, remplacée ou refusée). La réconciliation ciblée de
VID-07 continue de s'exécuter à chaque ouverture de A16.

Fonctionnement (`runGlobalVideoReconcile`) :
- réservation d'un lot en base (`claim_memorial_videos_for_reconcile_v1`,
  `for update skip locked`, réservation de 10 min) : deux exécutions
  simultanées ne traitent jamais la même ligne ; une exécution interrompue
  libère ses lignes à l'expiration de la réservation ;
- seules les lignes sans nouvelle depuis 15 min sont examinées ;
- une ligne sans changement chez Mux, ou en erreur temporaire, est différée
  de 2, 4, 8… minutes (plafond 6 h) ;
- 25 lignes par lot, 8 lots au plus, 20 s au plus par exécution, un appel
  Mux au plus toutes les 250 ms ; une réponse 429 arrête l'exécution ;
- journal : compteurs et codes d'erreur uniquement.

Fréquence recommandée : **toutes les 30 minutes**. Les notifications
fonctionnant normalement, presque toutes les exécutions ne trouvent aucune
ligne : une requête SQL, aucun appel Mux.

Coût estimé (à confirmer sur les grilles en vigueur au moment du GO) :
- Netlify : 48 exécutions par jour, soit environ 1 440 par mois, de moins de
  20 s chacune, en général de moins d'une seconde ;
- Mux : les appels de l'API de gestion ne sont pas facturés en tant que tels
  (la facturation porte sur l'encodage, le stockage et la diffusion), mais
  ils sont soumis à des limites de débit ; au plus 200 lignes examinées par
  exécution ;
- Supabase : une à quelques requêtes par exécution.

Nettoyage des assets orphelins (`sweepOrphanVideoAssets`) : option distincte,
**comptage seul par défaut**, à lancer à la main ou une fois par semaine
(chaque page de 100 assets coûte un appel Mux). Jamais un asset de moins de
24 h. Suppose un environnement Mux **dédié** à HERITAGE.

Modèle de fonction planifiée, à créer seulement sur GO
(`netlify/functions/video-reconcile.mts`, non présent dans le dépôt) :

```ts
import type { Config } from "@netlify/functions";
import { scheduledVideoReconcile } from "../../lib/memorial/video/hosting/hosting-runtime";

export default async () => {
  await scheduledVideoReconcile();
};

export const config: Config = { schedule: "*/30 * * * *" };
```

Activation : `HERITAGE_VIDEO_RECONCILE=enabled` en plus de la configuration
d'hébergement ; sans elle, la fonction ne fait rien.

## Décisions PO

- **D1, lecture hors Safari — décidée (VID-08)** : hls.js 1.7.4 (Apache-2.0),
  chargé à la demande. `HERITAGE_VIDEO_MP4_FALLBACK` reste non défini (aucun
  MP4 payant).
- **D2, réconciliation globale** — préparée ; cadence à valider au GO.
- **D3, rubrique publique — décidée (VID-08)** : Offrandes → Contributions
  des proches → Vidéo hommage → pied de page.
- **D4, remplacement après publication** (en attente) : une vidéo remplacée
  après publication disparaît de la page publique dès que la nouvelle
  version est prête, et la nouvelle n'apparaît qu'à la publication
  suivante. Alternative possible : garder l'ancienne version jusqu'à la
  republication (coût : deux assets stockés pendant ce temps).
- **D5, langues** (en attente) : la rubrique n'est assemblée qu'en français
  tant que les traductions EN/ES ne sont pas validées.

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
