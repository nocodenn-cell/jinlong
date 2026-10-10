#!/usr/bin/env bash
# CAP-02 — amostra recursos do host/containers capacity a cada N s durante o cenário.
# Iniciado e encerrado por run-cap02-scenario.sh (trap). Também encerra sozinho se o
# processo pai sumir ou após MAX_S segundos, para nunca ficar órfão.
# Uso: sample-capacity-resources.sh T03 PARENT_PID [intervalo_s] [max_s]
set -uo pipefail
SCENARIO="${1:?cenário}"
PARENT_PID="${2:?pid pai}"
INTERVAL="${3:-15}"
MAX_S="${4:-1500}"
OUT="/opt/cursor/artifacts/cap02-${SCENARIO,,}-samples.tsv"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54422/postgres"
PG_SQL="select count(*), count(*) filter (where state='active'), \
(select count(*) from pg_locks where not granted), \
(select xact_rollback from pg_stat_database where datname='postgres'), \
(select deadlocks from pg_stat_database where datname='postgres') \
from pg_stat_activity where datname='postgres'"

cpu_ticks() { awk '/^cpu / {idle=$5+$6; t=0; for(i=2;i<=NF;i++) t+=$i; print t, idle}' /proc/stat; }

container_col() {
  echo "$1" | awk -v n="supabase_$2_fastproduct-capacity" -v f="$3" '$1==n {print $f}'
}

echo -e "ts\thost_cpu_pct\tload1\tmem_avail_mb\tpg_conns\tpg_active\tlocks_wait\tpg_rollbacks\tpg_deadlocks\tdb_cpu\tdb_mem\trest_cpu\tkong_cpu\tauth_cpu" > "$OUT"
START=$SECONDS
read -r T0 I0 < <(cpu_ticks)
while kill -0 "$PARENT_PID" 2>/dev/null && (( SECONDS - START < MAX_S )); do
  sleep "$INTERVAL"
  read -r T1 I1 < <(cpu_ticks)
  cpu=$(awk -v dt=$((T1 - T0)) -v di=$((I1 - I0)) 'BEGIN { printf "%.1f", dt ? 100 * (dt - di) / dt : 0 }')
  T0=$T1; I0=$I1
  stats="$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' 2>/dev/null)"
  pg="$(psql "$DB_URL" -tAc "$PG_SQL" 2>/dev/null | tr '|' '\t')"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%H:%M:%S)" "$cpu" \
    "$(cut -d' ' -f1 /proc/loadavg)" "$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)" \
    "${pg:-NA}" "$(container_col "$stats" db 2)" "$(container_col "$stats" db 3)" \
    "$(container_col "$stats" rest 2)" "$(container_col "$stats" kong 2)" \
    "$(container_col "$stats" auth 2)" >> "$OUT"
done
