#!/usr/bin/env bash
# Roda o teste de RLS de funcionario_dados num banco local descartável.
set -euo pipefail
DB="fd_rls_$$"
cd "$(dirname "$0")/../supabase/tests"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -X -q -o /dev/null -d "$DB" -f funcionario_dados_rls.test.sql
echo "RLS funcionario_dados: OK"
