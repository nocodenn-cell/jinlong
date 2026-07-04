#!/bin/bash
set -e

# VALIDATION: Single Source of Truth for Domain Types
# Ensures each domain concept exists in exactly ONE location
# This script WILL FAIL if the same type is defined in multiple places

DOMAIN_TYPES=(
  "StatusPublicacao"
  "ProdutoOrigem"
  "OrigemProduto"
  "UnidadeMedida"
  "CadastroData"
  "ContextoApp"
)

VIOLATION_FOUND=0

for type in "${DOMAIN_TYPES[@]}"; do
  # Find all definitions of this type (not just imports/re-exports)
  # Look for: export type X = or export interface X {
  definitions=$(grep -r "^export.*type.*${type}\s*[=|{]\|^export.*interface.*${type}\s*{" \
    --include="*.ts" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.next \
    . 2>/dev/null | wc -l)

  if [ "$definitions" -ne 1 ]; then
    echo "❌ VIOLATION: '${type}' has $definitions definitions (should be 1)"
    echo "   Found at:"
    grep -r "^export.*type.*${type}\s*[=|{]\|^export.*interface.*${type}\s*{" \
      --include="*.ts" --include="*.tsx" \
      --exclude-dir=node_modules --exclude-dir=.next \
      . 2>/dev/null | sed 's/^/   /'
    VIOLATION_FOUND=1
  else
    echo "✓ $type: Single source of truth"
  fi
done

if [ $VIOLATION_FOUND -eq 1 ]; then
  echo ""
  echo "🛑 FAIL: Domain types violate single source of truth rule"
  exit 1
fi

echo ""
echo "✅ PASS: All domain types have single source of truth"
exit 0
