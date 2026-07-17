#!/usr/bin/env bash
# bootstrap-determinism-check.sh — Frente 7 (Database Integrity Hardening).
#
# Prova que o bootstrap das migrations é DETERMINÍSTICO e AUTO-SUFICIENTE:
# aplica TODAS as migrations (em ordem lexicográfica, a mesma do Supabase CLI) em
# DOIS bancos limpos e independentes, e compara os dumps de schema. Se forem
# idênticos, duas instalações independentes convergem ao mesmo schema usando
# apenas o repositório (sem estado manual).
#
# Requisitos: um servidor PostgreSQL local acessível como superusuário e o
# bootstrap-shim.sql deste diretório (camada de compatibilidade Supabase).
#
# Uso:
#   PSQL="psql -U postgres" ./bootstrap-determinism-check.sh
#   (ou ajuste PSQL/PGDUMP para o seu ambiente)
#
# Saída: "OK — determinístico" (exit 0) ou o diff das diferenças (exit 1).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIG_DIR="${MIG_DIR:-$HERE/../migrations}"
SHIM="$HERE/bootstrap-shim.sql"
PSQL="${PSQL:-psql -U postgres}"
PGDUMP="${PGDUMP:-pg_dump}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Cópias com pg_cron/pg_net neutralizados (extensões providas só pela imagem
# Supabase; o shim fornece stubs — não afeta ordem/determinismo).
mkdir -p "$WORK/mig"
cp "$MIG_DIR"/*.sql "$WORK/mig/"
sed -i -E 's/^(.*create extension.*pg_(cron|net).*)$/-- [determinism-shim] \1/I' "$WORK/mig"/*.sql
chmod -R a+rX "$WORK"  # permite leitura quando psql roda como outro usuário (ex.: sudo -u postgres)

apply() {
  local db="$1"
  $PSQL -X -q -c "DROP DATABASE IF EXISTS $db;" >/dev/null
  $PSQL -X -q -c "CREATE DATABASE $db;" >/dev/null
  $PSQL -v ON_ERROR_STOP=1 -X -q -d "$db" -f "$SHIM" >/dev/null
  local n=0
  for f in $(ls "$WORK/mig"/*.sql | sort); do
    if ! $PSQL -v ON_ERROR_STOP=1 -X -q -d "$db" -f "$f" >"$WORK/${db}_err.log" 2>&1; then
      echo "FALHA em $(basename "$f") (após $n migrations):" >&2
      grep -iE 'ERROR|FATAL' "$WORK/${db}_err.log" | head -3 >&2
      return 1
    fi
    n=$((n+1))
  done
  echo "$db: $n migrations aplicadas" >&2
}

apply detdb_a
apply detdb_b

# Dump de schema (inclui grants; remove nonce de sessão \restrict do pg_dump 16+)
$PGDUMP -s --no-owner -d detdb_a 2>/dev/null | grep -vE '^--|^$|^\\(un)?restrict ' > "$WORK/a.sql"
$PGDUMP -s --no-owner -d detdb_b 2>/dev/null | grep -vE '^--|^$|^\\(un)?restrict ' > "$WORK/b.sql"

if diff -q "$WORK/a.sql" "$WORK/b.sql" >/dev/null; then
  echo "OK — bootstrap determinístico: 2 instalações independentes = schema idêntico ($(wc -l < "$WORK/a.sql") linhas)."
  $PSQL -X -q -d detdb_a -tAc "select '  tabelas='||count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
  exit 0
else
  echo "FALHA — schemas divergem entre instalações independentes:"
  diff "$WORK/a.sql" "$WORK/b.sql" | head -60
  exit 1
fi
