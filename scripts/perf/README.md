# Banc de mesure local du Builder (Mission 04-G / L1.4)

Mesure, **en local et sans aucun service réel**, ce que coûte chaque action
du Builder authentifié et de l'espace familial :

- le nombre d'appels à Supabase ;
- leur **profondeur séquentielle** (la plus longue chaîne d'appels qui
  attendent chacun le précédent) ;
- la durée vue par le navigateur, à **0, 100 et 300 ms** de latence
  simulée par appel.

Il sert à comparer un code **avant / après** une optimisation, de façon
reproductible.

## Ce que le banc est — et n'est pas

- Le **vrai** build de production de l'application tourne en local
  (`next build` + `next start`), avec la vraie session Supabase SSR, le
  vrai proxy, les vraies pages et Server Actions.
- Supabase est remplacé par **un faux Supabase local**
  (`supabase-stub.mjs`) qui répond avec des données de test fixes et
  journalise chaque appel. Clés factices, aucune donnée réelle, aucun
  appel sortant.
- Le parcours est joué dans **Chromium** (Playwright) comme une famille :
  chargement, Continuer, Revoir, Reprendre, saisie puis Continuer,
  espace familial.

**Ce ne sont pas des mesures de production.** Le faux Supabase ne
reproduit ni le temps de traitement réel de Supabase, ni la distance
réseau, ni les démarrages à froid Netlify. La latence simulée est un
paramètre : à 300 ms par appel, le banc reproduit les durées mesurées en
production en novembre 2026 (Mission 04-E) ; c'est une hypothèse de
travail, pas une mesure. Un gain obtenu ici est un gain **sur faux
Supabase** tant qu'il n'a pas été confirmé par les journaux Netlify.

L'instrumentation de **production** n'est pas concernée : ce banc
n'ajoute aucun code à l'application.

## Prérequis

- Node.js et `npm ci` déjà faits dans le dépôt.
- Playwright et Chromium disponibles pour Node (`require("playwright")`).
  Ils ne sont pas des dépendances du projet ; par exemple, dans un dossier
  à part : `npm i playwright && npx playwright install chromium`, puis
  lancer le banc avec `NODE_PATH` pointant vers ce `node_modules`.
- Ports libres : 54399 (faux Supabase) et 3100 (application) — réglables
  avec `PERF_STUB_PORT` et `PERF_APP_PORT`.

## Utilisation

```bash
scripts/perf/bench.sh avant
```

```bash
git switch ma-branche-optimisee
scripts/perf/bench.sh apres
```

```bash
node scripts/perf/compare.mjs avant apres
```

- `bench.sh <libellé>` écrit le brouillon de test depuis les fixtures
  des tests unitaires, construit l'application **branchée sur le faux
  Supabase**, puis joue le parcours à 0, 100 et 300 ms. Résultats dans
  `scripts/perf/.out/<libellé>/` (jamais versionné) : SHA mesuré,
  journaux d'appels, tableaux `summary-<latence>.md`.
- `--no-build` réutilise le build précédent (même SHA uniquement).
- `PERF_LATENCIES="0 100"` limite les latences jouées.

⚠️ Après le banc, `.next` est construit pour le faux Supabase : relancer
`npm run build` avant tout autre usage local.

## Lire les résultats

- **Appels Supabase** : tous les appels faits pendant l'action, proxy
  compris (y compris les écritures).
- **Profondeur séquentielle** : significative à 100 et 300 ms seulement
  (à 0 ms, tout s'enchaîne instantanément). C'est elle qui fait la durée :
  durée ≈ coût local + profondeur × latence par appel.
- **Durée navigateur** : du clic à l'affichage effectif de la destination.

Référence (SHA `10b4475`, faux Supabase, 300 ms par appel) :

| Action | Appels | Profondeur | Durée |
|---|---|---|---|
| Chargement /builder | 9 | 8 | ≈ 2,5 s |
| Continuer | 16 | 14 | ≈ 4,3 s |
| Revoir / Reprendre | 9 | 8 | ≈ 2,5 s |
| Saisie puis Continuer | 23 | 20 | ≈ 6,2 s |
| Espace familial /owner | 14 | 10 | ≈ 3,1 s |

## Fichiers

- `supabase-stub.mjs` — faux Supabase journalisant.
- `scenarios.mjs` — parcours famille dans Chromium.
- `analyze.mjs` (+ `analyze.test.mjs`) — appels, profondeur, durées.
- `compare.mjs` — tableau avant / après.
- `fixture.perf.ts`, `vitest.perf.config.mts` — brouillon de test issu
  des fixtures (`npm test` ne les exécute jamais).
- `bench-constants.mjs` — identifiants de test, ports, cookie de session
  factice.
