<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HERITAGE — règles repo pour les agents

Ces règles sont propres au projet HERITAGE. Elles s'ajoutent au bloc Next.js
ci-dessus, qui est régénéré automatiquement par `next dev` — ne rien écrire à
l'intérieur de ses marqueurs `BEGIN`/`END`.

## Branche de référence

La branche produit est **`main`**. Toujours partir de `origin/main` :

```bash
git fetch origin main
git checkout -B <ma-branche> origin/main
git rev-parse HEAD     # vérifier le SHA obtenu AVANT d'écrire la moindre ligne
```

Ne jamais supposer que la branche par défaut du dépôt est `main` sans l'avoir
vérifiée. Un audit de gouvernance a constaté une session ouverte 140 commits
derrière `main` pour cette raison exacte.

## Validation obligatoire avant tout commit

```bash
npm ci
npm run lint
npm test
npx next typegen     # OBLIGATOIRE : génère .next/types (LayoutProps, PageProps…)
npx tsc --noEmit     # échoue sans l'étape précédente
npm run build
```

Les six doivent sortir en `exit 0`. Aucun commit avec un rouge.

`npx next typegen` n'est pas optionnel : `tsconfig.json` inclut
`.next/types/**/*.ts`, un répertoire gitignoré que Next.js 16 génère. Sans lui,
`tsc --noEmit` échoue sur `app/layout.tsx` avec `TS2304: Cannot find name
'LayoutProps'`. La CI applique la même séquence.

Ne jamais présenter comme vérifié un résultat qui n'a pas été réellement exécuté.

## Zones protégées

- **`public/assets/**` et `assets/**`** — rendus Studio, **non régénérables**.
  Remplacer un asset = remplacer ce fichier précis, nommément. Jamais de
  suppression par glob ou par répertoire.
  La CI fait échouer toute PR qui supprime un asset, sauf label
  `allow-asset-deletion` posé explicitement.
- **`supabase/migrations/**`** — append-only. Jamais d'édition ni de suppression
  d'une migration existante : une correction est une **nouvelle** migration.
- **`supabase/checks/**`** — preuves d'audit. Lecture seule.

## Git — interdits

- `git push --force`, `--force-with-lease`, `-f` : **jamais**, sur aucune branche.
- `git reset --hard`, `git clean -fdx` : jamais sans accord QG explicite.
- Suppression de branche ou de tag distant : jamais sans accord QG explicite.
- Merge direct sur `main` : passer par une PR.

## Supabase / Netlify

Aucune migration appliquée, aucun SQL exécuté, aucun déploiement déclenché sans
une mission QG qui le demande explicitement et nommément.

## Secrets

Aucune valeur réelle dans le dépôt. `.env.example` ne contient que des **noms**
de variables. Le dépôt est actuellement public : le traiter comme tel.

## Portée de ces garde-fous

`.claude/settings.json` traduit une partie de ces règles en règles de permission
Claude Code (`deny` / `ask`). C'est une **ceinture de sécurité, pas une
frontière étanche** : la documentation Claude Code est explicite, une règle
`Bash(rm -rf *)` ne couvre ni `/bin/rm -rf …`, ni `bash -c 'rm -rf …'`, ni
`find … -delete`. La vraie barrière contre la perte d'assets est le job CI
`assets-guard`, qui s'exécute côté GitHub et ne peut pas être contourné depuis
une session d'agent.
