# Contributions des proches — photos abandonnées et fichiers bruts (M8-E3)

Statut : analyse et proposition. **Rien n'est déclenché** : aucun nettoyage
automatique n'est activé en production, aucun environnement n'est modifié.

## 1. Le mécanisme existant

Le balayage des réservations abandonnées existe depuis la Mission 030 :
`sweepAbandonedUploads` (`lib/media/orphan-sweep.ts`), avec
`cleanupPendingMedia` (`lib/media/cleanup-pending-media.ts`).

À chaque passage, il :

1. lit au plus 100 médias `pending` créés il y a plus de **3 h**
   (`MEDIA_PENDING_TTL_MS`). Ce délai est volontairement plus long que la
   permission d'envoi de Supabase (2 h), pour qu'un envoi tardif ne puisse pas
   recréer un objet que plus rien ne référence ;
2. vérifie que le chemin est bien sous son hommage ;
3. pose une réclamation (`reserve_pending_media_cleanup_v1`) ;
4. supprime les octets (`removeByPrefix`) ;
5. clôt la réclamation (`finish_pending_media_cleanup_v1`), ce qui supprime la
   ligne.

Il ne voit jamais un média `ready`.

**Constat : aucune tâche ne l'appelle.** Ni route, ni fonction planifiée, ni
autre appel dans le dépôt. Cette dette existait avant M8 ; elle concerne
aussi les photos de la famille (Hero, Galerie).

## 2. Portée exacte pour les photos des proches

| Situation | Ce qui se passe aujourd'hui (E2/E3) | Avec le balayage raccordé |
|---|---|---|
| Fichier refusé à la finalisation (pas une image, corrompu, plus de 15 Mo, plus de 50 Mpx) | Octets **supprimés tout de suite**. La réclamation reste ouverte si la réservation a moins de 3 h | Ligne supprimée au premier passage après 3 h |
| Catégorie désactivée ou hommage fermé entre la réservation et la finalisation | Idem : octets supprimés tout de suite | Idem |
| Photo retirée par la famille | Message supprimé ; octets supprimés tout de suite ; réclamation close tout de suite si la réservation a plus de 3 h | Ligne supprimée au passage suivant |
| Réservation jamais envoyée, ou envoyée mais jamais finalisée (visiteur parti) | La ligne `pending` reste, avec les octets bruts s'ils ont été envoyés. Elle compte dans R3 pendant **1 h** seulement (`photo_reservation_window`), puis ne bloque plus personne | Octets et ligne supprimés au premier passage après 3 h |
| Hommage archivé avant le nettoyage | `reserve_pending_media_cleanup_v1` refuse pour un hommage archivé : rien n'est nettoyé | Même refus : dette à arbitrer (voir § 5) |

La compatibilité est vérifiée par les tests :

