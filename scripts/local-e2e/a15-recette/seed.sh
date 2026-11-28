#!/usr/bin/env bash
# A15-R — LOCAL Supabase only. Trois hommages FICTIFS publiés, sur deux familles :
#   a1b2c3d4e5f6  « TEST RECETTE A15 — Complet »  famille A, offre complète
#   b6e5d4c3b2a1  « TEST RECETTE A15 — Gratuit »  famille B, offre gratuite (avis)
#   c0ffee000001  hors liste de recette (doit rester fermé)
# Usage : seed.sh <sb.env> <dossier de travail>   (sb.env : API_URL, DB_URL, SERVICE_ROLE_KEY)
set -euo pipefail
. "$1"; WORK="$2"; mkdir -p "$WORK"
case "$API_URL" in http://127.0.0.1:*) ;; *) echo "refusing: not local"; exit 1;; esac
case "$DB_URL" in *@127.0.0.1:*) ;; *) echo "refusing: not local"; exit 1;; esac
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DB="psql $DB_URL -v ON_ERROR_STOP=1 -X -q -t -A"

# Familles A et B (comptes Auth locaux + preuve d'adresse QG 004-B, comme le kit Lot 3).
bash "$REPO/scripts/local-e2e/lot3-contributions/seed-db.sh" "$1" > "$WORK/lot3-seed.txt"
$DB -c "update entitlements set access_level = 'avis' where id = (select entitlement_id from memorials where slug = 'b6e5d4c3b2a1');
        update memorials set access_level = 'avis', free_corrections_until = first_published_at + interval '3 days',
               free_public_until = first_published_at + interval '45 days', free_private_until = first_published_at + interval '75 days'
         where slug = 'b6e5d4c3b2a1';"
OA=$($DB -c "select id from owners where email = 'famille.martin@example.test'")
ENT=$($DB -c "insert into entitlements (access_level, source, offer_id) values ('complet','direct','intemporel') returning id;")
$DB -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status, first_published_at)
        values ('$OA','$ENT','person','announcement','intemporel','light','fr','c0ffee000001','published', now() - interval '2 days');" >/dev/null

# Contenu publiable : la fixture d'assemblage du dépôt (Hero complet), A15 traitée, trois catégories ouvertes.
STUB="$WORK/stub/node_modules/server-only"; mkdir -p "$STUB"; echo "" > "$STUB/index.js"; echo '{"name":"server-only","main":"index.js"}' > "$STUB/package.json"
printf 'import { fullAnnouncementWithTraditions } from "@/lib/memorial/assembly/test-fixtures";\nconsole.log(JSON.stringify(fullAnnouncementWithTraditions()));\n' > "$REPO/.a15r-fixture.tmp.ts"
(cd "$REPO" && NODE_PATH="$WORK/stub/node_modules" npx -y tsx ./.a15r-fixture.tmp.ts > "$WORK/fixture.json"); rm -f "$REPO/.a15r-fixture.tmp.ts"

# Photos de synthèse : Hero de chaque hommage, et la photo « visiteur » (12 Mpx, EXIF avec GPS fictif).
(cd "$REPO" && node -e '
const sharp = require("sharp"); const w = process.argv[1];
const svg = (W, H, c, t) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${c}"/><circle cx="${W/2}" cy="${H/2}" r="${H/3}" fill="#fff" fill-opacity="0.35"/><text x="${W/2}" y="${H*0.9}" font-size="${H/20}" text-anchor="middle" fill="#fff">${t}</text></svg>`);
(async () => {
  for (const [n, c] of [["hero-a", "#8a7f72"], ["hero-b", "#6f7f8a"], ["hero-c", "#7f8a6f"]]) await sharp(svg(1200, 1500, c, "HERO FICTIF")).webp({ quality: 80 }).toFile(`${w}/${n}.webp`);
  await sharp(svg(4000, 3000, "#c9b79c", "PHOTO FICTIVE DE RECETTE")).jpeg({ quality: 85 })
    .withExif({ IFD0: { Make: "RecetteCam", Model: "A15-R" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 24/1", GPSLongitudeRef: "E", GPSLongitude: "2/1 21/1 3/1" } })
    .toFile(`${w}/photo-fictive-gps.jpg`);
})();' "$WORK")

for entry in "a1b2c3d4e5f6|hero-a|TEST RECETTE A15 — Complet" "b6e5d4c3b2a1|hero-b|TEST RECETTE A15 — Gratuit" "c0ffee000001|hero-c|Hommage hors recette (fictif)"; do
  IFS='|' read -r slug img name <<<"$entry"
  mem=$($DB -c "select id from memorials where slug = '$slug'"); own=$($DB -c "select owner_id from memorials where slug = '$slug'"); mid=$($DB -c "select gen_random_uuid()")
  curl -sS -f -o /dev/null -X POST "$API_URL/storage/v1/object/memorial-media/$mem/$mid/original.webp" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" -H "Content-Type: image/webp" --data-binary @"$WORK/$img.webp"
  $DB -c "insert into media (id, memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes, width, height)
          values ('$mid','$mem','$own','$mem/$mid/original.webp','photo','image/webp','hero','ready', $(stat -c %s "$WORK/$img.webp"), 1200, 1500);"
  content=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["hero"]["displayName"]=sys.argv[2]; d["hero"]["photo"]["mediaId"]=sys.argv[3]; d.setdefault("guidedFlow",{})["A15"]={"status":"completed"}; d["contributions"]={"features":{"condolences":True,"stories":True,"photos":True}}; print(json.dumps(d, ensure_ascii=False).replace("'"'"'","'"'"''"'"'"))' "$WORK/fixture.json" "$name" "$mid")
  $DB -c "update memorial_drafts set content = '$content' where memorial_id = '$mem';
          delete from memorial_published_snapshots where memorial_id = '$mem';
          insert into memorial_published_snapshots (memorial_id, content) values ('$mem', '$content');"
done
$DB -c "select slug || ' ' || access_level || ' ' || status from memorials order by slug;"

# Mots de passe des deux comptes de test (variable LOT3_PW, jamais écrite dans le dépôt).
if [ -n "${LOT3_PW:-}" ]; then
  for e in famille.martin@example.test famille.durand@example.test; do
    id=$($DB -c "select id from auth.users where email = '$e'")
    curl -sS -f -o /dev/null -X PUT "$API_URL/auth/v1/admin/users/$id" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d "{\"password\":\"$LOT3_PW\"}"
  done
fi
