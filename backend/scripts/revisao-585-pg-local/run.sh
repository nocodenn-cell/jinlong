#!/usr/bin/env bash
# Teste de banco ISOLADO (Postgres local descartável, dados sintéticos). Nunca aponta para Supabase remoto.
# Uso: PG_BIN=/usr/lib/postgresql/17/bin backend/scripts/revisao-585-pg-local/run.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; M="$DIR/../../supabase/migrations"
export PATH="${PG_BIN:-/usr/lib/postgresql/17/bin}:$PATH"
D="$(mktemp -d)"; PORT="${PORT:-54329}"
initdb -D "$D" -U postgres -A trust >/dev/null
pg_ctl -D "$D" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
trap 'pg_ctl -D "$D" -m fast stop >/dev/null; rm -rf "$D"' EXIT
P="psql -h $D -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database t"
$P -d t -f "$DIR/stubs.sql"
PGOPTIONS='-c check_function_bodies=off' $P -d t -f "$M/20261020100000_cobranca_planos_trial.sql"
(sed -n '/^BEGIN;/,/^COMMIT;/p' "$M/20260916120000_sec04_token_gerente_vinculo_loja_v4.sql" | awk '/CREATE OR REPLACE FUNCTION public.finalizar/{exit} {print}'; echo 'COMMIT;') | $P -d t
$P -d t -f "$M/20261028100000_sec_token_gerente_loja_nula_fora_da_loja.sql"
$P -d t -f "$M/20261028101000_cobranca_correcoes_revisao_585.sql"
OUT="$($P -d t -f "$DIR/test.sql")"; echo "$OUT"
! echo "$OUT" | grep -q FALHOU
