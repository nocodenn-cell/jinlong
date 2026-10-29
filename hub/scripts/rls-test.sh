#!/usr/bin/env bash
# Prova de RLS do hub comercial num Postgres descartável (stub mínimo de auth.* do Supabase).
# Uso: PGURL=postgres://... bash hub/scripts/rls-test.sh   (o banco deve estar vazio/descartável)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$DIR/../backend/supabase/migrations"
: "${PGURL:?PGURL obrigatório (banco descartável)}"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/test/auth_stub.sql"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/20261021115705_nature_code_commercial_hub.sql"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/test/rls_test.sql"
echo "RLS hub OK"
# GROWTH-001 · Central de Conversão: stub do ERP + migration + regras de conversão manual
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/test/erp_stub.sql"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$MIG/20261023130100_growth001_central_conversao.sql"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/test/central_conversao_test.sql"
echo "Central de Conversão OK"
