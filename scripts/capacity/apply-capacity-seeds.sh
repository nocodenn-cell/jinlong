#!/usr/bin/env bash
# A-L1 G5 — aplica seed sintético N∈{1,5,10} na stack local capacity.
# Não toca staging/prod; exige DB em 127.0.0.1:54422.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
N="${CAPACITY_LOJAS:-${1:-}}"
[[ "$N" =~ ^(1|5|10)$ ]] || {
  echo "Uso: CAPACITY_LOJAS=1|5|10 $0   (ou $0 1|5|10)" >&2
  exit 2
}
DB_URL="${CAPACITY_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
case "$DB_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "RECUSADO: DB_URL não é local" >&2; exit 2 ;;
esac
# Bloqueia hosts remotos conhecidos sem embutir refs de projeto no código.
if [[ "$DB_URL" == *supabase.co* || "$DB_URL" == *supabase.in* ]]; then
  echo "RECUSADO: host remoto detectado" >&2
  exit 2
fi
echo "[capacity-seed] applying synthetic seed lojas=$N"
psql "$DB_URL" -v ON_ERROR_STOP=1 -v n_lojas="$N" \
  -f "$ROOT/scripts/capacity/seed-capacity-synthetic.sql" \
  2>&1 | tee "/opt/cursor/artifacts/g5-seed-${N}-lojas.log"
# pipefail: falha do psql propaga
echo "[capacity-seed] OK lojas=$N"
