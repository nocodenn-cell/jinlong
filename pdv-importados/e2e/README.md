# E2E Tests — Playwright Critical Path & Setup Guide

## Quick Start (Local Development)

```bash
# Prerequisites: .env.local must exist in pdv-importados/
# See .env.example for template
cp .env.example .env.local

# Start dev server (in parallel terminal)
npm run dev

# Run a single E2E suite
npx playwright test e2e/caixa-venda.spec.ts

# Run all E2E tests (requires full environment setup)
npm run test:e2e:critical
```

## Critical Path Tests (Go-Live P0)

These three tests MUST pass before deployment. They validate core PDV operations and sync infrastructure.

### 1. **caixa-venda.spec.ts** — Sale Finalization
- **What**: Operador searches product by barcode, adds to cart, finalizes sale
- **Validates**: Scanner input, product lookup, payment flow, sale registration
- **Duration**: ~90s
- **Env Required**: `PLAYWRIGHT_CAIXA_TEST_EMAIL`, `PLAYWRIGHT_CAIXA_TEST_PASSWORD`

```bash
npx playwright test e2e/caixa-venda.spec.ts
```

### 2. **caixa-fluxos-criticos.spec.ts** — Open → Withdraw → Close
- **What**: Full cash register cycle (abrir caixa → sangria → fechar)
- **Validates**: Cash session state management, manual adjustments, closure logic
- **Duration**: ~60s
- **Env Required**: Same as above

```bash
npx playwright test e2e/caixa-fluxos-criticos.spec.ts
```

### 3. **sync-fluxo-gerente.spec.ts** — Desktop→Web Sync
- **What**: Simulates desktop app (pdv-local) sending sale event to web via HMAC signature
- **Validates**: Sync architecture, HMAC authentication, RPC event processing, manager visibility
- **Duration**: ~45s
- **Env Required**: All of the above + `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_ENDPOINT`, `SYNC_KEY`

```bash
npx playwright test e2e/sync-fluxo-gerente.spec.ts
```

## Environment Variables

### For Local Development (`.env.local`)

```env
# Supabase Public (required for auth flows)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Testing — Operador Account (caixa flows)
PLAYWRIGHT_CAIXA_TEST_EMAIL=operador@lojamatriz.test
PLAYWRIGHT_CAIXA_TEST_PASSWORD=secure_password_here

# Testing — Gerente Account (optional, for /gerente routes)
PLAYWRIGHT_TEST_EMAIL=gerente@lojamatriz.test
PLAYWRIGHT_TEST_PASSWORD=secure_password_here

# Sync Testing (advanced; needed for sync-fluxo-gerente.spec.ts)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Service role (DO NOT expose in CI)
SYNC_ENDPOINT=https://xxx.supabase.co/functions/v1/sync-outbox
SYNC_KEY=your-sync-hmac-secret-here
```

### For CI/CD (GitHub Secrets)

- `PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `PLAYWRIGHT_CAIXA_TEST_EMAIL`
- `PLAYWRIGHT_CAIXA_TEST_PASSWORD`
- `PLAYWRIGHT_TEST_EMAIL` (optional)
- `PLAYWRIGHT_TEST_PASSWORD` (optional)
- `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`
- `PLAYWRIGHT_SYNC_ENDPOINT` → `SYNC_ENDPOINT`
- `PLAYWRIGHT_SYNC_KEY` → `SYNC_KEY`

## Test Accounts & Credentials

Tests use dedicated credentials to:
1. Avoid conflicts with production data
2. Maintain consistent permissions (OPERADOR vs GERENTE roles)
3. Allow parallel test execution without race conditions

### Operador (Cashier)
- Role: Can operate cash register (`/caixa`)
- Cannot access: `/admin`, `/gerente` (middleware redirects)
- Used by: `caixa-venda.spec.ts`, `caixa-fluxos-criticos.spec.ts`

### Gerente (Manager)
- Role: Can access manager dashboard (`/gerente`), some admin functions
- Used by: `sync-fluxo-gerente.spec.ts` (for visibility after sync)

## Running E2E Tests

### Local (No CI)
```bash
# All critical path tests (respects PLAYWRIGHT_* env vars)
npm run test:e2e:critical

# Single suite
npx playwright test e2e/caixa-venda.spec.ts

# With UI mode (debug)
npx playwright test --ui

# With trace (inspect on failure)
npx playwright test --trace on
```

### CI/CD (GitHub Actions)
- Environment vars injected via GitHub Secrets (prefixed with `PLAYWRIGHT_`)
- Playwright config maps `PLAYWRIGHT_*` → actual env vars
- Retries: 2 times on failure
- Reporter: GitHub (inline annotations)
- Trace: Collected on first retry, available as artifacts

## Troubleshooting

### Test Skipped: "Defina PLAYWRIGHT_CAIXA_TEST_EMAIL / PASSWORD"
- Local: Copy `.env.example` to `.env.local`, fill in credentials
- CI: Add GitHub Secrets per "Environment Variables" section above

### Test Fails: "Produto não encontrado"
- Ensure seed migration `027_seed_produtos_demo_importados_zh.sql` ran
- Or set `PLAYWRIGHT_E2E_PRODUTO_CODIGO=YOUR_BARCODE`

### Test Hangs or Timeout
- Ensure dev server is running: `npm run dev`
- Check `PLAYWRIGHT_BASE_URL` (defaults to `http://localhost:3000`)
- Increase timeout in `.env`: `PLAYWRIGHT_TEST_PORT=3009` for isolated runner

### Trace Not Saving
- Playwright config uses `trace: on-first-retry`
- Traces saved to `.playwright/traces/` after test runs

## Test Data & Cleanup

- **Operador credentials**: Not deleted; reused across test runs
- **Test products**: Created with `E2E-SYNC-{timestamp}` prefix; no automatic cleanup
- **Sales**: Recorded in database; manual cleanup via Supabase console if needed

## Performance Expectations

| Test | Typical Duration | Max Duration | Environment |
|------|------------------|--------------|-------------|
| caixa-venda | ~60s | 90s | Operador only |
| caixa-fluxos-criticos | ~40s | 70s | Operador only |
| sync-fluxo-gerente | ~30s | 45s | Full sync env |

## Post-Deployment Smoke Tests

See `Phase 5 (Go-Live)` runbook for post-deployment smoke test checklist. Critical path:
1. ✅ Login (operador + gerente roles)
2. ✅ Simple sale + checkout
3. ✅ Sync visible in manager dashboard
4. ✅ Cash register open/close cycle

## Architecture & Design Notes

### Why Separate Test Credentials?
- Operador account ensures tests don't pollute manager dashboard
- OPERADOR role has minimal permissions (cash register only)
- Allows parallel test execution without auth conflicts

### HMAC Signature in sync-fluxo-gerente.spec.ts
- Desktop app (pdv-local) signs requests with `SYNC_KEY`
- Web app validates: `HMAC-SHA256(SYNC_KEY, timestamp.nonce.payload)`
- This test validates the signature flow without needing a real desktop app

### Why Environment-Based Test Skip?
- Allows partial test runs (e.g., caixa-venda works without sync env)
- CI enforces ALL env vars present to prevent false-green builds
- Local dev can skip advanced tests while developing basic flows
