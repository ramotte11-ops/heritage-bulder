#!/usr/bin/env bash
#
# Sauvegarde logique d'un projet Supabase HERITAGE (schéma public + données),
# et vérification de restauration sur une base locale jetable.
#
#   SUPABASE_DB_URL="postgresql://…" scripts/db/backup-supabase.sh backup  [dossier]
#   scripts/db/backup-supabase.sh verify <fichier.dump>
#
# `backup` : pg_dump au format custom (compressé, restaurable table par table)
#   du schéma `public` uniquement — le schéma `auth` (comptes, sessions) et
#   `storage` (métadonnées des objets) appartiennent à la plateforme Supabase
#   et se restaurent par ses propres outils. Les OBJETS du bucket
#   `memorial-media` (les photos) ne sont PAS dans ce dump : voir le README.
#   Lecture seule sur le projet : aucune écriture, aucun verrou exclusif.
#
# `verify` : restaure le dump dans un PostgreSQL local jetable (même mécanisme
#   que test-local.sh : initdb, aucun Docker, aucun réseau), puis compare le
#   nombre de tables et de lignes à ceux inscrits dans le dump. Prouve que le
#   fichier est restaurable, sans toucher au projet.
#
# Chaque fichier produit contient des données personnelles de familles : à
# conserver chiffré, hors du dépôt (`*.dump` est ignoré par git).
set -euo pipefail

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

mode="${1:-}"
case "$mode" in
  backup)
    : "${SUPABASE_DB_URL:?SUPABASE_DB_URL manquante (Project Settings -> Database, chaîne directe ou pooler en mode session)}"
    out_dir="${2:-backups}"
    mkdir -p "$out_dir"
    # Étiquette du fichier : premier label de l'hôte (db.<ref> -> <ref>), ou « local ».
    ref="$(printf '%s' "$SUPABASE_DB_URL" | sed -nE 's#^[a-z]+://[^@/]*@([^/?:]+).*#\1#p' | sed -E 's#^db\.##; s#\..*##; s#[^A-Za-z0-9_-]#_#g')"
    ref="${ref:-local}"
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    file="$out_dir/heritage-${ref}-${stamp}.dump"
    echo "== Sauvegarde du schéma public de ${ref} -> ${file}"
    pg_dump "$SUPABASE_DB_URL" \
      --format=custom --schema=public --no-owner --no-privileges \
      --file "$file"
    echo "== Inventaire (lignes par table, lu dans le projet) -> ${file}.counts"
    psql "$SUPABASE_DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "
      select format('%s|%s', c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r','p') order by 1;" > "${file}.counts"
    sha256sum "$file" > "${file}.sha256"
    echo "== Terminé : $(wc -l < "${file}.counts") tables, $(du -h "$file" | cut -f1)"
    ;;
  verify)
    file="${2:?fichier .dump à vérifier}"
    [ -f "$file" ] && [ -f "${file}.counts" ] || { echo "Dump ou inventaire absent"; exit 1; }
    if [ "$(id -u)" = "0" ]; then
      command -v su >/dev/null && id postgres >/dev/null 2>&1 || { echo "initdb refuse root : lancer en utilisateur non privilégié"; exit 1; }
      tmp="$(mktemp -d /tmp/heritage-verify.XXXXXX)"; cp "$file" "${file}.counts" "$tmp/"; chown -R postgres:postgres "$tmp"
      exec su postgres -c "bash '$0' verify '$tmp/$(basename "$file")'"
    fi
    PG_BINDIR="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
    [ -n "$PG_BINDIR" ] && export PATH="$PG_BINDIR:$PATH"
    work="$(mktemp -d)"; sock="$work/sock"; mkdir -p "$sock"
    trap 'pg_ctl -D "$work/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
    initdb -D "$work/data" -U postgres --auth=trust >/dev/null
    pg_ctl -D "$work/data" -o "-c listen_addresses='' -k $sock" -l "$work/pg.log" -w start >/dev/null
    PSQL="psql -h $sock -U postgres -X -q -v ON_ERROR_STOP=1"
    $PSQL -d postgres -c "create database restore_check;"
    # Les prérequis de plateforme que le dump référence sans les contenir.
    $PSQL -d restore_check -c "create schema auth; create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      create schema extensions; create extension pgcrypto with schema extensions;
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"
    echo "== Restauration de $(basename "$file") dans une base locale jetable"
    # Le schéma public existe déjà (comme sur tout projet Supabase) : on le retire du dump.
    pg_restore --list "$file" | grep -vE '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' > "$work/restore.list"
    pg_restore -h "$sock" -U postgres -d restore_check --no-owner --no-privileges --exit-on-error --use-list "$work/restore.list" "$file"
    echo "== Comparaison des lignes restaurées avec l'inventaire du projet"
    fail=0
    while IFS='|' read -r table expected; do
      [ -n "$table" ] || continue
      actual="$($PSQL -d restore_check -t -A -c "select count(*) from public.\"$table\";")"
      if [ "$actual" = "$expected" ]; then echo "  [OK]    $table : $actual"; else echo "  [ECHEC] $table : attendu $expected, restauré $actual"; fail=1; fi
    done < "${file}.counts"
    fns="$($PSQL -d restore_check -t -A -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';")"
    echo "  fonctions public restaurées : $fns"
    [ "$fail" = 0 ] && echo "== Restauration vérifiée : chaque table a le même nombre de lignes que le projet au moment du dump" || { echo "== ECHEC de la vérification"; exit 1; }
    ;;
  *) usage ;;
esac
