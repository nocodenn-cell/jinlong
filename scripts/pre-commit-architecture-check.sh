#!/bin/bash
# PRE-COMMIT ARCHITECTURE CHECK
#
# This script validates that code meets architectural requirements before committing.
# Can be installed as a git pre-commit hook:
#   ln -s ../../scripts/pre-commit-architecture-check.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Or run manually before committing:
#   bash scripts/pre-commit-architecture-check.sh

set -e

echo "🔍 Running architecture validation checks..."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CHECKS_FAILED=0

# Check 1: Domain type uniqueness
echo "1️⃣  Validating domain type uniqueness..."
if npm run validate:arch:types 2>&1 | grep -q "FAIL\|VIOLATION"; then
  echo -e "${RED}❌ Domain type validation failed${NC}"
  CHECKS_FAILED=$((CHECKS_FAILED + 1))
else
  echo -e "${GREEN}✓ Domain types OK${NC}"
fi
echo ""

# Check 2: Import direction
echo "2️⃣  Validating import direction rules..."
if npm run validate:arch:direction 2>&1 | grep -q "FAIL\|VIOLATION"; then
  echo -e "${RED}❌ Import direction validation failed${NC}"
  CHECKS_FAILED=$((CHECKS_FAILED + 1))
else
  echo -e "${GREEN}✓ Import direction OK${NC}"
fi
echo ""

# Check 3: Multi-path symbols
echo "3️⃣  Detecting multi-path symbols..."
if npm run validate:arch:multipaths 2>&1 | grep -q "FAIL\|VIOLATION"; then
  echo -e "${RED}❌ Multi-path symbol validation failed${NC}"
  CHECKS_FAILED=$((CHECKS_FAILED + 1))
else
  echo -e "${GREEN}✓ Multi-path symbols OK${NC}"
fi
echo ""

if [ $CHECKS_FAILED -gt 0 ]; then
  echo -e "${RED}🛑 ARCHITECTURE CHECK FAILED${NC}"
  echo ""
  echo "Fix the violations above and try again."
  echo ""
  echo "To bypass (NOT RECOMMENDED):"
  echo "  git commit --no-verify"
  exit 1
fi

echo -e "${GREEN}✅ All architecture checks passed${NC}"
exit 0
