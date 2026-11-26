#!/usr/bin/env bash
#
# HERITAGE HOMMAGE — VID-10 : essai local de l'installation « SQL Editor » des
# migrations vidéo (VID-07, VID-08, VID-09).
#
# Rejoue, sur un PostgreSQL local jetable (aucun Docker, aucun réseau, aucun
# projet Supabase), exactement ce que fera la PO dans le SQL Editor : chaque
# fichier de supabase/installation/vid-sql-editor/ est envoyé en UNE seule
# requête (psql -c), comme le fait l'éditeur.
#
# Prouve :
#   1. que les fichiers générés sont à jour (build --check) ;
#   2. l'état « avant » et le préflight sur une base au niveau attendu de la
#      production (49 versions, lot M8 installé), avec des hommages existants ;
#   3. les refus : ordre, double application, texte altéré, objet déjà présent ;
#   4. les étapes 1 à 3, puis le postflight et l'état « après » ;
#   5. que le schéma obtenu (tables, fonctions, contraintes, DROITS) est
#      IDENTIQUE à une application classique des trois fichiers ;
#   6. que les hommages existants et leurs copies publiées sont intacts ;
#   7. les retours arrière 3 → 1 (dont le refus de R1 tant qu'une vidéo
#      hébergée existe), le retour au schéma initial et la réinstallation.
#
# Usage : bash scripts/db/test-vid-sql-editor-installation.sh
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then
  src="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  tmp="$(mktemp -d /tmp/heritage-vidsqled.XXXXXX)"
  cp -r "$src/scripts" "$src/supabase" "$tmp/"
  chown -R postgres:postgres "$tmp"
  set +e; su postgres -c "bash '$tmp/scripts/db/test-vid-sql-editor-installation.sh'"; rc=$?; set -e
  rm -rf "$tmp"; exit $rc
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INST="$ROOT/supabase/installation/vid-sql-editor"
MIG="$ROOT/supabase/migrations"
VER="$ROOT/supabase/verifications"
PGB="$(dirname "$(command -v initdb 2>/dev/null || true)")"
if [ -z "$PGB" ] || [ "$PGB" = "." ]; then PGB="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"; fi
WORK="$(mktemp -d)"; SOCK="$WORK/sock"; mkdir -p "$SOCK"
PASS=0; FAIL=0
cleanup() { "$PGB/pg_ctl" -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); echo "  [PASS] $1"
  else FAIL=$((FAIL + 1)); echo "  [FAIL] $1"; echo "         attendu : $2"; echo "         constaté : $3"; fi
}
FIRST=20261125090000

echo "== 0. Fichiers générés à jour"
check "build-sql-editor-installation.py --check (lots m8 et vid)" "0" "$(python3 -I "$ROOT/scripts/db/build-sql-editor-installation.py" --check >/dev/null 2>&1; echo $?)"

"$PGB/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PGB/pg_ctl" -D "$WORK/data" -o "-c listen_addresses='' -k $SOCK" -l "$WORK/log" -w start >/dev/null
P="psql -h $SOCK -U postgres -X -q -v ON_ERROR_STOP=1"
awk '/== Creating Supabase stand-ins/{f=1; next} f && /<<.SQL.$/{g=1; next} g && /^SQL$/{exit} g{print}' \
  "$ROOT/scripts/db/test-local.sh" > "$WORK/standins.sql"
