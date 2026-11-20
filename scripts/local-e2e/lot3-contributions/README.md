# Lot 3 — essai fonctionnel sur un Supabase LOCAL (isolé)

Kit de reproduction de la recette locale du Lot 3 (modération familiale des
Contributions). **Jamais contre un projet Supabase réel** : chaque script refuse
de s'exécuter si l'URL n'est pas `http://127.0.0.1:…`.

## Pile locale

1. Docker, puis la CLI Supabase (`npx supabase@2`) dans un dossier de travail
   hors du dépôt : `supabase init`, copier `supabase/migrations/` du dépôt,
   `site_url = "http://localhost:3100"`, `additional_redirect_urls =
   ["http://localhost:3100/**"]`, `[auth.rate_limit] email_sent` relevé.
2. `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta`
   (les 48 migrations du dépôt s'appliquent telles quelles).
3. `supabase status -o env` → `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DB_URL`
   (clés de démonstration de la CLI, locales).
4. `.env.local` du dépôt (ignoré par git) : `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL=http://localhost:3100`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CONTRIBUTIONS_FORM_TOKEN_SECRET` (aléatoire).

## Données

- `seed-db.sh <fichier env>` : deux familles (comptes Auth locaux), deux hommages
  publiés Intemporel « complet », les trois catégories ouvertes, un message
  historique `memory_message`. La preuve d'e-mail QG 004-B des deux comptes de
  test est insérée directement, comme le fait le harnais SQL.
- `seed-deposits.ts` : dépôts par le **moteur visiteur réel**
  (`lib/memorial/contributions/visitor-contributions.ts`) : jetons anti-robots,
  RPC `service_role`, envoi signé vers Storage avec la clé publique, traitement
  Sharp. Exécution : `tsx` avec `NODE_PATH` vers `node_modules` du dépôt et un
  module `server-only` vide (marqueur résolu par Next.js seulement).
- Mot de passe des deux comptes : posé par l'API admin Auth locale, passé aux
  scripts par la variable `LOT3_PW` (jamais écrit dans le dépôt).

## Scénarios

- `e2e-2.js` : connexion réelle, pagination (horodatages identiques),
  approuver, refuser, masquer, réafficher, suppression avec confirmation (et
  octets Storage), renouvellement d'URL photo, concurrence entre onglets,
  catégories et `stale_revision`, sécurité (page d'une autre famille, action
  rejouée avec l'id d'une autre famille, sans session), compteur du tableau de
  bord. Chaque étape est vérifiée dans la base.
- `e2e-shots.js <dossier>` : captures 320 / 375 / 390 / 430 / 1440, FR / EN /
  ES, débordement horizontal, cibles tactiles, navigation clavier.

Variables : `DB_URL`, `MA`, `MB` (sorties de `seed-db.sh`), `LOT3_PW`.
