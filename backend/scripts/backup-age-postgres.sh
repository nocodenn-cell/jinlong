#!/usr/bin/env bash
# pg_dump customizado em fluxo para age, sem dump em claro no disco.
# PostgreSQL 17 descartavel. Nao conecta em Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SQL="$ROOT/backend/scripts/sql/backup-ro-sintetico.sql"
SRC="jinlong-age-src"
DST="jinlong-age-dst"
FAIL="jinlong-age-fail"
PROBE="jinlong-age-probe"

discard() {
  docker rm -f "$SRC" "$DST" "$FAIL" "$PROBE" >/dev/null 2>&1 || true
  if [ -n "${WORK:-}" ]; then rm -rf "$WORK"; fi
}

copy_out() {
  local remote="$1" dest="$2"
  MSYS_NO_PATHCONV=1 docker cp "$remote" "$dest" >/dev/null
}

if ! docker info >/dev/null 2>&1; then
  echo "IMPEDIMENTO: daemon Docker indisponivel." >&2
  exit 2
fi
node "$ROOT/backend/scripts/fiscal-drill-plano.mjs" assert-env

umask 077
WORK="$(mktemp -d "${TMPDIR:-/tmp}/jinlong-age.XXXXXX")"
mkdir -p "$WORK/cipher" "$WORK/keys"
WIN_WORK="$(cd "$WORK" && pwd -W)"
export MSYS_NO_PATHCONV=1
: > "$WORK/log.txt"
trap discard EXIT

docker run -d --name "$FAIL" --entrypoint sleep postgres:17-alpine 60 >/dev/null
set +e
(
  set -e
  trap 'docker rm -f jinlong-age-fail >/dev/null 2>&1 || true' EXIT
  false
)
fail_code=$?
set -e
if [ "$fail_code" -eq 0 ]; then
  echo "falha intermediaria nao abortou" >&2
  exit 1
fi
if docker ps -a --format '{{.Names}}' | grep -qx "$FAIL"; then
  echo "limpeza da falha intermediaria nao removeu o container" >&2
  exit 1
fi

docker run -d --rm --name "$SRC" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$SRC" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
if ! docker exec "$SRC" apk add age >>"$WORK/log.txt" 2>&1; then
  echo "age indisponivel no container" >&2
  exit 1
fi
docker exec -i "$SRC" psql -U postgres -v ON_ERROR_STOP=1 -d postgres < "$SQL" >/dev/null
docker exec -i "$SRC" sh <<'EOS'
age-keygen -o /dev/shm/identity >/dev/shm/keygen.pub 2>&1
rm -f /dev/shm/keygen.pub
cat > /usr/local/bin/jinlong-age-encrypt <<'IN'
#!/bin/sh
set -eu
cd /dev/shm
age -r "$AGE_RECIPIENT" -o "$AGE_NAME"
IN
chmod +x /usr/local/bin/jinlong-age-encrypt
EOS
pub="$(docker exec -i "$SRC" sh <<'EOS'
age-keygen -y /dev/shm/identity
EOS
)"
pub="${pub//$'\r'/}"
pub="${pub//$'\n'/}"
if [ -z "$pub" ]; then
  echo "recipient ausente" >&2
  exit 1
fi

set +e
docker exec "$SRC" pg_dump -U postgres -Fc --schema=public banco_ausente 2>>"$WORK/log.txt" \
  | docker exec -i -e AGE_RECIPIENT="$pub" -e AGE_NAME=bad.age "$SRC" jinlong-age-encrypt 2>>"$WORK/log.txt"
pipe_code=$?
set -e
docker exec -i "$SRC" sh <<'EOS'
rm -f /dev/shm/bad.age
EOS
if [ "$pipe_code" -eq 0 ]; then
  echo "pipefail mascarou falha do pg_dump" >&2
  exit 1
fi

docker exec "$SRC" pg_dump -U postgres -Fc --no-owner --schema=public postgres \
  | docker exec -i -e AGE_RECIPIENT="$pub" -e AGE_NAME=backup.dump.age "$SRC" jinlong-age-encrypt
docker exec -i "$SRC" sh <<'EOS'
cp /dev/shm/backup.dump.age /tmp/backup.dump.age
EOS
copy_out "${SRC}:/tmp/backup.dump.age" "${WIN_WORK}/cipher/backup.dump.age"
docker exec -i "$SRC" sh <<'EOS'
rm -f /tmp/backup.dump.age
EOS
MSYS_NO_PATHCONV=1 docker exec "$SRC" sh -c 'cat /dev/shm/identity' > "$WORK/keys/identity"
chmod 600 "$WORK/keys/identity"
key_bytes="$(wc -c < "$WORK/keys/identity" | tr -d ' ')"
if [ "$key_bytes" -lt 80 ]; then
  echo "chave sintetica ausente" >&2
  exit 1
fi

header="$(head -c 21 "$WORK/cipher/backup.dump.age")"
magic="$(head -c 5 "$WORK/cipher/backup.dump.age")"
if [ "$header" != "age-encryption.org/v1" ] || [ "$magic" = "PGDMP" ]; then
  echo "artefato nao esta cifrado" >&2
  exit 1
fi
if grep -a -q "fiscal_reprocessar_documento" "$WORK/cipher/backup.dump.age"; then
  echo "sql em claro no artefato" >&2
  exit 1
