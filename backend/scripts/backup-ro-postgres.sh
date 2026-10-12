#!/usr/bin/env bash
# Prova sintetica: role de leitura nao faz dump completo sob RLS.
# Sem porta publicada, sem senha na linha de comando, sem rede remota.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="jinlong-backup-ro-src"
DST="jinlong-backup-ro-dst"
SQL="$ROOT/backend/scripts/sql"

discard() {
  docker rm -f jinlong-backup-ro-src jinlong-backup-ro-dst >/dev/null 2>&1 || true
  if [ -n "${WORK:-}" ]; then rm -rf "$WORK"; fi
}

if ! docker info >/dev/null 2>&1; then
  echo "IMPEDIMENTO: daemon Docker indisponivel."
  exit 2
fi
node "$ROOT/backend/scripts/fiscal-drill-plano.mjs" assert-env

WORK="$(mktemp -d "${TMPDIR:-/tmp}/jinlong-backup-ro.XXXXXX")"
trap discard EXIT

docker run -d --rm --name "$SRC" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$SRC" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

psql_owner() {
  docker exec -i "$SRC" psql -U postgres -v ON_ERROR_STOP=1 -d postgres < "$1" >/dev/null
}
psql_owner "$SQL/backup-ro-sintetico.sql"
docker exec "$SRC" pg_dump -U postgres --no-owner --schema=public -d postgres \
  | grep -v "CREATE SCHEMA public" | grep -v '\\restrict' | grep -v '\\unrestrict' > "$WORK/completo.sql"
psql_owner "$SQL/backup-ro-criar.sql"
docker exec -i "$SRC" psql -U postgres -d postgres -c "ALTER ROLE backup_ro SET app.loja_id = '00000000-0000-4000-8000-000000000001'" >/dev/null
psql_owner "$SQL/backup-ro-verificar.sql"

set +e
write_out="$(docker exec -i "$SRC" psql -U backup_ro -v ON_ERROR_STOP=1 -d postgres -c "INSERT INTO vendas VALUES ('00000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000001')" 2>&1)"
write_code=$?
set -e
if [ "$write_code" -eq 0 ] || ! printf '%s' "$write_out" | grep -q "permission denied"; then
  echo "escrita da role nao foi negada" >&2
  exit 1
fi

propria="$(docker exec "$SRC" psql -U backup_ro -tA -d postgres -c "SELECT count(*) FROM vendas")"
outra="$(printf '%s\n' "SELECT set_config('app.loja_id', '00000000-0000-4000-8000-000000000002', false);" "SELECT count(*) FROM vendas;" | docker exec -i "$SRC" psql -U backup_ro -tA -d postgres | tail -n 1)"
if [ "$propria" != "1" ] || [ "$outra" != "1" ]; then
  echo "RLS esperava 1 por loja e obteve propria=$propria outra=$outra" >&2
  exit 1
fi

set +e
blocked="$(docker exec "$SRC" pg_dump -U backup_ro -d postgres --schema=public 2>&1)"
blocked_code=$?
set -e
if [ "$blocked_code" -eq 0 ] || ! printf '%s' "$blocked" | grep -q "row-level security"; then
  echo "pg_dump sem row security nao foi bloqueado" >&2
  exit 1
fi

docker exec "$SRC" pg_dump -U backup_ro --enable-row-security --data-only --table=public.vendas -d postgres > "$WORK/restrito.sql"
restrito_n="$(awk 'BEGIN{c=0;n=0} /^COPY /{c=1;next} /^\\\./{c=0;next} c && $0 !~ /^$/ {n++} END{print n}' "$WORK/restrito.sql")"

docker run -d --rm --name "$DST" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$DST" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$DST" psql -U postgres -v ON_ERROR_STOP=1 -d postgres < "$WORK/completo.sql" >/dev/null
restaurado="$(docker exec "$DST" psql -U postgres -tA -d postgres -c "SELECT count(*) FROM vendas")"
fila="$(docker exec "$DST" psql -U postgres -tA -d postgres -c "SELECT count(*) FROM documentos_fiscais_pendentes")"
funcao="$(docker exec "$DST" psql -U postgres -tA -d postgres -c "SELECT to_regprocedure('public.fiscal_reprocessar_documento(uuid)') IS NOT NULL")"
if [ "$restrito_n" != "1" ] || [ "$restaurado" != "2" ] || [ "$fila" != "2" ] || [ "$funcao" != "t" ]; then
  echo "integridade inesperada restrito=$restrito_n restaurado=$restaurado fila=$fila funcao=$funcao" >&2
  exit 1
fi
docker exec "$DST" psql -U postgres -v ON_ERROR_STOP=1 -d postgres -c "TRUNCATE vendas CASCADE" >/dev/null 2>&1
docker exec -i "$DST" psql -U postgres -v ON_ERROR_STOP=1 -d postgres < "$WORK/restrito.sql" >/dev/null
parcial="$(docker exec "$DST" psql -U postgres -tA -d postgres -c "SELECT count(*) FROM vendas")"
if [ "$parcial" != "1" ]; then
  echo "restore restrito esperava 1 venda e obteve $parcial" >&2
  exit 1
fi

psql_owner "$SQL/backup-ro-revogar.sql"
set +e
gone="$(docker exec "$SRC" psql -U backup_ro -d postgres -c "SELECT 1" 2>&1)"
gone_code=$?
set -e
if [ "$gone_code" -eq 0 ]; then
  echo "role continuou conectando depois da revogacao" >&2
  exit 1
fi

srv="$(docker exec "$SRC" postgres --version)"
cli="$(docker exec "$SRC" pg_dump --version)"
echo "{\"select_loja_propria\":${propria},\"dump_restrito_linhas\":${restrito_n},\"restaurado_completo_vendas\":${restaurado},\"restaurado_completo_fila\":${fila},\"restaurado_restrito_vendas\":${parcial},\"funcao\":true,\"role_revogada\":true}"
echo "servidor=${srv}"
echo "cliente=${cli}"
echo "OK: role restrita nao substitui dump completo"
