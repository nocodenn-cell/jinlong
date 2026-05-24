#!/usr/bin/env bash
# Dragon UI Score — auditoria de conformidade visual
# Uso: bash scripts/dragon-ui-score.sh [caixa|gerente|all]
ZONE="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$ZONE" == "caixa" ]]; then
  DIRS="app/caixa components/caixa"
elif [[ "$ZONE" == "gerente" ]]; then
  DIRS="app/gerente components/gerente"
else
  DIRS="app/caixa app/gerente components/caixa components/gerente"
fi

cnt() {
  grep -rn "$1" $DIRS --include="*.tsx" --include="*.ts" 2>/dev/null \
    | grep -v "node_modules\|^\s*//" \
    | wc -l \
    | tr -d ' \n'
}

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
printf "║  DRAGON UI SCORE — %s              ║\n" "$(date '+%Y-%m-%d %H:%M')"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Zona: $ZONE · $DIRS"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

TOTAL_FILES=$(find $DIRS \( -name "*.tsx" -o -name "*.ts" \) 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' ')
echo "📁 Escopo: $TOTAL_FILES arquivos"
echo ""

# 1. TOKEN COMPLIANCE
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. TOKEN COMPLIANCE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

V_TEXT=$(cnt "text-gray-[3-9]\|text-slate-[3-9]\|text-zinc-[3-9]"); V_TEXT=${V_TEXT:-0}
V_BG=$(cnt "bg-slate-[89]\|bg-gray-[89]\|bg-zinc-[89]"); V_BG=${V_BG:-0}
V_BORDER=$(cnt "border-slate-[4-9]\|border-gray-[4-9]\|border-zinc-[4-9]"); V_BORDER=${V_BORDER:-0}
V_TOTAL=$(( V_TEXT + V_BG + V_BORDER ))
JL=$(cnt "jl-fg\|jl-surface\|jl-border\|jl-accent\|app-btn-accent\|app-btn-neutral\|app-btn-danger"); JL=${JL:-0}

if (( JL + V_TOTAL > 0 )); then
  TOKEN_SCORE=$(awk "BEGIN{printf \"%.1f\", $JL * 100 / ($JL + $V_TOTAL)}")
else
  TOKEN_SCORE="100.0"
fi

printf "  Violações text-*:   %d\n" "$V_TEXT"
printf "  Violações bg-*:     %d\n" "$V_BG"
printf "  Violações border-*: %d\n" "$V_BORDER"
printf "  Total violações:    %d\n" "$V_TOTAL"
printf "  Uso de tokens jl-:  %d\n" "$JL"
printf "  → Token Score:      %s%%\n" "$TOKEN_SCORE"
echo ""

# 2. INLINE STYLE RATIO
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. INLINE STYLE RATIO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

INLINE_TOTAL=$(cnt "style={{"); INLINE_TOTAL=${INLINE_TOTAL:-0}
INLINE_COLOR=$(cnt "style={{.*color\|style={{.*background"); INLINE_COLOR=${INLINE_COLOR:-0}

printf "  Total style={{:        %d\n" "$INLINE_TOTAL"
printf "  Com cor/background:    %d  (legado EstoqueAjusteModal ≈5)\n" "$INLINE_COLOR"
echo ""

# 3. COMPONENT DUPLICATION
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. COMPONENT DUPLICATION (tech debt — informativo)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DUP_LABEL=$(cnt "text-xs font-semibold uppercase tracking-wide"); DUP_LABEL=${DUP_LABEL:-0}
DUP_EMPTY=$(cnt "length === 0\|length < 1\|\.length &&\|!itens\|!items"); DUP_EMPTY=${DUP_EMPTY:-0}
DUP_BADGE=$(cnt "rounded-full border.*px-"); DUP_BADGE=${DUP_BADGE:-0}

printf "  SectionLabel ad-hoc:  %d  → migrar para <SectionLabel>\n" "$DUP_LABEL"
printf "  Empty-state ad-hoc:   %d  → migrar para <DragonEmptyState>\n" "$DUP_EMPTY"
printf "  Badge/chip ad-hoc:    %d  → migrar para <DragonStatusBadge>\n" "$DUP_BADGE"
echo ""

