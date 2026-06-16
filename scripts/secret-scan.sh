#!/usr/bin/env bash
# Scan determinístico de segredos com gitleaks — MESMO comando em CI e local (1:1).
#
# Uso:
#   scripts/secret-scan.sh <BASE_REF> <HEAD_REF>   # escaneia BASE..HEAD (dois pontos)
#   scripts/secret-scan.sh                          # default: origin/main..HEAD
#
# Contrato de saída (sempre exatamente um estado):
#   exit 0  -> "RESULT: NO LEAKS FOUND"
#   exit 1  -> "RESULT: LEAKS FOUND" (lista explícita acima)
#   exit !=0,1 -> "RESULT: GITLEAKS ERROR" (falha de execução, NUNCA silenciosa)
#
# Decisões estruturais (anti-falso-positivo):
#   - Range com DOIS pontos (BASE..HEAD): apenas commits introduzidos por HEAD e
#     ausentes de BASE. Três pontos (BASE...HEAD) reescaneia commits só-da-base
#     quando a base diverge -> falso positivo por histórico antigo.
#   - Sem SARIF/artifact: o stdout do gitleaks é a única fonte de verdade.
set -euo pipefail

GITLEAKS_VERSION="8.21.2"
BASE_REF="${1:-origin/main}"
HEAD_REF="${2:-HEAD}"
RANGE="${BASE_REF}..${HEAD_REF}"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "ERRO: gitleaks não encontrado no PATH." >&2
  echo "Instale a v${GITLEAKS_VERSION}: https://github.com/gitleaks/gitleaks/releases/tag/v${GITLEAKS_VERSION}" >&2
  exit 127
fi

echo "--- Gitleaks context ---"
echo "gitleaks     = $(gitleaks version 2>/dev/null || echo '?')"
echo "event range  = ${RANGE} (dois pontos)"
echo "commits no range:"
git --no-pager log --oneline "${RANGE}" || true
echo "n commits    = $(git rev-list --count "${RANGE}" 2>/dev/null || echo '?')"
echo "------------------------"

echo "=== SCAN STARTED ==="
set +e
gitleaks detect \
  --source=. \
  --config=.gitleaks.toml \
  --log-opts="${RANGE}" \
  --redact \
  --verbose \
  --no-banner
CODE=$?
set -e
echo "=== SCAN COMPLETED (gitleaks exit=${CODE}) ==="

case "${CODE}" in
  0) echo "=== RESULT: NO LEAKS FOUND ===" ;;
  1) echo "=== RESULT: LEAKS FOUND (ver findings acima) ===" ;;
  *) echo "=== RESULT: GITLEAKS ERROR (exit=${CODE}; não é resultado de leak) ===" ;;
esac

exit "${CODE}"
