#!/usr/bin/env bash
# Drill sintético da janela fiscal em Postgres 17 descartável.
# Não publica porta, não cria rede e não lê variável com host remoto.
# Saída: contagens. Sem linha de documento.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="jinlong-fiscal-src"
DST="jinlong-fiscal-dst"
SQL_DIR="$ROOT/backend/scripts/sql"

discard() {
  docker rm -f jinlong-fiscal-src jinlong-fiscal-dst >/dev/null 2>&1 || true
  if [ -n "${WORK:-}" ]; then
    rm -rf "$WORK"
  fi
}

if ! docker info >/dev/null 2>&1; then
  echo "IMPEDIMENTO: daemon Docker indisponivel."
  echo "Comando posterior, com o daemon no ar e sem mudar a configuracao global:"
  echo "  bash backend/scripts/fiscal-janela-postgres.sh"
  exit 2
fi

node "$ROOT/backend/scripts/fiscal-drill-plano.mjs" assert-env
WORK="$(mktemp -d "${TMPDIR:-/tmp}/jinlong-fiscal-drill.XXXXXX")"
trap discard EXIT
node "$ROOT/backend/scripts/fiscal-drill-plano.mjs" emit "$WORK"

start_pg() {
  docker run -d --rm --name "$1" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -e POSTGRES_PASSWORD=drill-local \
    postgres:17-alpine >/dev/null
  local i=0
  while [ "$i" -lt 30 ]; do
    if docker exec "$1" pg_isready -U postgres >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "Postgres nao ficou pronto: $1" >&2
  exit 1
}

psql_file() {
  docker exec -i "$1" psql -U postgres -v ON_ERROR_STOP=1 -d postgres < "$2"
}

expect_fail() {
  local pattern="$1"
  local sql="$2"
  set +e
  local out
  out="$(docker exec -i "$TARGET" psql -U postgres -v ON_ERROR_STOP=1 -d postgres <<<"$sql" 2>&1)"
  local code=$?
  set -e
  if [ "$code" -eq 0 ] || ! printf '%s' "$out" | grep -q "$pattern"; then
    echo "prova falhou: $pattern" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
}

start_pg "$SRC"
psql_file "$SRC" "$SQL_DIR/fiscal-drill-schema.sql"
psql_file "$SRC" "$SQL_DIR/fiscal-drill-seed.sql"
psql_file "$SRC" "$WORK/20-historico.sql"
psql_file "$SRC" "$SQL_DIR/fiscal-drill-grants.sql"
psql_file "$SRC" "$SQL_DIR/fiscal-drill-precheck.sql"
docker exec "$SRC" pg_dump -U postgres --schema=public --no-owner --format=plain postgres > "$WORK/dump.sql"
grep -v -E '^(CREATE SCHEMA public;|\\restrict|\\unrestrict)' "$WORK/dump.sql" > "$WORK/dump.filtered.sql"

start_pg "$DST"
psql_file "$DST" "$SQL_DIR/fiscal-drill-roles.sql"
docker exec -i "$DST" psql -U postgres -v ON_ERROR_STOP=1 -d postgres < "$WORK/dump.filtered.sql" >/dev/null
TARGET="$DST"
psql_file "$TARGET" "$SQL_DIR/fiscal-drill-auth.sql"
psql_file "$TARGET" "$SQL_DIR/fiscal-drill-precheck.sql"
expect_fail "division by zero" "$(cat "$WORK/51-abort.sql")"
dead="$(docker exec -i "$TARGET" psql -U postgres -tA -d postgres -c "SELECT position('current_user <> ''postgres''' in pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure))")"
if [ "${dead// /}" -le 0 ]; then
  echo "rollback nao preservou o predicado antigo" >&2
  exit 1
fi

psql_file "$TARGET" "$WORK/50-bundle.sql"
psql_file "$TARGET" "$WORK/50-bundle.sql"

expect_fail "permission denied" "
SET SESSION AUTHORIZATION authenticator;
SET ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', false);
SELECT public.fiscal_reprocessar_documento('00000000-0000-4000-8000-000000000014');
"
expect_fail "FISCAL_REPROCESSO_LOJA" "
SET SESSION AUTHORIZATION authenticator;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.fiscal_reprocessar_documento('00000000-0000-4000-8000-000000000014');
"
expect_fail "FISCAL_REPROCESSO_PERFIL" "
SET SESSION AUTHORIZATION authenticator;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000015', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.fiscal_reprocessar_documento('00000000-0000-4000-8000-000000000014');
"

docker exec -i "$TARGET" psql -U postgres -v ON_ERROR_STOP=1 -d postgres <<'SQL'
SET SESSION AUTHORIZATION authenticator;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.fiscal_reprocessar_documento('00000000-0000-4000-8000-000000000014');
SQL

docker exec -i "$TARGET" psql -U postgres -v ON_ERROR_STOP=1 -d postgres <<'SQL'
UPDATE public.documentos_fiscais_pendentes
  SET status = 'EMITIDO' WHERE id = '00000000-0000-4000-8000-000000000014';
SQL

expect_fail "FISCAL_CANCELAR_LOJA" "
SET SESSION AUTHORIZATION authenticator;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.fiscal_cancelar_documento(
  p_documento_id := '00000000-0000-4000-8000-000000000014',
  p_justificativa := 'Cancelamento de teste local com mais de quinze caracteres'
);
"

docker exec -i "$TARGET" psql -U postgres -v ON_ERROR_STOP=1 -d postgres <<'SQL'
SET SESSION AUTHORIZATION authenticator;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.fiscal_cancelar_documento(
  p_documento_id := '00000000-0000-4000-8000-000000000014',
  p_justificativa := 'Cancelamento de teste local com mais de quinze caracteres'
);
SQL

expect_fail "FISCAL_ENQUEUE_PERMISSAO" "
SET SESSION AUTHORIZATION authenticator;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.fiscal_enfileirar_documento_venda(
  p_venda_id := '00000000-0000-4000-8000-000000000012',
  p_tipo_doc := 'NFCE',
  p_payload := '{}'::jsonb
);
"

docker exec -i "$TARGET" psql -U postgres -v ON_ERROR_STOP=1 -d postgres <<'SQL'
SET SESSION AUTHORIZATION authenticator;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000008', false);
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.fiscal_enfileirar_documento_venda(
  p_venda_id := '00000000-0000-4000-8000-000000000011',
  p_tipo_doc := 'NFCE',
  p_payload := '{}'::jsonb
);
SQL

fila="$(docker exec "$TARGET" psql -U postgres -tA -d postgres -c "SELECT count(*) FROM public.documentos_fiscais_pendentes")"
eventos="$(docker exec "$TARGET" psql -U postgres -tA -d postgres -c "SELECT count(*) FROM public.documentos_fiscais_eventos")"
funcoes="$(docker exec "$TARGET" psql -U postgres -tA -d postgres -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'fiscal\\_%'")"
inserts="$(docker exec "$TARGET" psql -U postgres -tA -d postgres -c "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'documentos_fiscais_pendentes' AND grantee = 'authenticated' AND privilege_type = 'INSERT'")"
echo "{\"fila\":${fila// /},\"eventos\":${eventos// /},\"funcoes_public\":${funcoes// /},\"insert_authenticated\":${inserts// /},\"anon_execute\":false}"
echo "OK: drill sintetico em postgres:17-alpine descartavel"
