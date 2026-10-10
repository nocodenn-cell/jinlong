#!/usr/bin/env bash
# CAP-02 — executa um cenário k6 contra fastproduct-capacity local.
# Nunca lê .env.local / NEXT_PUBLIC_*.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKDIR="$ROOT/.capacity-workdir"
SCENARIO="${1:-T00}"
ART="/opt/cursor/artifacts"
mkdir -p "$ART"

die() { echo "[cap02] ERROR: $*" >&2; exit 2; }

[[ "$SCENARIO" =~ ^T0[0-5]$ ]] || die "cenário inválido: $SCENARIO"

# Status capacity only (docker group may be required)
STATUS="$(sg docker -c "npx --yes supabase@2.120.0 status --workdir '$WORKDIR' -o env" 2>/dev/null | grep -E '^[A-Z0-9_]+=')"
API_URL="$(echo "$STATUS" | awk -F= '/^API_URL=/{print $2}' | tr -d '"')"
ANON_KEY="$(echo "$STATUS" | awk -F= '/^ANON_KEY=/{print $2}' | tr -d '"')"
DB_URL="$(echo "$STATUS" | awk -F= '/^DB_URL=/{print $2}' | tr -d '"')"

[[ "$API_URL" == "http://127.0.0.1:54421" ]] || die "API_URL não local: $API_URL"
[[ "$DB_URL" == *"127.0.0.1:54422"* ]] || die "DB_URL não local"
[[ "$API_URL" != *supabase.co* ]] || die "supabase.co proibido"

# Recusar se NEXT_PUBLIC apontar remoto e alguém tentar usá-lo
if [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" && "${NEXT_PUBLIC_SUPABASE_URL}" != *"127.0.0.1"* && "${NEXT_PUBLIC_SUPABASE_URL}" != *"localhost"* ]]; then
  echo "[cap02] WARN: NEXT_PUBLIC_SUPABASE_URL injetado não-local — IGNORADO (usando status capacity)"
fi
unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY || true

FIXTURES="$WORKDIR/k6-fixtures.json"
[[ -f "$FIXTURES" ]] || die "fixtures ausentes — rode prepare-capacity-k6.mjs"
PASSWORD="$(cat "$WORKDIR/k6-password.txt" 2>/dev/null || true)"
[[ -n "$PASSWORD" ]] || PASSWORD="${CAPACITY_K6_PASSWORD:-CapacityLocal!K6Op}"

# Snapshot recursos pré
{
  echo "scenario=$SCENARIO started=$(date -Iseconds)"
  free -h
  sg docker -c "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'" 2>/dev/null || true
} | tee "$ART/cap02-${SCENARIO,,}-resources-before.txt"

export CAPACITY_DB_URL="$DB_URL"
RECONCILE="$ROOT/scripts/capacity/reconcile-capacity-run.mjs"
CAP02_MODE=baseline CAP02_SCENARIO="$SCENARIO" node "$RECONCILE"

psql "$DB_URL" -tAc "select pg_stat_statements_reset();" >/dev/null

SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "$SINCE" > "$ART/cap02-${SCENARIO,,}-since.txt"

export CAPACITY_ENV=local
export K6_SUPABASE_URL="$API_URL"
export K6_ANON_KEY="$ANON_KEY"
export CAPACITY_K6_PASSWORD="$PASSWORD"
export K6_FIXTURES="$FIXTURES"
export CAP02_SCENARIO="$SCENARIO"
export CAP02_SUMMARY_PATH="$ART/cap02-${SCENARIO,,}-summary.json"

echo "[cap02] running $SCENARIO → $API_URL (fastproduct-capacity)"
set +e
k6 run -q --out json="$ART/cap02-${SCENARIO,,}-metrics.json" \
  "$ROOT/docs/capacity/k6/scenarios/cap02-progressive.js" \
  | tee "$ART/cap02-${SCENARIO,,}-k6.log"
K6_EXIT=${PIPESTATUS[0]}
UNTIL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node "$ROOT/scripts/capacity/summarize-cap02-metrics.mjs" "$SCENARIO" || echo "[cap02] WARN: summarize falhou"

{
  echo "scenario=$SCENARIO ended=$(date -Iseconds) k6_exit=$K6_EXIT"
  free -h
  sg docker -c "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'" 2>/dev/null || true
  echo '=== pg ==='
  psql "$DB_URL" -tAc "select count(*) as connections from pg_stat_activity where datname='postgres';"
  psql "$DB_URL" -tAc "select count(*) as waiting_locks from pg_locks where not granted;"
  echo '=== top statements (mean_ms desc, calls>=5) ==='
  psql "$DB_URL" -c "select calls, round(mean_exec_time::numeric,2) mean_ms, round(max_exec_time::numeric,2) max_ms, left(regexp_replace(query, '\s+', ' ', 'g'), 110) q from pg_stat_statements where calls >= 5 and query not ilike '%pg_stat%' order by mean_exec_time desc limit 8;"
} | tee "$ART/cap02-${SCENARIO,,}-resources-after.txt"

CAP02_MODE=check CAP02_SINCE="$SINCE" CAP02_UNTIL="$UNTIL" node "$RECONCILE" \
  > "$ART/cap02-${SCENARIO,,}-reconcile.log" 2>&1
RECON_EXIT=$?
cat "$ART/cap02-${SCENARIO,,}-reconcile.log"
echo "k6_exit=$K6_EXIT reconcile_exit=$RECON_EXIT" | tee -a "$ART/cap02-${SCENARIO,,}-resources-after.txt"

# Gate: memória disponível crítica
AVAIL_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
echo "mem_available_mb=$AVAIL_MB" | tee -a "$ART/cap02-${SCENARIO,,}-resources-after.txt"
if [[ "$AVAIL_MB" -lt 800 ]]; then
  echo "[cap02] STOP: memória disponível < 800MB" >&2
  exit 3
fi

[[ "$RECON_EXIT" -eq 0 ]] || { echo "[cap02] STOP: reconciliação divergente" >&2; exit 4; }
exit "$K6_EXIT"