$P -d postgres -c "create database base49;"
$P -d base49 -f "$WORK/standins.sql" >/dev/null
for f in "$MIG"/*.sql; do
  [[ "$(basename "$f")" < "$FIRST" ]] || continue
  $P -d base49 -f "$f" >/dev/null 2>&1
done
$P -d base49 -c "create schema supabase_migrations;
  create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text,
    created_by text, idempotency_key text unique, rollback text[]);"
for f in "$MIG"/*.sql; do
  b="$(basename "$f" .sql)"; [[ "$b" < "$FIRST" ]] || continue
  $P -d base49 -c "insert into supabase_migrations.schema_migrations (version, name) values ('${b:0:14}', '${b:15}');"
done
# Hommages existants : un brouillon gratuit, un hommage complet publié (copie publiée).
OWNER=$($P -d base49 -t -A -c "insert into owners (email, auth_user_id) values ('essai-video@heritage.test', gen_random_uuid()) returning id;")
ENT=$($P -d base49 -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet','direct','intemporel') returning id;")
MEM=$($P -d base49 -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status, first_published_at) values ('$OWNER','$ENT','person','announcement','intemporel','light','fr','essai-video','published', now()) returning id;")
$P -d base49 -c "set session_replication_role = replica; insert into memorial_published_snapshots (memorial_id, content) values ('$MEM', '{\"hero\":{\"displayName\":\"Essai\"}}');" >/dev/null
DATA="select (select count(*) from memorials) || '|' || (select count(*) from memorial_published_snapshots) || '|' || (select md5(string_agg(content::text, ',' order by memorial_id)) from memorial_published_snapshots);"
D0=$($P -d base49 -t -A -c "$DATA")

clone() { $P -d postgres -c "create database $1 template $2;"; }
run()   { $P -d "$1" -c "$(cat "$2")" 2>&1 || true; }
rows()  { $P -d "$1" -t -A -F'|' -c "$(cat "$2")" 2>&1; }
okc()   { rows "$1" "$2" | grep -c '|OK$' || true; }
koc()   { rows "$1" "$2" | grep -c -E 'ECHEC|\|STOP' || true; }
hist()  { $P -d "$1" -t -A -c "select count(*) || '|' || max(version) from supabase_migrations.schema_migrations;"; }
schema(){ "$PGB/pg_dump" -h "$SOCK" -U postgres -s --exclude-schema=supabase_migrations "$1" | grep -v -E '^\\(un)?restrict ' ; }
F() { ls "$INST"/$1; }
alter_b64() {
  python3 -I - "$1" "$2" <<'PY'
import re, sys
src, dst = sys.argv[1:]
lines = open(src, encoding="utf-8").read().split("\n")
pay = [i for i, l in enumerate(lines) if re.fullmatch(r"[A-Za-z0-9+/=]{76}", l)]
i = pay[3]; l = lines[i]; lines[i] = l[:10] + ("A" if l[10] != "A" else "B") + l[11:]
open(dst, "w", encoding="utf-8", newline="").write("\n".join(lines))
PY
}

echo "== 1. État avant installation et préflight"
clone ed base49
check "historique de départ : 49 versions, dernière 20261122090000" "49|20261122090000" "$(hist ed)"
check "00_etat_avant : aucun ECHEC" "0" "$(koc ed "$(F '00_*')")"
check "00b_test_transport : 3 migrations OK" "3" "$(rows ed "$(F '00b_*')" | grep -c '|OK$' || true)"
check "préflight vidéo : aucun ECHEC" "0" "$(koc ed "$VER/vid_preflight.sql")"
check "préflight vidéo : 16 OK" "16" "$(okc ed "$VER/vid_preflight.sql")"

echo "== 2. Refus avant la moindre écriture"
clone neg ed
S0="$(schema neg)"
check "étape 2 avant l'étape 1 : STOP" "1" "$(run neg "$(F '02_*')" | grep -m1 -c 'STOP \[20261125100000\]' || true)"
check "étape 3 avant l'étape 1 : STOP" "1" "$(run neg "$(F '03_*')" | grep -m1 -c 'STOP \[20261126090000\]' || true)"
alter_b64 "$(F '01_*')" "$WORK/altere.sql"
check "texte altéré au copier-coller : STOP" "1" "$(run neg "$WORK/altere.sql" | grep -m1 -c 'STOP \[20261125090000\] : texte' || true)"
$P -d neg -c "create table public.memorial_videos (x int);"
check "objet déjà présent sans historique : STOP" "1" "$(run neg "$(F '01_*')" | grep -c 'existe déjà' || true)"
$P -d neg -c "drop table public.memorial_videos;"
clone nom8 base49
$P -d nom8 -c "delete from supabase_migrations.schema_migrations where version = '20261122090000';"
check "lot M8 incomplet en production : préflight ECHEC et étape 1 STOP ordre" "1|1" \
  "$([ "$(koc nom8 "$VER/vid_preflight.sql")" -gt 0 ] && echo 1 || echo 0)|$(run nom8 "$(F '01_*')" | grep -m1 -c 'STOP \[20261125090000\] : ordre' || true)"
$P -d postgres -c "drop database nom8;"
check "rien n'a changé après les refus (schéma et historique)" "same|49|20261122090000" "$([ "$(schema neg)" = "$S0" ] && echo same || echo DIFF)|$(hist neg)"
$P -d postgres -c "drop database neg;"

echo "== 3. Installation, étape par étape"
check "étape 1 (VID-07) : verdict OK" "1" "$(run ed "$(F '01_*')" | grep -c 'OK — étape 1/3' || true)"
check "étape 1 relancée : STOP déjà installée" "1" "$(run ed "$(F '01_*')" | grep -c 'DÉJÀ INSTALLÉE' || true)"
check "étape 2 (VID-08) : verdict OK" "1" "$(run ed "$(F '02_*')" | grep -c 'OK — étape 2/3' || true)"
check "étape 3 (VID-09) : verdict OK" "1" "$(run ed "$(F '03_*')" | grep -c 'OK — étape 3/3' || true)"
check "historique final : 52 versions, dernière 20261126090000" "52|20261126090000" "$(hist ed)"
check "postflight vidéo : aucun ECHEC" "0" "$(koc ed "$VER/vid_postflight.sql")"
check "postflight vidéo : 31 OK" "31" "$(okc ed "$VER/vid_postflight.sql")"
check "99_etat_apres : aucun ECHEC" "0" "$(koc ed "$(F '99_*')")"
check "hommages et copies publiées intacts (nombre et contenu)" "$D0" "$($P -d ed -t -A -c "$DATA")"

echo "== 4. Équivalence avec une application classique des fichiers"
clone ref base49
for v in 20261125090000 20261125100000 20261126090000; do
  $P -d ref -f "$(ls "$MIG"/${v}_*.sql)" >/dev/null 2>&1
done
check "schéma, contraintes, fonctions et DROITS identiques à psql -f" "identique" \
  "$(diff <(schema ref) <(schema ed) >/dev/null && echo identique || echo DIFFERENT)"

echo "== 5. Retours arrière 3 → 1"
clone rb ed
check "R1 avant R3 : STOP (plus récente installée)" "1" "$(run rb "$(F 'R1_*')" | grep -c 'plus récente' || true)"
for n in 3 2; do
  check "R$n : verdict OK" "1" "$(run rb "$(F "R${n}_*")" | grep -c "OK — retour arrière $n/3" || true)"
done
$P -d rb -c "insert into memorial_videos (memorial_id, owner_id, draft_video_id, status) values ('$MEM','$OWNER','v-essai','reserved');" >/dev/null
check "R1 avec une vidéo hébergée : STOP (assets Mux à supprimer d'abord), rien de modifié" "1|50" \
  "$(run rb "$(F 'R1_*')" | grep -c 'assets Mux orphelins' || true)|$($P -d rb -t -A -c "select count(*) from supabase_migrations.schema_migrations;")"
$P -d rb -c "delete from memorial_videos;" >/dev/null
check "R1 sans vidéo : verdict OK" "1" "$(run rb "$(F 'R1_*')" | grep -c 'OK — retour arrière 1/3' || true)"
check "après R3 → R1 : schéma identique à l'état initial" "identique" \
  "$(diff <(schema base49) <(schema rb) >/dev/null && echo identique || echo DIFFERENT)"
check "après R3 → R1 : historique revenu à 49, état « avant » sans ECHEC, données intactes" "49|20261122090000|0|$D0" \
  "$(hist rb)|$(koc rb "$(F '00_*')")|$($P -d rb -t -A -c "$DATA")"
check "réinstallation complète après retour arrière : 3 verdicts OK" "3" \
  "$(for n in 1 2 3; do run rb "$(F "0${n}_*")"; done | grep -c 'OK — étape' || true)"

echo ""
echo "== Résultat : $PASS réussis, $FAIL échoués =="
[ "$FAIL" -eq 0 ]
