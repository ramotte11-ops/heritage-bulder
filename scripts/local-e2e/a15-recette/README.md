# A15-R — recette des Contributions sur un Supabase LOCAL (isolé)

Kit de la branche de recette `recette/a15-contributions` (jamais fusionnée).
**Jamais contre un projet Supabase réel** : `seed.sh` et `e2e.js` refusent toute
URL qui n'est pas `127.0.0.1`.

## Pile locale

1. Docker, puis la CLI Supabase dans un dossier hors du dépôt :
   `npx supabase@2 init`, copier `supabase/migrations/` du dépôt,
   `site_url = "http://localhost:3100"`, `additional_redirect_urls = ["http://localhost:3100/**"]`.
2. Images Docker Hub (le registre ghcr.io peut être refusé par le proxy) :
   `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase@2 start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,mailpit`
3. `sb.env` (hors dépôt) : `API_URL`, `DB_URL`, `SERVICE_ROLE_KEY`, `ANON_KEY` (clés de
   démonstration de la CLI, locales).
4. `.env.local` du dépôt (ignoré par git) : `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_SITE_URL=http://localhost:3100`, `CONTRIBUTIONS_FORM_TOKEN_SECRET`
   (aléatoire, `openssl rand -base64 48`),
   `CONTRIBUTIONS_RECETTE_SLUGS=a1b2c3d4e5f6,b6e5d4c3b2a1`.
5. `npm run build && npx next start -p 3100`.

## Données et parcours

- `LOT3_PW=<mot de passe> bash seed.sh <sb.env> <dossier de travail>` :
  - deux familles : A, offre complète `a1b2c3d4e5f6` ; B, offre gratuite `b6e5d4c3b2a1` ;
  - les deux hommages sont nommés « TEST RECETTE A15 » ;
  - un troisième hommage, `c0ffee000001`, **hors liste** de recette ;
  - photos de synthèse : Hero de chaque hommage, et photo « visiteur » de 12 Mpx avec un EXIF GPS fictif.
- `REPO=… DB_URL=… API_URL=… SERVICE_ROLE_KEY=… LOT3_PW=… PHOTO=<travail>/photo-fictive-gps.jpg node e2e.js` :
  - **visiteur** non connecté, par la vraie page publique et la vraie lettre : condoléance, récit et photo ;
  - **famille** : écrans réels de modération ;
  - chaque étape est vérifiée en base et dans le bucket ;
  - les 6 points de l'ordre A15-R, sur les deux offres, plus la barrière de la liste de recette.
- Après le parcours : `supabase/verifications/a15r_recette_etat.sql`, puis `a15r_recette_purge.sql`,
  puis à nouveau l'état. Résultat attendu : aucune contribution, aucun média de proche,
  retour arrière R2 de nouveau possible, hommages archivés.
