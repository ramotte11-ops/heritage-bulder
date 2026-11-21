#!/usr/bin/env bash
#
# HERITAGE HOMMAGE — M8-DB-02 : essai local de l'installation « SQL Editor ».
#
# Rejoue, sur un PostgreSQL local jetable (aucun Docker, aucun réseau, aucun
# projet Supabase), exactement ce que fera le QG dans le SQL Editor :
# chaque fichier de supabase/installation/m8-sql-editor/ est envoyé en UNE
# seule requête (psql -c), comme le fait l'éditeur.
#
# Prouve :
#   1. que les fichiers générés sont à jour (build --check) ;
#   2. l'état « avant » d'une base au niveau de la production (44 versions) ;
#   3. chaque étape 1 à 5, avec les préflights/postflights du dépôt ;
#   4. que le schéma obtenu (tables, fonctions, contraintes, droits) est
#      IDENTIQUE à celui d'une application classique des cinq fichiers ;
#   5. les refus : double application, ordre, texte altéré, objet déjà
#      présent, échec en cours de route (tout ou rien) ;
#   6. les retours arrière 5 → 1 et le retour à l'état initial à l'identique.
#
# Usage : bash scripts/db/test-sql-editor-installation.sh
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then
  src="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  tmp="$(mktemp -d /tmp/heritage-sqled.XXXXXX)"
  cp -r "$src/scripts" "$src/supabase" "$tmp/"
  chown -R postgres:postgres "$tmp"
  set +e; su postgres -c "bash '$tmp/scripts/db/test-sql-editor-installation.sh'"; rc=$?; set -e
  rm -rf "$tmp"; exit $rc
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INST="$ROOT/supabase/installation/m8-sql-editor"
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

echo "== 0. Fichiers générés à jour"
check "build-sql-editor-installation.py --check" "0" "$(python3 -I "$ROOT/scripts/db/build-sql-editor-installation.py" --check >/dev/null 2>&1; echo $?)"

"$PGB/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PGB/pg_ctl" -D "$WORK/data" -o "-c listen_addresses='' -k $SOCK" -l "$WORK/log" -w start >/dev/null
P="psql -h $SOCK -U postgres -X -q -v ON_ERROR_STOP=1"

# Les mêmes substituts Supabase que scripts/db/test-local.sh (rôles, auth.uid(), storage).
awk '/== Creating Supabase stand-ins/{f=1; next} f && /<<.SQL.$/{g=1; next} g && /^SQL$/{exit} g{print}' \
  "$ROOT/scripts/db/test-local.sh" > "$WORK/standins.sql"