# 4. MEMO COVERAGE (caixa — onde importa)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. MEMO COVERAGE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MEMO_COUNT=$(grep -rln "= memo(" $DIRS --include="*.tsx" 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' '); MEMO_COUNT=${MEMO_COUNT:-0}
FUNC_COUNT=$(grep -rln "^export function\|export const.*= memo\|forwardRef" $DIRS --include="*.tsx" 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' '); FUNC_COUNT=${FUNC_COUNT:-1}
MEMO_PCT=$(awk "BEGIN{printf \"%d\", $MEMO_COUNT * 100 / $FUNC_COUNT}")

printf "  Componentes com memo:    %d / %d  (%d%%)\n" "$MEMO_COUNT" "$FUNC_COUNT" "$MEMO_PCT"
echo ""

# 5. RESPONSIVIDADE
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. RESPONSIVIDADE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FIXED_W=$(cnt "w-\[[0-9]*px\]\|min-w-\[[0-9]*px\]"); FIXED_W=${FIXED_W:-0}
printf "  Widths fixas em px:    %d\n" "$FIXED_W"
echo ""

# 6. ACESSIBILIDADE
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. ACESSIBILIDADE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ARIA_BUSY=$(cnt "aria-busy"); ARIA_BUSY=${ARIA_BUSY:-0}
ARIA_LABEL=$(cnt "aria-label\|aria-labelledby"); ARIA_LABEL=${ARIA_LABEL:-0}
ARIA_HIDDEN=$(cnt "aria-hidden"); ARIA_HIDDEN=${ARIA_HIDDEN:-0}

printf "  aria-busy (loading):   %d\n" "$ARIA_BUSY"
printf "  aria-label/labelledby: %d\n" "$ARIA_LABEL"
printf "  aria-hidden (ícones):  %d\n" "$ARIA_HIDDEN"
echo ""

# SCORE FINAL
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DRAGON UI SCORE FINAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PENALTY_TOKEN=$(( V_TOTAL * 2 ))
INLINE_PROD=$(( INLINE_COLOR > 5 ? INLINE_COLOR - 5 : 0 ))
PENALTY_INLINE=$(( INLINE_PROD * 3 ))
TOTAL_PENALTY=$(( PENALTY_TOKEN + PENALTY_INLINE ))
FINAL_SCORE=$(( 100 - TOTAL_PENALTY ))
[[ $FINAL_SCORE -lt 0 ]] && FINAL_SCORE=0

if   (( FINAL_SCORE >= 90 )); then GRADE="A ✅"
elif (( FINAL_SCORE >= 75 )); then GRADE="B 🟡"
elif (( FINAL_SCORE >= 60 )); then GRADE="C 🟠"
else                               GRADE="D 🔴"
fi

echo ""
printf "  Token violations (-2pt cada):         -%d\n" "$PENALTY_TOKEN"
printf "  Inline color prod (-3pt, legado -5):  -%d\n" "$PENALTY_INLINE"
printf "  SectionLabel duplication:              %d ocorrências (tech debt)\n" "$DUP_LABEL"
echo ""
echo "  ┌─────────────────────────────────────┐"
printf "  │  SCORE: %3d / 100   GRADE: %s  │\n" "$FINAL_SCORE" "$GRADE"
echo "  └─────────────────────────────────────┘"
echo ""

# TOP ARQUIVOS
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ARQUIVOS COM MAIS VIOLAÇÕES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -rn "text-gray-[3-9]\|text-slate-[3-9]\|bg-slate-[89]\|border-slate-[4-9]\|style={{.*color" \
  $DIRS --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|DevPanel\|page-old" \
  | cut -d: -f1 \
  | sort | uniq -c | sort -rn \
  | head -8 \
  | awk '{printf "  %3d  %s\n", $1, $2}' \
  || echo "  (nenhuma violação encontrada)"
echo ""
echo "  Próximo passo: /design-system fix <arquivo>"
echo "  Quando score >= 90: promover ESLint warn → error no .eslintrc.json"
