#!/usr/bin/env bash
# Retry supabase start (ECR public rate limits on parallel CI jobs).
set -euo pipefail
cd backend
npx supabase --version
for attempt in 1 2 3 4; do
  if timeout 300s npx supabase start; then
    exit 0
  fi
  echo "supabase start attempt ${attempt} failed; waiting before retry..." >&2
  sleep $((attempt * 20))
  npx supabase stop --project-id fastproduct --no-backup 2>/dev/null || true
done
echo "::error::supabase start failed after 4 attempts" >&2
exit 1
