#!/usr/bin/env bash
# Restore drill: restaura roles.sql + schema.sql + data.sql (supabase db dump) em um
# Postgres DESCARTÁVEL (nunca produção) e imprime as contagens por tabela de public.
#
# Pontos que o drill de 2026-10-08 provou necessários:
#  1. Constraints CHECK "NOT VALID" continuam validando linhas novas, inclusive via COPY.
#     Linhas legadas que as violam derrubam o restore. As constraints NOT VALID são
#     removidas antes da carga e recriadas como NOT VALID depois (mesmo estado de origem).
#  2. auth/storage de um Postgres local podem ser mais antigos que o de produção:
#     só public + auth.users + auth.identities são carregados (filter-data-dump.mjs).
#
# Uso: PSQL="psql -h 127.0.0.1 -U supabase_admin -d postgres" restore-drill.sh <dir-com-sql>
set -euo pipefail

DIR="${1:?diretório com roles.sql, schema.sql e data.sql}"
PSQL="${PSQL:?defina PSQL com a conexão do banco DESCARTÁVEL}"
HERE="$(cd "$(dirname "$0")" && pwd)"
NV_TABLE="public._restore_notvalid_defs"

[ "${SKIP_FILTER:-0}" = 1 ] || node "$HERE/filter-data-dump.mjs" "$DIR/data.sql" "$DIR/data.filtered.sql"

$PSQL -v ON_ERROR_STOP=1 -q -f "$DIR/roles.sql" -f "$DIR/schema.sql"

$PSQL -v ON_ERROR_STOP=1 -q <<SQL
CREATE TABLE $NV_TABLE AS
SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE contype = 'c' AND NOT convalidated
  AND connamespace = 'public'::regnamespace;
DO \$\$
DECLARE r record;
BEGIN
  FOR r IN SELECT tbl, conname FROM $NV_TABLE LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END \$\$;
SQL

PGOPTIONS='-c session_replication_role=replica' \
  $PSQL -v ON_ERROR_STOP=1 -q --single-transaction -f "$DIR/data.filtered.sql"

$PSQL -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
DECLARE r record;
BEGIN
  FOR r IN SELECT tbl, conname, def FROM $NV_TABLE LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, r.def);
  END LOOP;
END \$\$;
DROP TABLE $NV_TABLE;
SQL

$PSQL -Atq -c "SELECT string_agg(table_name || '=' || (xpath('/row/c/text()',
  query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text,
  ',' ORDER BY table_name) || '|auth_users=' || (SELECT count(*) FROM auth.users)
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