$P -d postgres -c "create database base44;"
$P -d base44 -f "$WORK/standins.sql" >/dev/null
for f in "$MIG"/*.sql; do
  [[ "$(basename "$f")" < "20261116120000" ]] || continue
  $P -d base44 -f "$f" >/dev/null 2>&1
done
# Historique au format de la production (colonnes décrites par le QG).
$P -d base44 -c "create schema supabase_migrations;
  create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text,
    created_by text, idempotency_key text unique, rollback text[]);"
for f in "$MIG"/*.sql; do
  b="$(basename "$f" .sql)"; [[ "$b" < "20261116120000" ]] || continue
  $P -d base44 -c "insert into supabase_migrations.schema_migrations (version, name) values ('${b:0:14}', '${b:15}');"
done
# Données comparables à la production : trois offrandes, aucun message.
OWNER=$($P -d base44 -t -A -c "insert into owners (email, auth_user_id) values ('essai@heritage.test', gen_random_uuid()) returning id;")
ENT=$($P -d base44 -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet','direct','intemporel') returning id;")
MEM=$($P -d base44 -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$OWNER','$ENT','person','announcement','intemporel','light','fr','essai-sqled','draft') returning id;")
for k in bougie lys coeur; do
  $P -d base44 -c "insert into symbolic_offerings (memorial_id, kind, idempotency_key) values ('$MEM','$k',gen_random_uuid());" >/dev/null
done

clone() { $P -d postgres -c "create database $1 template $2;"; }
run()   { $P -d "$1" -c "$(cat "$2")" 2>&1 || true; }                    # une seule requête, comme le SQL Editor
rows()  { $P -d "$1" -t -A -F'|' -c "$(cat "$2")" 2>&1; }
okc()   { rows "$1" "$2" | grep -c '|OK$' || true; }
koc()   { rows "$1" "$2" | grep -c -E 'ECHEC|\|STOP' || true; }
hist()  { $P -d "$1" -t -A -c "select count(*) || '|' || max(version) from supabase_migrations.schema_migrations;"; }
schema(){ "$PGB/pg_dump" -h "$SOCK" -U postgres -s --exclude-schema=supabase_migrations "$1" | grep -v -E '^\\(un)?restrict ' ; }
F() { ls "$INST"/$1; }

echo "== 1. État avant installation (base au niveau de la production)"
clone ed base44
check "00_etat_avant : uniquement des OK, aucun ECHEC" "0" "$(koc ed "$(F '00_*')")"
check "00_etat_avant : nombre de contrôles OK" "61" "$(okc ed "$(F '00_*')")"
check "historique de départ : 44 versions, dernière 20261116100000" "44|20261116100000" "$(hist ed)"
check "030_postflight avant : aucun ECHEC" "0" "$(rows ed "$ROOT/supabase/checks/030_postflight.sql" | grep -c 'ECHEC' || true)"
check "préflight Lot 2 : 9 OK, 0 ECHEC" "9|0" "$(okc ed "$VER/lot2_signature_preflight.sql")|$(koc ed "$VER/lot2_signature_preflight.sql")"

echo "== 2. Refus avant la moindre écriture"
clone neg ed
S0="$(schema neg)"
check "étape 2 avant l'étape 1 : STOP ordre" "1" "$(run neg "$(F '02_*')" | grep -c 'STOP \[20261119090000\] : ordre' || true)"
check "étape 5 avant l'étape 1 : STOP prérequis/ordre" "1" "$(run neg "$(F '05_*')" | grep -c 'STOP \[20261122090000\]' || true)"
sed 's/^  add column if not exists signature text,$/  add column if not exists signature varchar,/' "$(F '01_*')" > "$WORK/altere.sql"
check "texte altéré au copier-coller : STOP empreinte" "1" "$(run neg "$WORK/altere.sql" | grep -c 'STOP \[20261116120000\] : texte' || true)"
$P -d neg -c "alter table symbolic_offerings add column signature text;"
check "objet déjà présent sans historique : STOP" "1" "$(run neg "$(F '01_*')" | grep -c 'existe déjà' || true)"
$P -d neg -c "alter table symbolic_offerings drop column signature;"
check "rien n'a changé après les refus (schéma et historique)" "same|44|20261116100000" "$([ "$(schema neg)" = "$S0" ] && echo same || echo DIFF)|$(hist neg)"
$P -d postgres -c "drop database neg;"

echo "== 3. Installation, étape par étape"
check "étape 1 (Lot 2) : verdict OK" "1" "$(run ed "$(F '01_*')" | grep -c 'OK — étape 1/5' || true)"
check "postflight Lot 2 : 10 OK, 0 ECHEC" "10|0" "$(okc ed "$VER/lot2_signature_postflight.sql")|$(koc ed "$VER/lot2_signature_postflight.sql")"
check "étape 1 relancée : STOP déjà installée" "1" "$(run ed "$(F '01_*')" | grep -c 'DÉJÀ INSTALLÉE' || true)"
check "historique : 45 versions" "45|20261116120000" "$(hist ed)"
check "les 3 offrandes conservées, sans signature" "3|0" "$($P -d ed -t -A -c "select count(*) || '|' || count(signature) from symbolic_offerings;")"
check "préflight M8-E0 : aucun ECHEC ni STOP" "0" "$(koc ed "$VER/m8_e0_preflight.sql")"
check "préflight M8-E1 : 24 OK, 0 ECHEC" "24|0" "$(okc ed "$VER/m8_e1_preflight.sql")|$(koc ed "$VER/m8_e1_preflight.sql")"

# Tout ou rien : un échec au milieu de E1 ne laisse aucune trace.
clone mid ed
$P -d mid -c "create table public.contribution_limits_override (x int);"
S1="$(schema mid)"
OUT_MID="$(run mid "$(F '02_*')")"
check "échec au milieu de E1 : erreur PostgreSQL remontée" "1" "$(echo "$OUT_MID" | grep -c -i 'already exists' || true)"
check "échec au milieu de E1 : aucune trace (schéma, historique)" "same|45" "$([ "$(schema mid)" = "$S1" ] && echo same || echo DIFF)|$($P -d mid -t -A -c "select count(*) from supabase_migrations.schema_migrations;")"
check "échec au milieu de E1 : messages.status absent" "0" "$($P -d mid -t -A -c "select count(*) from information_schema.columns where table_name='messages' and column_name='status';")"
$P -d postgres -c "drop database mid;"

check "étape 2 (E1) : verdict OK" "1" "$(run ed "$(F '02_*')" | grep -c 'OK — étape 2/5' || true)"
check "postflight M8-E1 : 26 OK, 0 ECHEC" "26|0" "$(okc ed "$VER/m8_e1_postflight.sql")|$(koc ed "$VER/m8_e1_postflight.sql")"
check "étape 3 (E2) : verdict OK" "1" "$(run ed "$(F '03_*')" | grep -c 'OK — étape 3/5' || true)"
check "étape 4 (E3) : verdict OK" "1" "$(run ed "$(F '04_*')" | grep -c 'OK — étape 4/5' || true)"
check "étape 5 (E4) : verdict OK" "1" "$(run ed "$(F '05_*')" | grep -c 'OK — étape 5/5' || true)"
check "postflight M8-E2 à E4 : 16 OK, 0 ECHEC" "16|0" "$(okc ed "$VER/m8_e2_e4_postflight.sql")|$(koc ed "$VER/m8_e2_e4_postflight.sql")"
check "030_postflight après : aucun ECHEC" "0" "$(rows ed "$ROOT/supabase/checks/030_postflight.sql" | grep -c 'ECHEC' || true)"
check "99_etat_apres : uniquement des OK" "0" "$(koc ed "$(F '99_*')")"
check "99_etat_apres : nombre de contrôles OK" "66" "$(okc ed "$(F '99_*')")"
check "historique final : 49 versions, dernière 20261122090000" "49|20261122090000" "$(hist ed)"
check "00_etat_avant relancé après coup : signale l'écart (ECHEC)" "1" "$([ "$(koc ed "$(F '00_*')")" -gt 0 ] && echo 1 || echo 0)"

echo "== 4. Équivalence avec une application classique des fichiers"
clone ref base44
for v in 20261116120000 20261119090000 20261120090000 20261121090000 20261122090000; do
  $P -d ref -f "$(ls "$MIG"/${v}_*.sql)" >/dev/null 2>&1
done
check "schéma, contraintes, fonctions et DROITS identiques à psql -f" "identique" \
  "$(diff <(schema ref) <(schema ed) >/dev/null && echo identique || echo DIFFERENT)"
check "historique : texte enregistré = fichier GitHub (5 empreintes)" "5" \
  "$($P -d ed -t -A -c "select count(*) from supabase_migrations.schema_migrations where statements is not null;")"

echo "== 5. Retours arrière 5 → 1"
clone rb ed
check "R1 avant R5 : STOP (plus récente installée)" "1" "$(run rb "$(F 'R1_*')" | grep -c 'plus récente' || true)"
for n in 5 4 3; do
  check "R$n : verdict OK" "1" "$(run rb "$(F "R${n}_*")" | grep -c "OK — retour arrière $n/5" || true)"
done
$P -d rb -c "insert into messages (memorial_id, message_type, author_name, content, status, idempotency_key) values ('$MEM','condolence','Essai','essai','pending',gen_random_uuid());" >/dev/null
check "R2 avec une contribution réelle : refus du script E1, rien de modifié" "1|46" \
  "$(run rb "$(F 'R2_*')" | grep -m1 -c 'rollback refused: real contributions exist' || true)|$($P -d rb -t -A -c "select count(*) from supabase_migrations.schema_migrations;")"
$P -d rb -c "delete from messages;" >/dev/null
check "R2 sans contribution : verdict OK" "1" "$(run rb "$(F 'R2_*')" | grep -c 'OK — retour arrière 2/5' || true)"
$P -d rb -c "update symbolic_offerings set signature = 'Marie', signed_at = now() where kind = 'lys';" >/dev/null
check "R1 avec une signature et sans export confirmé : STOP" "1" "$(run rb "$(F 'R1_*')" | grep -c 'EFFACE DÉFINITIVEMENT' || true)"
$P -d rb -c "update symbolic_offerings set signature = null, signed_at = null;" >/dev/null
check "R1 sans signature : verdict OK" "1" "$(run rb "$(F 'R1_*')" | grep -c 'OK — retour arrière 1/5' || true)"
check "après R5 → R1 : schéma identique à l'état initial" "identique" \
  "$(diff <(schema base44) <(schema rb) >/dev/null && echo identique || echo DIFFERENT)"
check "après R5 → R1 : historique revenu à 44, état « avant » tout OK" "44|20261116100000|0" "$(hist rb)|$(koc rb "$(F '00_*')")"
check "réinstallation complète après retour arrière : 5 verdicts OK" "5" \
  "$(for n in 1 2 3 4 5; do run rb "$(F "0${n}_*")"; done | grep -c 'OK — étape' || true)"

echo ""
echo "== Résultat : $PASS réussis, $FAIL échoués =="
[ "$FAIL" -eq 0 ]
