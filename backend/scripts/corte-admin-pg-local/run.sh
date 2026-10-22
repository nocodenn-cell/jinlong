#!/usr/bin/env bash
# Teste de banco ISOLADO (Postgres local descartável, dados sintéticos). Nunca aponta para Supabase remoto.
# Uso: PG_BIN=/usr/lib/postgresql/17/bin backend/scripts/corte-admin-pg-local/run.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; M="$DIR/../../supabase/migrations"
export PATH="${PG_BIN:-/usr/lib/postgresql/17/bin}:$PATH"
D="$(mktemp -d)"; PORT="${PORT:-54331}"
initdb -D "$D" -U postgres -A trust >/dev/null
pg_ctl -D "$D" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
trap 'pg_ctl -D "$D" -m fast stop >/dev/null; rm -rf "$D"' EXIT
P="psql -h $D -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database t"
$P -d t -f "$DIR/stubs.sql"
# helpers reais da fase 1/2 (só as funções usadas aqui)
for f in fp_lojas_permitidas fp_pode_loja; do
  awk "/CREATE OR REPLACE FUNCTION public.$f\\(/,/^\\\$\\\$;/" "$M/20261019120000_multiempresa_fase1_base.sql"
done | $P -d t
for f in fp_admin_legado fp_usuario_pode_loja; do
  awk "/CREATE OR REPLACE FUNCTION public.$f\\(/,/^\\\$\\\$;/" "$M/20261019140000_multiempresa_fase2_guardas.sql"
done | $P -d t
$P -d t -f "$DIR/seed.sql"
$P -d t -f "$M/20261022120000_sec_token_gerente_loja_nula_fora_da_loja.sql"
$P -d t -f "$DIR/antes.sql"
$P -d t -f "$M/20261022130000_corte_admin_papeis.sql"
OUT="$($P -d t -f "$DIR/test.sql")"; echo "$OUT"
! echo "$OUT" | grep -q FALHOU