fi
if find "$WORK" -type f \( -name '*.sql' -o -name '*.dump' -o -name '*.backup' \) | grep -q .; then
  echo "dump em claro persistido" >&2
  exit 1
fi
cipher_bytes="$(wc -c < "$WORK/cipher/backup.dump.age" | tr -d ' ')"
if [ "$cipher_bytes" -lt 200 ]; then
  echo "artefato curto demais" >&2
  exit 1
fi
cipher_sha="$(sha256sum "$WORK/cipher/backup.dump.age" | awk '{print $1}')"

node -e "const fs=require('fs'); const p=process.argv[1]; const b=fs.readFileSync(p); b[b.length-1]^=0xff; fs.writeFileSync(p+'.bad', b);" "${WIN_WORK}/cipher/backup.dump.age"
copy_out "${WIN_WORK}/cipher/backup.dump.age.bad" "${SRC}:/tmp/tampered.age"
if ! docker exec -i "$SRC" sh <<'EOS'
set +e
age-keygen -o /dev/shm/wrong >/dev/null 2>&1
age -d -i /dev/shm/wrong -o /dev/shm/rejected /dev/shm/backup.dump.age >/dev/null 2>&1
wrong=$?
age -d -i /dev/shm/identity -o /dev/shm/tampered-plain /tmp/tampered.age >/dev/null 2>&1
bad=$?
leaked=0
if grep -a -q "fiscal_reprocessar_documento" /dev/shm/rejected /dev/shm/tampered-plain 2>/dev/null; then
  leaked=1
fi
rm -f /dev/shm/wrong /dev/shm/rejected /dev/shm/tampered-plain /tmp/tampered.age
if [ "$wrong" -eq 0 ] || [ "$bad" -eq 0 ] || [ "$leaked" -eq 1 ]; then exit 1; fi
exit 0
EOS
then
  echo "teste negativo de chave ou adulteracao aceitou o arquivo" >&2
  exit 1
fi
rm -f "$WORK/cipher/backup.dump.age.bad"

src_fn="$(docker exec "$SRC" psql -U postgres -tA -d postgres -c "SELECT md5(pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure))")"
docker run -d --rm --name "$DST" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$DST" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
if ! docker exec "$DST" apk add age >>"$WORK/log.txt" 2>&1; then
  echo "age indisponivel no destino" >&2
  exit 1
fi
copy_out "${WIN_WORK}/cipher/backup.dump.age" "${DST}:/tmp/backup.dump.age"
MSYS_NO_PATHCONV=1 docker exec -i "$DST" sh -c 'cat > /dev/shm/identity && chmod 600 /dev/shm/identity' < "$WORK/keys/identity"
if ! docker exec -i "$DST" sh <<'EOS'
set -euo pipefail
psql -U postgres -v ON_ERROR_STOP=1 -d postgres -c "DROP SCHEMA public CASCADE;" >/dev/null
age -d -i /dev/shm/identity /tmp/backup.dump.age | pg_restore -U postgres -d postgres --exit-on-error >/tmp/restore.out 2>/tmp/restore.err
rm -f /dev/shm/identity /tmp/backup.dump.age /tmp/restore.out /tmp/restore.err
EOS
then
  echo "restore cifrado falhou" >&2
  exit 1
fi

counts="$(docker exec "$DST" psql -U postgres -tA -F ' ' -d postgres -c "SELECT (SELECT count(*) FROM lojas), (SELECT count(*) FROM vendas), (SELECT count(*) FROM documentos_fiscais_pendentes WHERE status = 'ERRO'), (SELECT to_regprocedure('public.fiscal_reprocessar_documento(uuid)') IS NOT NULL), (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'), (SELECT count(DISTINCT loja_id) FROM vendas);")"
counts="${counts//$'\r'/}"
read -r lojas vendas fila funcao policies lojas_distintas <<<"$counts"
dst_fn="$(docker exec "$DST" psql -U postgres -tA -d postgres -c "SELECT md5(pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure))")"
if [ "$lojas" != "2" ] || [ "$vendas" != "2" ] || [ "$fila" != "2" ] || [ "$funcao" != "t" ] || [ "$policies" != "2" ] || [ "$lojas_distintas" != "2" ] || [ "$src_fn" != "$dst_fn" ]; then
  echo "integridade inesperada" >&2
  exit 1
fi
if grep -a -q "AGE-SECRET-KEY" "$WORK/log.txt"; then
  echo "segredo no log" >&2
  exit 1
fi
if grep -a -q "AGE-SECRET-KEY" "$WORK/cipher/backup.dump.age"; then
  echo "chave no artefato" >&2
  exit 1
fi

age_version="$(docker exec "$SRC" age --version | tr -d '\r')"
pg_version="$(docker exec "$SRC" postgres -V | awk '{print $NF}')"
printf '%s\n' "{\"age\":\"${age_version}\",\"pg\":\"${pg_version}\",\"cipher_bytes\":${cipher_bytes},\"cipher_sha256\":\"${cipher_sha}\",\"plaintext_persisted\":false,\"pipefail_preservado\":true,\"chave_incorreta_negada\":true,\"adulterado_negado\":true,\"limpeza\":true,\"lojas\":${lojas},\"vendas\":${vendas},\"fila\":${fila},\"funcao_igual\":true,\"policies\":${policies},\"lojas_distintas\":${lojas_distintas},\"segredo_no_log\":false}"
echo "OK: pipeline age sem dump em claro"
