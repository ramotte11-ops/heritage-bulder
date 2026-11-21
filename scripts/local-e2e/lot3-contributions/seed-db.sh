#!/usr/bin/env bash
# LOCAL Supabase only: two families, two published tributes, one historical message.
set -euo pipefail
. "$1"   # sb.env
case "$API_URL" in http://127.0.0.1:*) ;; *) echo "refusing: not local"; exit 1;; esac
DB="psql $DB_URL -v ON_ERROR_STOP=1 -X -q -t -A"
mkuser() {
  curl -sS -X POST "$API_URL/auth/v1/admin/users" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"email_confirm\":true}" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])"
}
UA=$(mkuser famille.martin@example.test); UB=$(mkuser famille.durand@example.test)
OA=$($DB -c "insert into owners (auth_user_id, email) values ('$UA','famille.martin@example.test') returning id;")
OB=$($DB -c "insert into owners (auth_user_id, email) values ('$UB','famille.durand@example.test') returning id;")
# QG 004-B : la publication exige la preuve d'adresse HERITAGE (owner_email_verifications).
# Ces deux comptes de TEST locaux reçoivent la preuve directement, comme le banc du harnais
# SQL (bench_fixture.autoverify_owner) ; le contrôle de l'application reste inchangé.
$DB -c "insert into owner_email_verifications (owner_id, auth_user_id, email_normalized, method) values
  ('$OA','$UA','famille.martin@example.test','email_otp'),
  ('$OB','$UB','famille.durand@example.test','email_otp');" >/dev/null
pub() { # owner slug name
  local ent mem content
  ent=$($DB -c "insert into entitlements (access_level, source, offer_id) values ('complet','direct','intemporel') returning id;")
  mem=$($DB -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status, first_published_at) values ('$1','$ent','person','announcement','intemporel','light','fr','$2','published', now() - interval '2 days') returning id;")
  content="{\"hero\":{\"displayName\":\"$3\",\"birth\":{\"year\":1938},\"death\":{\"year\":2026}},\"contributions\":{\"features\":{\"condolences\":true,\"stories\":true,\"photos\":true}}}"
  $DB -c "update memorial_drafts set content='$content' where memorial_id='$mem'; insert into memorial_published_snapshots (memorial_id, content) values ('$mem','$content');" >/dev/null
  $DB -c "insert into contribution_limits_override (memorial_id, photo_reservations_per_hour, photo_reservations_per_day, max_pending_photos) values ('$mem',1000,1000,1000) on conflict do nothing;" >/dev/null || true
  echo "$mem"
}
MA=$(pub "$OA" a1b2c3d4e5f6 "Jeanne Martin")
MB=$(pub "$OB" b6e5d4c3b2a1 "Louis Durand")
# A historical QG 008 message (read-only in the family screen).
$DB -c "insert into messages (memorial_id, message_type, author_name, content, visible, status, published_at, created_at) values ('$MA','memory_message','Hélène, sa voisine','Un message laissé avant l’ouverture des contributions.', true, 'published', now() - interval '1 day', now() - interval '1 day');" >/dev/null
echo "MA=$MA"; echo "MB=$MB"; echo "OA=$OA"; echo "OB=$OB"
$DB -c "select memorial_id, condolences, stories, photos from memorial_contribution_categories;"
