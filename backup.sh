#!/usr/bin/env bash
set -euo pipefail

# Backup PostgreSQL em formato custom (-Fc)
# Requer variaveis de ambiente:
# PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
#
# Exemplo de uso:
# export PGHOST=localhost
# export PGPORT=5432
# export PGDATABASE=fastproduct
# export PGUSER=postgres
# export PGPASSWORD='SENHA'
# ./backup.sh

TS="$(date +"%Y%m%d_%H%M%S")"
OUT_DIR="${OUT_DIR:-/var/backups/fastproduct}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$OUT_DIR"

for var in PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERRO: variavel obrigatoria ausente: $var" >&2
    exit 1
  fi
done

OUT_FILE="$OUT_DIR/fastproduct_${TS}.dump"

echo "Iniciando backup em: $OUT_FILE"
pg_dump -Fc -f "$OUT_FILE"

echo "Aplicando retencao: removendo arquivos com mais de ${RETENTION_DAYS} dias"
find "$OUT_DIR" -type f -name "*.dump" -mtime +"$RETENTION_DAYS" -delete

echo "Backup concluido com sucesso: $OUT_FILE"
