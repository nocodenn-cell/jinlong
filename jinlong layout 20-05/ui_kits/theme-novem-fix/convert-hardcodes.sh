#!/usr/bin/env bash
# ============================================================
# convert-hardcodes.sh
# ============================================================
# Find-and-replace dos hardcodes Tailwind para tokens jl-* nos
# componentes existentes do gerente. Idempotente — pode rodar
# várias vezes.
#
# Use depois de aplicar o `tailwind.config.js` atualizado.
#
# Uso:
#   cd pdv-importados
#   bash ../ui_kits/theme-novem-fix/convert-hardcodes.sh
#
# Roda `sed -i ''` (macOS BSD). Em Linux use `sed -i` sem aspas.
# ============================================================

set -e

# Escopo: app/gerente/** + components/gerente/**
SCOPE="app/gerente components/gerente"

# OS-agnostic in-place sed
SED_INPLACE=( -i )
if [[ "$OSTYPE" == "darwin"* ]]; then SED_INPLACE=( -i '' ); fi

# Lista de substituições — pares "before|after"
declare -a PAIRS=(
  # Backgrounds slate hardcoded → tokens
  's|bg-slate-950/55|bg-jl-surface-soft|g'
  's|bg-slate-950/45|bg-jl-surface-soft/85|g'
  's|bg-slate-950/40|bg-jl-surface-soft/70|g'
  's|bg-slate-950/65|bg-jl-surface|g'
  's|bg-slate-950/80|bg-jl-surface|g'
  's|bg-slate-900/55|bg-jl-surface|g'
  's|bg-slate-900/45|bg-jl-surface/85|g'
  's|bg-slate-900/42|bg-jl-surface/80|g'
  's|bg-slate-900/62|bg-jl-surface|g'

  # Textos slate → fg-*
  's|text-slate-50\b|text-jl-fg-1|g'
  's|text-slate-100\b|text-jl-fg-1|g'
  's|text-slate-200\b|text-jl-fg-1|g'
  's|text-slate-300\b|text-jl-fg-2|g'
  's|text-slate-400\b|text-jl-fg-3|g'
  's|text-slate-500\b|text-jl-fg-3|g'

  # Borders slate → border-1
  's|border-slate-700/40|border-jl-border-1|g'
  's|border-slate-700/50|border-jl-border-strong|g'
  's|border-slate-800/40|border-jl-border-1|g'

  # Amber → accent
  's|text-amber-400\b|text-jl-accent|g'
  's|text-amber-300\b|text-jl-accent-strong|g'
  's|bg-amber-400/15|bg-jl-accent/15|g'
  's|bg-amber-400/10|bg-jl-accent/10|g'
  's|border-amber-400/40|border-jl-accent/40|g'
  's|border-amber-400/45|border-jl-accent/45|g'
)

count=0
for pair in "${PAIRS[@]}"; do
  files=$(grep -rlE "$(echo "$pair" | sed -E 's|^s\|([^|]+)\|.*|\1|')" $SCOPE 2>/dev/null || true)
  if [[ -n "$files" ]]; then
    n=$(echo "$files" | wc -l | tr -d ' ')
    count=$((count + n))
    echo "$pair → $n arquivos"
    echo "$files" | xargs sed "${SED_INPLACE[@]}" "$pair"
  fi
done

echo ""
echo "Concluído. Total de aplicações: $count substituições em arquivos."
echo ""
echo "Próximos passos:"
echo "  1. pnpm typecheck"
echo "  2. pnpm dev — alterne data-app-theme entre noturno/novem"
echo "  3. Smoke test (cole no console em /gerente):"
echo "     ['noturno','novem'].forEach((t,i) => setTimeout(() => {"
echo "       document.documentElement.dataset.appTheme = t;"
echo "       console.log(t, getComputedStyle(document.body).backgroundColor);"
echo "     }, i*1500))"
