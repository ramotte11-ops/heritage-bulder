#!/usr/bin/env bash
# Mission 04-G / L1.4 — banc de mesure local du Builder authentifié.
#
# 1. écrit le brouillon de test depuis les fixtures des tests unitaires ;
# 2. construit l'application branchée sur le faux Supabase LOCAL
#    (clés factices, aucune donnée réelle) ;
# 3. démarre le faux Supabase et l'application ;
# 4. joue le parcours à 0, 100 et 300 ms de latence simulée par appel ;
# 5. écrit les résultats dans scripts/perf/.out/<libellé>/.
#
# Usage : scripts/perf/bench.sh <libellé> [--no-build]
# Rien n'est déployé, rien ne quitte la machine. Voir README.md.
set -euo pipefail

LABEL="${1:?Usage : scripts/perf/bench.sh <libellé> [--no-build]}"
NO_BUILD="${2:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PERF="$ROOT/scripts/perf"
OUT="$PERF/.out/$LABEL"
STUB_PORT="${PERF_STUB_PORT:-54399}"
APP_PORT="${PERF_APP_PORT:-3100}"
LATENCIES="${PERF_LATENCIES:-0 100 300}"
mkdir -p "$OUT"
cd "$ROOT"

STUB_PID=""
APP_PID=""
cleanup() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  [ -n "$STUB_PID" ] && kill "$STUB_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "› Brouillon de test"
PERF_FIXTURE_OUT="$OUT/fixture.json" npx vitest run --config scripts/perf/vitest.perf.config.mts > "$OUT/fixture.log" 2>&1

export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$STUB_PORT"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="perf-bench-anon-key"
export SUPABASE_SERVICE_ROLE_KEY="perf-bench-service-key"
export NEXT_PUBLIC_SITE_URL="http://localhost:$APP_PORT"
export PERF_STUB_PORT="$STUB_PORT" PERF_APP_PORT="$APP_PORT"

if [ "$NO_BUILD" != "--no-build" ]; then
  echo "› Build de production branché sur le faux Supabase (journal : $OUT/build.log)"
  npm run build > "$OUT/build.log" 2>&1
fi

LOG="$OUT/calls.jsonl"
: > "$LOG"
node "$PERF/supabase-stub.mjs" "$OUT/fixture.json" "$LOG" "$STUB_PORT" > "$OUT/stub.log" 2>&1 &
STUB_PID=$!
node_modules/.bin/next start -p "$APP_PORT" > "$OUT/app.log" 2>&1 &
APP_PID=$!

for _ in $(seq 1 150); do
  if curl -s -o /dev/null "http://127.0.0.1:$STUB_PORT/__latency?ms=0" && curl -s -o /dev/null "http://localhost:$APP_PORT/"; then break; fi
  sleep 0.2
done

git rev-parse HEAD > "$OUT/sha.txt"
for L in $LATENCIES; do
  echo "› Parcours à $L ms par appel"
  : > "$LOG"
  node "$PERF/scenarios.mjs" "$L" "$OUT/run-$L.json"
  cp "$LOG" "$OUT/calls-$L.jsonl"
  node "$PERF/analyze.mjs" "$OUT/calls-$L.jsonl" "$OUT/run-$L.json" | tee "$OUT/summary-$L.md"
done

echo
echo "Résultats : $OUT (SHA $(cat "$OUT/sha.txt"))"
echo "ATTENTION : .next est construit pour le faux Supabase. Relancer « npm run build » avant tout autre usage."
