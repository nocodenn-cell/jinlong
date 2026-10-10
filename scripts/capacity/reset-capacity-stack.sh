#!/usr/bin/env bash
# A-L1: db reset --local na stack fastproduct-capacity (compatível com CI).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKDIR="$ROOT/.capacity-workdir"
[[ -d "$WORKDIR/supabase" ]] || {
  echo "Stack não preparada — rode start-capacity-stack.sh primeiro" >&2
  exit 2
}
# Safety: never reset default workdir
grep -q 'fastproduct-capacity' "$WORKDIR/supabase/config.toml" || {
  echo "RECUSADO: config do workdir não é fastproduct-capacity" >&2
  exit 2
}
export SYNC_KEY="${SYNC_KEY:-capacity-local-sync-key}"
echo "[capacity-reset] db reset --local (project fastproduct-capacity)"
cd "$WORKDIR"
npx --yes supabase@2.120.0 db reset --local --yes --workdir "$WORKDIR"
echo "[capacity-reset] OK"