- le balayage reprend une réclamation ouverte par E2 (`remove_contribution_v1`
  ou le refus d'un fichier) : `reserve_pending_media_cleanup_v1` rend la
  réclamation existante pour le même propriétaire ;
- `finish_pending_media_cleanup_v1` supprime le média, qui n'est plus
  référencé par aucun message.

## 3. Le fichier brut d'un visiteur : durée de présence et protections

**Durée de présence :**

- **Envoi puis finalisation normale.** Le fichier brut existe de la fin de
  l'envoi jusqu'à la finalisation, soit quelques secondes. Le serveur le
  remplace au même chemin par la version nettoyée (Sharp, WebP, sans
  métadonnée) **avant** que le média passe `ready`. Cet ordre est vérifié
  par un test.
- **Fichier refusé.** Il est supprimé dans la même requête.
- **Visiteur parti entre l'envoi et la finalisation.** Le brut reste stocké :
  - **sans limite** tant que le balayage n'est pas raccordé ;
  - au plus **3 h + l'intervalle du balayage** une fois raccordé.

**Pourquoi il ne peut jamais être lu**, ni par la famille ni par le public :

1. Le bucket `memorial-media` est **privé**. Aucune URL publique n'existe ;
   seules des URL signées de 5 min sont émises.
2. Une URL signée n'est émise que pour un média **`ready`**, donc déjà traité :
   - `read_public_contributions_v1` ne rend que les photos `ready` des
     catégories en vigueur ;
   - la liste familiale (`listFamilyContributions`) ne signe qu'un média
     `ready`, de nature `contribution`, sous l'hommage ;
   - `read_public_memorial_v1` ne rend jamais un média `contribution`.
3. Aucun message ne référence un média `pending` : le message photo n'est
   créé qu'à la finalisation réussie.
4. La permission d'envoi remise au visiteur n'autorise qu'**une écriture**,
   sur **un chemin**, sans écrasement et sans lecture.

## 4. Raccordement proposé (à autoriser par le QG)

Le mécanisme existant, sans second moteur :

- une **fonction planifiée Netlify** (par exemple
  `netlify/functions/media-sweep.mts`, `schedule: "@hourly"`), qui appelle
  `sweepAbandonedUploads(createServerMediaEngineDeps(), { limit: 100 })` et
  ne journalise que des nombres (`examined`, `reclaimed`) ;
- **aucune nouvelle variable d'environnement** : elle utilise la clé
  service_role déjà présente côté serveur ;
- **moment recommandé :** avec l'application des migrations M8 (E6), et
  avant l'ouverture réelle des dépôts de photos.

Ce raccordement **n'est pas réalisé dans E3**. Une fonction planifiée
s'exécute dès son déploiement, ce qui serait un nettoyage automatique en
production. Il demande un **GO QG** distinct (opération de production) ;
ce n'est pas un changement d'environnement.

### Préparé en M8-E3 (suite), toujours inactif

- `lib/media/scheduled-media-sweep.ts` porte la logique de la tâche (`runScheduledMediaSweep`), testée. Trois modes :
  - **`off`** (défaut) : rien n'est lu ;
  - **`dry-run`** : compte les réservations expirées, sans rien supprimer ;
  - **`apply`** : lance le balayage existant.
- Deux barrières indépendantes :
  1. **aucune** fonction planifiée n'existe dans `netlify/functions/`, et un test le vérifie ;
  2. même déployée, la tâche ne supprime rien sans `HERITAGE_MEDIA_SWEEP_MODE=apply`.

Gabarit à ajouter **seulement au GO QG** (`netlify/functions/media-sweep.mts`) :

```ts
import type { Config } from "@netlify/functions";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { formatMediaSweepReport, readMediaSweepMode, runScheduledMediaSweep } from "@/lib/media/scheduled-media-sweep";

export default async () => {
  const report = await runScheduledMediaSweep(createServerMediaEngineDeps(), { mode: readMediaSweepMode(), limit: 100 });
  console.log(formatMediaSweepReport(report));
};

export const config: Config = { schedule: "@hourly" };
```

Mise en service recommandée :

1. déployer la fonction avec `HERITAGE_MEDIA_SWEEP_MODE=dry-run` pendant 24 h, puis lire les comptages ;
2. passer à `apply` sur décision du QG.

Il faudra vérifier au moment du GO :

- la résolution de l'alias `@/` par l'empaquetage des fonctions Netlify ;
- la présence de `@netlify/functions`, qui ne sert qu'aux types.

## 5. Points réservés au QG

- **GO du raccordement du balayage (§ 4).** Recommandé avant l'ouverture
  des photos des proches, car c'est la seule limite de durée d'un fichier
  brut abandonné.
- **Hommage archivé :** décider si un média `pending` d'un hommage archivé
  doit être nettoyé. Cela demanderait une nouvelle migration qui assouplisse
  ce seul cas dans `reserve_pending_media_cleanup_v1`.
- **Surveillance :** suivre le nombre de médias `pending` de plus de 3 h,
  qui doit tendre vers zéro une fois le balayage actif.
