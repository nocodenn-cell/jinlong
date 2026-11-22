#!/usr/bin/env bash
# P0-02 — drill de restore com dados sintéticos (sem produção, sem PII).
# Uso: bash scripts/restore-synthetic-local.sh
# Requer: age, age-keygen, psql, sha256sum (ou shasum -a 256).
# Destino: Docker postgres:17 se disponível; senão database efêmero no Postgres local.
set -euo pipefail

WORK="$(mktemp -d "${TMPDIR:-/tmp}/jinlong-restore-synth.XXXXXX")"
MODE=""
CID=""
DB_NAME=""
PGPORT=""
PSQL=()

cleanup() {
  if [[ -n "${CID:-}" ]] && command -v docker >/dev/null 2>&1; then
    docker rm -f "$CID" >/dev/null 2>&1 || true
  fi
  if [[ "$MODE" == "local" && -n "${DB_NAME:-}" ]]; then
    sudo -u postgres dropdb --if-exists "$DB_NAME" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

need() { command -v "$1" >/dev/null || { echo "FAIL: comando ausente: $1"; exit 1; }; }
need age
need age-keygen
need psql
HASH_CMD=(sha256sum)
command -v sha256sum >/dev/null 2>&1 || HASH_CMD=(shasum -a 256)

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  MODE="docker"
  PGPORT=55432
  echo "==> Postgres 17 efêmero (Docker)"
  CID="$(docker run -d --rm -e POSTGRES_PASSWORD=synth -e POSTGRES_DB=postgres -p ${PGPORT}:5432 postgres:17-alpine)"
  ready=0
  for _ in $(seq 1 30); do
    if docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" == "1" ]] || { echo "FAIL: docker postgres não ready"; exit 1; }
  PSQL=(env PGPASSWORD=synth psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
elif sudo -u postgres psql -Atq -c 'select 1' >/dev/null 2>&1; then
  MODE="local"
  DB_NAME="jinlong_restore_synth_$$"
  echo "==> Postgres local isolado (database $DB_NAME)"
  sudo -u postgres createdb "$DB_NAME"
  PSQL=(sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1)
else
  echo "SKIP: nem Docker nem Postgres local utilizável — procedimento documentado."
  echo "WORKDIR_WOULD_BE=$WORK"
  exit 0
fi

echo "==> Gerando chave age efêmera"
age-keygen -o "$WORK/key.txt" >/dev/null 2>&1
PUB="$(grep -E '^# public key:' "$WORK/key.txt" | awk '{print $NF}')"

echo "==> SQL sintético"
cat >"$WORK/schema.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.lojas (id uuid PRIMARY KEY, nome text NOT NULL);
CREATE TABLE IF NOT EXISTS public.produtos (id uuid PRIMARY KEY, loja_id uuid NOT NULL, nome text NOT NULL, preco numeric NOT NULL);
CREATE TABLE IF NOT EXISTS public.vendas (id uuid PRIMARY KEY, loja_id uuid NOT NULL, total_liquido numeric NOT NULL, status text NOT NULL);
SQL

LOJA="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"
PROD="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"
VENDA="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"

cat >"$WORK/data.sql" <<SQL
INSERT INTO public.lojas(id, nome) VALUES ('$LOJA', 'Loja Sintetica');
INSERT INTO public.produtos(id, loja_id, nome, preco) VALUES ('$PROD', '$LOJA', 'Produto Synth', 10.50);
INSERT INTO public.vendas(id, loja_id, total_liquido, status) VALUES ('$VENDA', '$LOJA', 10.50, 'CONCLUIDA');
SQL

echo "==> Cifrar + checksum"
mkdir -p "$WORK/enc"
age -r "$PUB" -o "$WORK/enc/schema.sql.age" "$WORK/schema.sql"
age -r "$PUB" -o "$WORK/enc/data.sql.age" "$WORK/data.sql"
( cd "$WORK/enc" && "${HASH_CMD[@]}" schema.sql.age data.sql.age > checksums.sha256 )
( cd "$WORK/enc" && "${HASH_CMD[@]}" -c checksums.sha256 )

echo "==> Decifrar e restaurar"
mkdir -p "$WORK/plain"
age -d -i "$WORK/key.txt" -o "$WORK/plain/schema.sql" "$WORK/enc/schema.sql.age"
age -d -i "$WORK/key.txt" -o "$WORK/plain/data.sql" "$WORK/enc/data.sql.age"
# Postgres peer (sudo -u postgres) precisa ler os arquivos do WORKDIR.
chmod -R a+rX "$WORK"
START=$(date +%s)
"${PSQL[@]}" \
  -f "$WORK/plain/schema.sql" \
  -c "SET session_replication_role = replica" \
  -f "$WORK/plain/data.sql"
END=$(date +%s)

COUNTS="$("${PSQL[@]}" -Atq -c \
  "SELECT json_build_object('lojas',(SELECT count(*) FROM lojas),'produtos',(SELECT count(*) FROM produtos),'vendas',(SELECT count(*) FROM vendas))")"

echo "MODE=$MODE"
echo "COUNTS=$COUNTS"
echo "RTO_SECONDS=$((END-START))"
# json_build_object pode emitir espaços após ':'
echo "$COUNTS" | grep -Eq '"lojas"[[:space:]]*:[[:space:]]*1'
echo "$COUNTS" | grep -Eq '"produtos"[[:space:]]*:[[:space:]]*1'
echo "$COUNTS" | grep -Eq '"vendas"[[:space:]]*:[[:space:]]*1'
echo "RESTORE_SYNTHETIC_LOCAL: PASS"
echo "LIMIT: não prova artifact de produção nem Storage."
