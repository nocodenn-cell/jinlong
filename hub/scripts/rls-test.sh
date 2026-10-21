#!/usr/bin/env bash
# Prova de RLS do hub comercial num Postgres descartável (stub mínimo de auth.* do Supabase).
# Uso: PGURL=postgres://... bash hub/scripts/rls-test.sh   (o banco deve estar vazio/descartável)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
: "${PGURL:?PGURL obrigatório (banco descartável)}"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/test/auth_stub.sql"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/20261021115705_nature_code_commercial_hub.sql"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/test/rls_test.sql"
echo "RLS OK"
