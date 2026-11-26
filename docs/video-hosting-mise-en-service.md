# VID-07 à VID-09 — Hébergement vidéo premium (Mux) : mise en service

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
| Remplacement d'une vidéo publiée sans trou public (VID-09) | `supabase/migrations/20261126090000_vid09_published_replacement.sql`, `releaseSuperseded` | écrite, testée sur PostgreSQL jetable, **non appliquée** |

## Ordre de mise en service

> VID-10 : procédure détaillée par phases (liens, contrôles, recette,
> retour arrière) dans `docs/video-mise-en-service-vid10.md`.

1. **Appliquer les migrations** sur le projet Supabase réel, dans l'ordre
   (`20261125090000_vid07_memorial_videos.sql`,
   `20261125100000_vid08_video_publication_reconcile.sql`, puis
   `20261126090000_vid09_published_replacement.sql`), après revue SQL.
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

Audit VID-09 : les mécanismes VID-08 sont suffisants et n'ont pas été
réécrits. Seule addition : avant les lots, chaque exécution libère les
anciennes versions devenues inutiles après une republication (une requête
SQL ; une suppression Mux par version libérée).

Limites vérifiées (documentation des fournisseurs, novembre 2026 ; à
reconfirmer au GO) :
- Netlify : une fonction planifiée s'arrête à **30 s** (non configurable),
  sur tous les plans ; le budget de 20 s s'y tient. Plan gratuit :
  125 000 invocations de fonctions par mois, et le site est **suspendu**
  jusqu'à la fin du mois en cas de dépassement.
- Mux (API Video, seaux par environnement) : jeton haute priorité,
  requêtes non-POST 100 en rafale puis 5 par seconde, POST 20 puis 1 par
  seconde ; jeton basse priorité, non-POST 20 puis 1 par seconde. Réponse
  429 au-delà. La réconciliation n'émet que des GET et des DELETE.

Appels Mux par exécution : 0 quand tout va bien (cas normal : les
notifications arrivent) ; sinon au plus un appel par ligne examinée (GET
upload ou asset, ou DELETE asset), 80 au plus en 20 s au rythme de 250 ms.
Avec le jeton du serveur (haute priorité), ce rythme (4/s) reste sous la
recharge de 5/s : le seau ne se vide jamais. **Recommandation** : un jeton
dédié basse priorité pour la réconciliation, afin qu'elle ne puisse jamais
gêner les familles ; régler alors `muxIntervalMs` à 1 100 ms (au plus
18 lignes par exécution, le reste à la suivante).

Fréquence recommandée : **toutes les 30 minutes**. Justification : les
notifications Mux sont la voie normale ; la réconciliation ciblée rattrape
déjà, à l'ouverture de A16, les vidéos de la famille qui travaille ; la
globale ne sert qu'aux notifications perdues et aux suppressions en attente,
qui n'ont pas d'urgence au-delà de quelques dizaines de minutes. Plus
fréquent n'apporte rien de visible ; plus rare (2 h) reste acceptable si le
quota de fonctions devient contraint.

Coût estimé (à confirmer sur les grilles en vigueur au moment du GO) :
- Netlify : 48 exécutions par jour, soit environ 1 440 par mois (≈ 1,2 % du
  quota gratuit de 125 000), en général de moins d'une seconde ;
- Mux : les appels de gestion ne sont pas facturés en tant que tels ;
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
- **D4, remplacement après publication — décidée (VID-09)** : l'ancienne
  version reste visible jusqu'à la republication effective ; la nouvelle est
  envoyée, traitée et prévisualisable, puis publique après republication.
  L'ancienne est ensuite libérée (réconciliation globale, ou ouverture de
  A16) et supprimée chez Mux. Un retrait explicite par la famille reste
  immédiat (comportement VID-07).
- **D5, langues — décidée (VID-09)** : FR, EN et ES, selon la convention du
  Builder.
- **D6, durée de conservation d'une ancienne version** (en attente) : tant
  que la famille ne republie pas, l'ancienne version reste servie, donc
  conservée (au plus 3 anciennes versions par hommage, 10 minutes au total ;
  stockage Mux « basic » ≈ 0,003 $ par minute et par mois en 1080p, avec un
  mois minimum facturé par asset : au plus ≈ 0,03 $ par hommage et par mois).
  Aucune suppression automatique n'est faite : retirer l'ancienne version
  ferait perdre le souvenir au public, publier la nouvelle sans la famille
  contredirait la décision D4. Suivi : `memorial_video_superseded_stats_v1()`
  (nombre et ancienneté, sans donnée personnelle). Options à décider :
  rappel à la famille après N jours, ou durée maximale au-delà de laquelle
  la PO choisit entre retrait et publication.

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

Ordre des retours arrière (sur GO seulement) : VID-09, puis VID-08, puis
VID-07 (`supabase/rollbacks/20261126090000…`, `20261125100000…`,
`20261125090000…`). Le retour arrière VID-09 fait passer les anciennes
versions encore gardées en suppression demandée.
