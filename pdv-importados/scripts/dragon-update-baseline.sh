#!/usr/bin/env bash
# Atualiza o baseline após migração intencional de dívida visual.
# Uso: bash scripts/dragon-update-baseline.sh
# Requer confirmação explícita — nunca rodar automaticamente no CI.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CURRENT=$(bash scripts/dragon-ui-check.sh --json)
SCORE=$(echo "$CURRENT" | node -e "const d=require('/dev/stdin'); process.stdout.write(String(d.score))")
GRADE=$(echo "$CURRENT" | node -e "const d=require('/dev/stdin'); process.stdout.write(d.grade)")

echo ""
echo "Novo baseline a ser gravado:"
echo "$CURRENT" | node -e "
const d=require('/dev/stdin');
console.log(JSON.stringify({
  _comment: 'Baseline de violações Dragon UI — atualizado em $(date +%Y-%m-%d). Atualizar ao migrar dívida existente.',
  _howto: 'npm run dragon:check compara o estado atual contra estes valores e falha se AUMENTAR.',
  text_violations: d.text_violations,
  bg_violations: d.bg_violations,
  border_violations: d.border_violations,
  inline_color: d.inline_color,
  score: d.score,
  grade: d.grade
}, null, 2))"

echo ""
read -r -p "Confirmar atualização do baseline? [y/N] " reply
if [[ "$reply" =~ ^[Yy]$ ]]; then
  echo "$CURRENT" | node -e "
const d=require('/dev/stdin');
const fs=require('fs');
fs.writeFileSync('scripts/dragon-baseline.json', JSON.stringify({
  _comment: 'Baseline de violações Dragon UI — atualizado em $(date +%Y-%m-%d). Atualizar ao migrar dívida existente.',
  _howto: 'npm run dragon:check compara o estado atual contra estes valores e falha se AUMENTAR.',
  text_violations: d.text_violations,
  bg_violations: d.bg_violations,
  border_violations: d.border_violations,
  inline_color: d.inline_color,
  score: d.score,
  grade: d.grade
}, null, 2) + '\n');
console.log('✓ Baseline atualizado: scripts/dragon-baseline.json');
"
else
  echo "Cancelado."
fi
