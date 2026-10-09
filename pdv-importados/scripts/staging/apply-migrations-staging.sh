#!/usr/bin/env bash
# Aplica migrations do Git no projeto Supabase de STAGING (nunca produção).
# STG-01: este script RECUSA executar sem autorização explícita.
#
# Pré-requisitos:
#   - supabase CLI autenticado
#   - CAPACITY_ALLOWED_PROJECT_REF = ref do staging
#   - CAPACITY_BLOCKED_PROJECT_REFS = ref(s) de produção (não versionado)
#   - CAPACITY_CONFIRM_DB_PUSH=yes
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

echo "[apply-migrations-staging] validando alvo..."
node pdv-importados/scripts/staging/assert-staging-target.mjs

REF="${CAPACITY_ALLOWED_PROJECT_REF:-}"
if [[ -z "$REF" ]]; then
  echo "CAPACITY_ALLOWED_PROJECT_REF ausente" >&2
  exit 2
fi

BLOCKED="${CAPACITY_BLOCKED_PROJECT_REFS:-}"
if [[ -z "$BLOCKED" ]]; then
  echo "CAPACITY_BLOCKED_PROJECT_REFS ausente (informe o ref de produção)" >&2
  exit 2
fi

IFS=',' read -r -a BLOCKED_ARR <<< "$BLOCKED"
for b in "${BLOCKED_ARR[@]}"; do
  b_trim="$(echo "$b" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
  ref_l="$(echo "$REF" | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$b_trim" && "$ref_l" == "$b_trim" ]]; then
    echo "RECUSADO: CAPACITY_ALLOWED_PROJECT_REF está na denylist de produção" >&2
    exit 2
  fi
done

if [[ "${CAPACITY_CONFIRM_DB_PUSH:-}" != "yes" ]]; then
  echo "DRY-RUN / BLOQUEADO: defina CAPACITY_CONFIRM_DB_PUSH=yes para aplicar."
  echo "Comando que seria executado:"
  echo "  cd backend && npx supabase db push --project-ref \"$REF\""
  echo "  cd backend && npx supabase functions deploy sync-outbox --project-ref \"$REF\""
  echo "  cd backend && npx supabase functions deploy validar-gerente --project-ref \"$REF\""
  echo "  cd backend && npx supabase functions deploy fiscal-worker --project-ref \"$REF\""
  exit 0
fi

echo "[apply-migrations-staging] aplicando db push em staging (ref omitido do log)"
cd backend
npx supabase db push --project-ref "$REF"

echo "[apply-migrations-staging] deploy Edge Functions"
npx supabase functions deploy sync-outbox --project-ref "$REF"
npx supabase functions deploy validar-gerente --project-ref "$REF"
npx supabase functions deploy fiscal-worker --project-ref "$REF"

echo "[apply-migrations-staging] OK — rode seed com CAPACITY_CONFIRM_SEED=yes"
