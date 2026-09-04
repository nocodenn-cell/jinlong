#!/bin/bash
# Pre-Deployment Checklist Script
# Usage: npm run pre-deploy:check (or ./scripts/pre-deploy-checklist.sh)
# Purpose: Validate all conditions before go-live deployment

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Helper functions
pass() {
  echo -e "${GREEN}✓ $1${NC}"
  ((PASS_COUNT++))
}

fail() {
  echo -e "${RED}✗ $1${NC}"
  ((FAIL_COUNT++))
}

warn() {
  echo -e "${YELLOW}⚠ $1${NC}"
  ((WARN_COUNT++))
}

# Title
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         PRE-DEPLOYMENT CHECKLIST — GO-LIVE P0                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 1. Code Quality
echo "📝 Code Quality Checks..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if npm run lint > /dev/null 2>&1; then
  pass "ESLint: 0 errors"
else
  fail "ESLint: errors found (run: npm run lint)"
fi

if npm run typecheck -w pdv-importados > /dev/null 2>&1; then
  pass "TypeScript: 0 errors"
else
  warn "TypeScript: check manually (edge function deno check may have network issues)"
fi

# 2. Tests
echo ""
echo "🧪 Test Validation..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_OUTPUT=$(npm run test 2>&1 | grep "Tests")
# TEST_RESULT_LABEL é string ("N passed") — nunca reusar PASS_COUNT aqui,
# que é o contador numérico incrementado por pass() via ((PASS_COUNT++));
# sobrescrevê-lo com texto quebra esse incremento no próximo pass().
if echo "$TEST_OUTPUT" | grep -qE '[0-9]+ passed' && ! echo "$TEST_OUTPUT" | grep -qE '[0-9]+ failed'; then
  TEST_RESULT_LABEL=$(echo "$TEST_OUTPUT" | grep -oE '[0-9]+ passed' | head -1)
  pass "Unit Tests: $TEST_RESULT_LABEL (nenhuma falha)"
else
  fail "Unit Tests: not all passing (run: npm run test)"
fi

# 3. Build
echo ""
echo "🏗️ Production Build..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if npm run build 2>&1 | grep -q "successfully"; then
  pass "Next.js Build: successful"
else
  fail "Next.js Build: failed (run: npm run build)"
fi

# 4. Security
echo ""
echo "🔒 Security Checks..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for hardcoded secrets (simple pattern matching)
if grep -r "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE" pdv-importados/src pdv-importados/app 2>/dev/null; then
  fail "Hardcoded service role key found (should be env only)"
else
  pass "No hardcoded service role keys"
fi

if grep -r "SYNC_KEY=" pdv-importados 2>/dev/null | grep -v "\.env" | grep -v "node_modules"; then
  fail "Hardcoded SYNC_KEY found"
else
  pass "No hardcoded SYNC_KEY"
fi

# Check .env.example for secrets
if grep -q "your-secret-here\|REPLACE_ME\|PLACEHOLDER" .env.example 2>/dev/null; then
  pass ".env.example contains placeholders (good)"
else
  warn ".env.example may expose real secrets (verify manually)"
fi

# 5. Git Status
echo ""
echo "📦 Repository Status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" == "main" ] || [ "$CURRENT_BRANCH" == "master" ]; then
  pass "On main branch: $CURRENT_BRANCH"
else
  warn "Not on main branch (current: $CURRENT_BRANCH) — merge before deploy"
fi

if [ -z "$(git status --porcelain)" ]; then
  pass "Working tree clean (no uncommitted changes)"
else
  fail "Uncommitted changes present (run: git status)"
fi

COMMITS_AHEAD=$(git rev-list --count @{u}.. 2>/dev/null || echo "0")
if [ "$COMMITS_AHEAD" -eq 0 ]; then
  pass "Up to date with remote"
else
  fail "$COMMITS_AHEAD commits ahead of remote (push before deploy)"
fi

# 6. Environment
echo ""
echo "🌍 Environment Setup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  pass "NEXT_PUBLIC_SUPABASE_URL configured"
else
  warn "NEXT_PUBLIC_SUPABASE_URL not in current shell (check Vercel project settings)"
fi

if [ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  pass "NEXT_PUBLIC_SUPABASE_ANON_KEY configured"
else
  warn "NEXT_PUBLIC_SUPABASE_ANON_KEY not in current shell (check Vercel project settings)"
fi

# 7. Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    CHECKLIST SUMMARY                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✓ Passed${NC}: $PASS_COUNT"
echo -e "${RED}✗ Failed${NC}: $FAIL_COUNT"
echo -e "${YELLOW}⚠ Warnings${NC}: $WARN_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✓ Ready for deployment!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Verify Vercel project settings (env vars)"
  echo "  2. Run: git push origin main"
  echo "  3. Monitor: https://vercel.com/jinlong/pdv-importados/deployments"
  echo "  4. Execute: docs/GO-LIVE-RUNBOOK.md (Smoke Tests)"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Deployment blocked by failures${NC}"
  echo ""
  echo "Fix issues above, then re-run this script."
  echo ""
  exit 1
fi
