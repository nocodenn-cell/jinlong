#!/usr/bin/env bash
# A-L1: sobe stack Docker isolada fastproduct-capacity (ports 54421+).
# NÃO toca project_id=fastproduct, volumes existentes, nem .env.local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_CFG="$ROOT/backend/supabase/config.capacity.toml"
# Workdir na raiz do monorepo para imports relativos das Edge Functions
# (ex.: ../../../../shared/logger.ts → <repo>/shared/logger.ts).
WORKDIR="$ROOT/.capacity-workdir"
SUPA="$WORKDIR/supabase"
PROJECT_ID="fastproduct-capacity"

die() { echo "[capacity-stack] ERROR: $*" >&2; exit 2; }

command -v docker >/dev/null || die "docker não encontrado"
docker info >/dev/null 2>&1 || die "daemon Docker inacessível"

# Cloud VMs may leave iptables-legacy FORWARD=DROP, breaking Docker ICC
# (Realtime schema init cannot reach Postgres). Safe, stack-agnostic ACCEPT.
if command -v iptables-legacy >/dev/null 2>&1; then
  sudo iptables-legacy -P FORWARD ACCEPT 2>/dev/null || true
  sudo iptables-legacy -C FORWARD -j ACCEPT 2>/dev/null \
    || sudo iptables-legacy -I FORWARD -j ACCEPT 2>/dev/null || true
fi

# Abort if legacy/dev stack containers already present — we never stop them here.
if docker ps -a --format '{{.Names}}' | grep -E '_fastproduct$|supabase_.*_fastproduct$' >/dev/null 2>&1; then
  if docker ps -a --format '{{.Names}}' | grep -v 'fastproduct-capacity' | grep -E 'fastproduct' >/dev/null 2>&1; then
    die "containers fastproduct (não-capacity) detectados — interrompendo para não interferir"
  fi
fi

[[ -f "$SRC_CFG" ]] || die "faltando $SRC_CFG"

for p in 54420 54421 54422 54423 54427 54429 18083; do
  if ss -ltn 2>/dev/null | grep -qE ":${p}[[:space:]]"; then
    die "porta ${p} em uso — escolha outra faixa antes de subir a stack"
  fi
done

mkdir -p "$SUPA"
cp -f "$SRC_CFG" "$SUPA/config.toml"

# Link shared assets from the real supabase dir (read-only usage).
link() {
  local name="$1"
  local target="$ROOT/backend/supabase/$name"
  local dest="$SUPA/$name"
  if [[ -e "$target" || -L "$target" ]]; then
    ln -sfn "$target" "$dest"
  fi
}
link migrations
link seed.sql
link functions
link scripts
# optional dirs
for d in seeds templates; do link "$d" || true; done

# SYNC_KEY local descartável (não é produção)
export SYNC_KEY="${SYNC_KEY:-capacity-local-sync-key-$(date +%s)}"

echo "[capacity-stack] starting project_id=$PROJECT_ID workdir=$WORKDIR"
cd "$WORKDIR"
npx --yes supabase@2.120.0 start --workdir "$WORKDIR"

echo "[capacity-stack] status:"
npx --yes supabase@2.120.0 status --workdir "$WORKDIR" -o env | sed 's/=.*/=***/' || true
echo "[capacity-stack] OK — API esperada em http://127.0.0.1:54421"
