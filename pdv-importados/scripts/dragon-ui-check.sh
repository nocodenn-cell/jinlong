#!/usr/bin/env bash
# Dragon UI CI Gate — delta enforcement (debt existente ≠ nova regressão)
# Falha se violações AUMENTARAM vs baseline. Nunca bloqueia dívida já existente.
# Uso: bash scripts/dragon-ui-check.sh [--json] [--score-only]
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASELINE_FILE="scripts/dragon-baseline.json"
DIRS="app/caixa app/gerente components/caixa components/gerente"
JSON_MODE=0
SCORE_ONLY=0
for arg in "$@"; do
  [[ "$arg" == "--json" ]] && JSON_MODE=1
  [[ "$arg" == "--score-only" ]] && SCORE_ONLY=1
done

# ── helpers ──────────────────────────────────────────────────────────────────
cnt() {
  grep -rn "$1" $DIRS --include="*.tsx" --include="*.ts" 2>/dev/null \
    | grep -v "node_modules\|^\s*//" \
    | wc -l \
    | tr -d ' \n'
}

baseline_val() {
  node -e "const b=require('./$BASELINE_FILE'); process.stdout.write(String(b['$1']||0))"
}

# ── compute current counts ────────────────────────────────────────────────────
V_TEXT=$(cnt "text-gray-[3-9]\|text-slate-[3-9]\|text-zinc-[3-9]"); V_TEXT=${V_TEXT:-0}
V_BG=$(cnt "bg-slate-[89]\|bg-gray-[89]\|bg-zinc-[89]"); V_BG=${V_BG:-0}
V_BORDER=$(cnt "border-slate-[4-9]\|border-gray-[4-9]\|border-zinc-[4-9]"); V_BORDER=${V_BORDER:-0}
INLINE_COLOR=$(cnt "style={{.*color\|style={{.*background"); INLINE_COLOR=${INLINE_COLOR:-0}
V_TOTAL=$(( V_TEXT + V_BG + V_BORDER ))

JL=$(cnt "jl-fg\|jl-surface\|jl-border\|jl-accent\|app-btn-accent\|app-btn-neutral\|app-btn-danger"); JL=${JL:-0}
if (( JL + V_TOTAL > 0 )); then
  TOKEN_SCORE=$(awk "BEGIN{printf \"%.1f\", $JL * 100 / ($JL + $V_TOTAL)}")
else
  TOKEN_SCORE="100.0"
fi

INLINE_PROD=$(( INLINE_COLOR > 5 ? INLINE_COLOR - 5 : 0 ))
PENALTY=$(( V_TOTAL * 2 + INLINE_PROD * 3 ))
SCORE=$(( 100 - PENALTY ))
[[ $SCORE -lt 0 ]] && SCORE=0

if (( SCORE >= 90 )); then GRADE="A"; elif (( SCORE >= 75 )); then GRADE="B"; elif (( SCORE >= 60 )); then GRADE="C"; else GRADE="D"; fi

# ── score-only mode ───────────────────────────────────────────────────────────
if [[ $SCORE_ONLY -eq 1 ]]; then
  echo "$SCORE"
  exit 0
fi

# ── compare against baseline ──────────────────────────────────────────────────
B_TEXT=$(baseline_val text_violations)
B_BG=$(baseline_val bg_violations)
B_BORDER=$(baseline_val border_violations)
B_INLINE=$(baseline_val inline_color)
B_SCORE=$(baseline_val score)

FAIL=0
MESSAGES=()

check_delta() {
  local label="$1" current="$2" baseline="$3"
  local delta=$(( current - baseline ))
  if (( delta > 0 )); then
    MESSAGES+=("REGRESS $label: $baseline → $current (+$delta novas violações)")
    FAIL=1
  fi
}

check_delta "text_violations" "$V_TEXT" "$B_TEXT"
check_delta "bg_violations"   "$V_BG"  "$B_BG"
check_delta "border_violations" "$V_BORDER" "$B_BORDER"
check_delta "inline_color"    "$INLINE_COLOR" "$B_INLINE"

# Score can only go up — block if it drops more than 5 points
SCORE_DELTA=$(( SCORE - B_SCORE ))
if (( SCORE_DELTA < -5 )); then
  MESSAGES+=("REGRESS score: $B_SCORE → $SCORE (queda de $(( -SCORE_DELTA )) pontos)")
  FAIL=1
fi

# ── output ────────────────────────────────────────────────────────────────────
if [[ $JSON_MODE -eq 1 ]]; then
  cat <<EOF
{
  "score": $SCORE,
  "grade": "$GRADE",
  "text_violations": $V_TEXT,
  "bg_violations": $V_BG,
  "border_violations": $V_BORDER,
  "inline_color": $INLINE_COLOR,
  "token_score_pct": $TOKEN_SCORE,
  "passed": $(( FAIL == 0 ? 1 : 0 ))
}
EOF
else
  echo ""
  echo "Dragon UI Gate ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "  Score atual:   %d/100 (Grade %s)\n" "$SCORE" "$GRADE"
  printf "  Baseline:      %d/100\n" "$B_SCORE"
  printf "  Text viol:     %d (baseline %d)\n" "$V_TEXT" "$B_TEXT"
  printf "  BG viol:       %d (baseline %d)\n" "$V_BG" "$B_BG"
  printf "  Border viol:   %d (baseline %d)\n" "$V_BORDER" "$B_BORDER"
  printf "  Inline color:  %d (baseline %d)\n" "$INLINE_COLOR" "$B_INLINE"
  echo ""

  if [[ $FAIL -eq 1 ]]; then
    echo "  ✗ FALHOU — novas regressões detectadas:"
    for msg in "${MESSAGES[@]}"; do
      echo "    • $msg"
    done
    echo ""
    echo "  Corrija com: npm run dragon:fix -- <arquivo>"
    echo "  Ref tokens:  docs/design-system/tokens.md"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
  else
    echo "  ✓ PASSOU — nenhuma regressão vs baseline"
    if (( SCORE > B_SCORE )); then
      echo "  ★ Score melhorou! Considere atualizar o baseline: npm run dragon:baseline"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  fi
fi
