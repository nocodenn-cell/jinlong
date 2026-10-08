#!/usr/bin/env bash
# P0-02 — drill de restore com dados sintéticos (sem produção, sem PII).
# Uso: bash scripts/restore-synthetic-local.sh
# Requer: docker, age, psql, sha256sum (ou shasum -a 256).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/jinlong-restore-synth.XXXXXX")"
cleanup() {
  if [[ -n "${CID:-}" ]]; then docker rm -f "$CID" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker indisponível — procedimento documentado mas não executado neste ambiente."
  echo "WORKDIR_WOULD_BE=$WORK"
  exit 0
fi
command -v age >/dev/null
command -v psql >/dev/null
HASH_CMD=(sha256sum)
command -v sha256sum >/dev/null 2>&1 || HASH_CMD=(shasum -a 256)

echo "==> Gerando chave age efêmera"
age-keygen -o "$WORK/key.txt" >/dev/null 2>&1
PUB="$(grep -E '^# public key:' "$WORK/key.txt" | awk '{print $NF}')"
AGE_IDENTITY="$WORK/key.txt"

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

cat >"$WORK/manifest.json" <<JSON
{"lojas":1,"produtos":1,"vendas":1,"generated_at":"synthetic-local"}
JSON

echo "==> Cifrar + checksum"
mkdir -p "$WORK/enc"
age -r "$PUB" -o "$WORK/enc/schema.sql.age" "$WORK/schema.sql"
age -r "$PUB" -o "$WORK/enc/data.sql.age" "$WORK/data.sql"
( cd "$WORK/enc" && "${HASH_CMD[@]}" schema.sql.age data.sql.age > checksums.sha256 )
( cd "$WORK/enc" && "${HASH_CMD[@]}" -c checksums.sha256 )

echo "==> Postgres 17 efêmero"
CID="$(docker run -d --rm -e POSTGRES_PASSWORD=synth -e POSTGRES_DB=postgres -p 55432:5432 postgres:17-alpine)"
for i in $(seq 1 30); do
  if docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> Decifrar e restaurar"
mkdir -p "$WORK/plain"
age -d -i "$AGE_IDENTITY" -o "$WORK/plain/schema.sql" "$WORK/enc/schema.sql.age"
age -d -i "$AGE_IDENTITY" -o "$WORK/plain/data.sql" "$WORK/enc/data.sql.age"
START=$(date +%s)
PGPASSWORD=synth psql -h 127.0.0.1 -p 55432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$WORK/plain/schema.sql" \
  -c "SET session_replication_role = replica" \
  -f "$WORK/plain/data.sql"
END=$(date +%s)

COUNTS="$(PGPASSWORD=synth psql -h 127.0.0.1 -p 55432 -U postgres -d postgres -Atq -c \
  "SELECT json_build_object('lojas',(SELECT count(*) FROM lojas),'produtos',(SELECT count(*) FROM produtos),'vendas',(SELECT count(*) FROM vendas))")"

echo "COUNTS=$COUNTS"
echo "RTO_SECONDS=$((END-START))"
echo "$COUNTS" | grep -q '"lojas":1' && grep -q '"produtos":1' <<<"$COUNTS" && grep -q '"vendas":1' <<<"$COUNTS"
echo "RESTORE_SYNTHETIC_LOCAL: PASS"
echo "LIMIT: não prova artifact de produção nem Storage."
