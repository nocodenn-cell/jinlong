# ⛔ DESATUALIZADO — GO-LIVE RUNBOOK (P0 Production Deployment)

> # ⛔ DESATUALIZADO — Consulte [`docs/go-live/00-README.md`](./go-live/00-README.md) para o plano atual
>
> **Depreciado em 2026-08-17.** A fonte canônica do plano de Go-Live passa a ser
> **[`docs/go-live/`](./go-live/00-README.md)**. Este arquivo é preservado como registro histórico e
> pelas seções que ainda não foram portadas (ver abaixo). **Não executar os procedimentos deste
> documento.**
>
> ## Por que foi depreciado — não é só idade
>
> | # | Problema | Correto hoje |
> |---|---|---|
> | 1 | 🔴 **O procedimento de rollback é perigoso.** Manda reverter/`--force-with-lease` a `main`, ou seja, **reverter só a aplicação** | Com as migrations do bloco financeiro, reverter só a app recria "banco novo + app antiga" — **falha fechada de AR/AP para toda a base** (§11.6 da certificação). Ver [07-go-live-day.md](./go-live/07-go-live-day.md) §4 |
> | 2 | ❌ **URL de produção errada** — usa `https://fastproduct.vercel.app` | A produção canônica é **`https://pdv-importados.vercel.app`** |
> | 3 | ❌ **Resposta do health check errada** — espera `{"ok": true}` | `app/api/health/route.ts` retorna `{ deploymentId, gitSha, timestamp }`; o gate SSRA é a **igualdade do `deploymentId`** com o da plataforma |
> | 4 | ❌ **Pressupõe staging** ("E2E Critical Path (Staging)") | **Não existe staging** — um único projeto Supabase serve produção, Preview e E2E |
> | 5 | ⚠️ **Não conhece as 30 migrations pendentes** nem a coordenação obrigatória banco↔app | Ver [03-deploy-backend.md](./go-live/03-deploy-backend.md) |
>
> ## ✅ Depreciação COMPLETA — todo o conteúdo útil foi portado
>
> Em 2026-08-17 as seções que ainda não tinham equivalente foram migradas para `docs/go-live/`,
> **com os 5 problemas acima corrigidos**. Este arquivo não é mais fonte de nada.
>
> | Seção original | Onde está agora |
> |---|---|
> | Smoke Tests 1–7 | [`06-validacao-pre-go-live.md`](./go-live/06-validacao-pre-go-live.md) §3.1 |
> | Verificação do Sentry | [`08-pos-go-live.md`](./go-live/08-pos-go-live.md) §2.6 |
> | Alert Thresholds | [`08-pos-go-live.md`](./go-live/08-pos-go-live.md) §2.7 |
> | Post-Launch Monitoring (24h) | [`08-pos-go-live.md`](./go-live/08-pos-go-live.md) §1.1 |
> | Escalation & Contacts | [`08-pos-go-live.md`](./go-live/08-pos-go-live.md) §6 |
> | Post-Mortem | [`08-pos-go-live.md`](./go-live/08-pos-go-live.md) §7 |
> | Pre-Deployment / Deployment / Health Check | [`03`](./go-live/03-deploy-backend.md) · [`04`](./go-live/04-deploy-frontend.md) · [`07`](./go-live/07-go-live-day.md) |
> | Rollback Procedure | [`07-go-live-day.md`](./go-live/07-go-live-day.md) §4 — ⚠️ **reescrito**, o original era perigoso |
>
> **Mantido apenas como registro histórico.** Não consultar para execução.

**Version**: 1.0 · **Last Updated**: Jul 23, 2026 · **Status**: ⛔ **DEPRECIADO em 2026-08-17**

**Mission** (histórico): Deploy fastproduct to production with zero data loss, verified operations, and rollback capability.

---

## 📋 Pre-Deployment Checklist (T-1h)

Run these validations before initiating deployment:

```bash
# 1. Code Quality
npm run lint      # ✅ 0 errors (pre-existing warnings acceptable)
npm run typecheck # ✅ 0 errors (ignore deno network timeouts in remote env)
npm run test      # ✅ 737/737 passing

# 2. Production Build
npm run build     # ✅ pdv-importados builds successfully (~2-3min)
# Verify output: "Successfully built application"

# 3. Security Scan
npm audit --production  # ⚠️ Known vulns acceptable if low-risk test deps

# 4. E2E Critical Path (Staging)
npm run test:e2e:critical  # ✅ 3/3 suites pass (requires env setup)
# Or if env not available, verify locally:
npx playwright test e2e/caixa-venda.spec.ts        # ~90s
npx playwright test e2e/caixa-fluxos-criticos.spec.ts # ~60s
# npx playwright test e2e/sync-fluxo-gerente.spec.ts  # ~45s (requires sync env)
```

**Decision Gate**: If any check fails → **DO NOT DEPLOY**. Fix in staging first.

---

## 🚀 Deployment Procedure (T-0)

### Automatic (Recommended)

Vercel auto-deploys from GitHub on push to `main`:

```bash
# 1. Ensure feature branch is merged to main
git log main --oneline -1
# Expected: Latest feature commit from Fase 4

# 2. Vercel auto-triggers deployment
# Monitor: https://vercel.com/jinlong/pdv-importados/deployments
# Expected duration: 2-3 minutes
# Status to reach: "Ready" (green checkmark)
```

### Manual (If Needed)

```bash
# If Vercel doesn't auto-trigger, manually redeploy:
# 1. Go to https://vercel.com/jinlong/pdv-importados
# 2. Click "Deployments" tab
# 3. Find latest commit
# 4. Click "..." menu → "Redeploy"
# 5. Confirm
```

---

## ✅ Post-Deployment Health Check (T+2min)

**Run immediately after Vercel shows "Ready":**

```bash
# 1. API Health
curl https://fastproduct.vercel.app/api/health
# Expected response: HTTP 200, {"ok": true}

# 2. Check Vercel deployment status
# https://vercel.com/jinlong/pdv-importados/deployments
# Status: READY ✅

# 3. Check Sentry integration
# https://sentry.io/projects/fastproduct/
# Verify: Source maps loaded (stack traces are readable, not minified)
# Verify: No spike in error rate (should be ~0 errors if just deployed)

# If health check fails: ROLLBACK (see below)
```

---

## 🔥 Smoke Tests (T+5min) — Execute All 7 Tests

**Total Time**: 24 minutes. Stop and rollback if any test fails.

### Test 1: Operador Login (3min)

**Steps**:
1. Open https://fastproduct.vercel.app in browser
2. Click "Entrar" or login link
3. Enter: `PLAYWRIGHT_CAIXA_TEST_EMAIL` + `PLAYWRIGHT_CAIXA_TEST_PASSWORD`
4. Click "Entrar"
5. Verify: You see `/caixa` route, dashboard loads

**Expected**: Operador dashboard visible, no errors in browser console  
**Screenshot**: ✅ Take one for evidence  
**If Fails**: 🔴 CRITICAL → ROLLBACK

---

### Test 2: Product Search & Add (5min)

**Prerequisites**: Operador logged in, on `/caixa`

**Steps**:
1. Locate search/scanner input (top of page)
2. Enter barcode: `7898512340003` (or custom from `PLAYWRIGHT_E2E_PRODUTO_CODIGO`)
3. Press Enter
4. Wait for status message (2-5s)
5. Verify message contains "adicionad" / "added" (not "não encontrado")
6. Verify product appears in cart with price (R$ X.XX)

**Expected**: Item in cart, correct price, status success  
**Screenshot**: ✅ Product in cart  
**If Fails**: 🔴 CRITICAL (product lookup broken) → ROLLBACK

---

### Test 3: Sale Finalization (5min)

**Prerequisites**: Product in cart, operador logged in

**Steps**:
1. Click "Finalizar venda" or "Checkout" button
2. Select payment method (DINHEIRO recommended for first sale)
3. Click "Confirmar" or "Pagar"
4. Wait for response (10-20s)
5. Verify status message: "Venda registrada" / "Venda concluída"
6. Verify cupom displays with sale total and items

**Expected**: Venda registered, cupom visible, status success  
**Screenshot**: ✅ Sale confirmation  
**If Fails**: 🔴 CRITICAL (sale registration broken) → ROLLBACK

---

### Test 4: Gerente Dashboard (3min)

**Steps**:
1. From operador, click logout (top-right menu)
2. Wait for redirect to login
3. Login with: `PLAYWRIGHT_TEST_EMAIL` + `PLAYWRIGHT_TEST_PASSWORD`
4. Navigate to `/gerente` or manager dashboard
5. Look for "Últimas Vendas" or activity feed
6. Verify the sale from Test 3 appears in list
7. Check timestamp is recent (within 1-2 minutes of finalization)

**Expected**: Sale visible in gerente dashboard with recent timestamp  
**Screenshot**: ✅ Sale in activity feed  
**If Fails**: 🟡 WARN (sync delayed but may recover) → Wait 5min, retry

---

### Test 5: Cash Register Open (5min)

**Prerequisites**: Operador logged in

**Steps**:
1. Logout gerente, re-login as operador
2. Go to `/caixa`
3. Click "Operações" → "Abrir Caixa" (or similar menu)
4. Enter initial amount: R$ 100.00
5. Click "Confirmar"
6. Verify status: "Caixa aberto" or header shows "Saldo estimado"
7. Verify amount displayed matches input

**Expected**: Caixa session open, balance visible  
**Screenshot**: ✅ Caixa open with balance  
**If Fails**: 🟡 WARN (session state issue) → Check Sentry for errors

---

### Test 6: Sentry Dashboard (2min)

**Steps**:
1. Open https://sentry.io → your fastproduct project
2. Click "Issues" tab
3. Verify: No new critical issues (green or minimal alerts)
4. Click "Events" feed → Recent events should be login/init events (not errors)
5. Sample a stack trace: Verify it shows file:line (not minified)

**Expected**: Zero unexpected issues, readable stack traces  
**Decision**: If errors spike (> 10 new issues) → Investigate before proceeding

---

### Test 7: Vercel Analytics (1min)

**Steps**:
1. Open https://vercel.com → pdv-importados project
2. Click "Analytics" tab
3. Verify: Pageload time < 3s (LCP metric)
4. Verify: No 5xx errors in error rate graph
5. Verify: Traffic spike is expected (if launching to users)

**Expected**: Fast page loads, no server errors  
**Decision**: If errors > 1%, investigate

---

## 📊 Smoke Test Results

| Test | Status | Notes | Decision |
|------|--------|-------|----------|
| 1. Login | ✅ / 🔴 | | |
| 2. Product Search | ✅ / 🔴 | | |
| 3. Sale Finalization | ✅ / 🔴 | | |
| 4. Sync Visibility | ✅ / 🟡 | | |
| 5. Caixa Open | ✅ / 🟡 | | |
| 6. Sentry | ✅ / 🟡 | | |
| 7. Vercel Analytics | ✅ / 🟡 | | |

**Result**: 
- [ ] All Green ✅ → **GO-LIVE SUCCESSFUL** 🎉
- [ ] Any Red 🔴 → **INITIATE ROLLBACK** (see below)
- [ ] Multiple Yellow 🟡 → Monitor for 5min, then decide

---

## 🔄 Rollback Procedure

**Trigger**: Any 🔴 CRITICAL test failure (auth, sale, sync)

### Step 1: Revert Commit

```bash
# On your local machine with git push access
git log --oneline -5  # Identify last good commit

# Revert approach (keeps history, preferred)
git revert -n HEAD
git commit -m "fix(rollback): revert unstable deploy"
git push origin main

# Or force reset (if revert has conflicts)
git reset --hard <last-known-good-commit>
git push --force-with-lease origin main
```

### Step 2: Monitor Vercel Redeploy

- Go to https://vercel.com/jinlong/pdv-importados/deployments
- Wait for new deployment to reach "Ready" (~2-3min)
- Status should change from "Building" → "Ready" (green)

### Step 3: Verify Rollback Worked

```bash
curl https://fastproduct.vercel.app/api/health
# Should return: {"ok": true}

# Then re-run Smoke Test 1 (Login only)
# If login works → rollback successful
```

### Step 4: Notify Team

**Slack #incidents**:
```
🚨 ROLLBACK INITIATED
Reason: [describe which test failed]
Previous commit: [hash]
Reverted to: [hash]
Status: Waiting for Vercel redeploy (~2min)
ETA: [time]
```

### Step 5: Post-Mortem

Once rollback verified:
1. Create GitHub issue with "rollback" tag
2. Document what failed and why
3. Schedule fix-forward investigation
4. Plan redeployment once fix validated in staging

---

## 📈 Post-Launch Monitoring (24h)

### Continuous Monitoring (Automate if Possible)

**Every 30 minutes**:
- Check Sentry error rate (should stay < 1%)
- Check Vercel pageload time (should stay < 3s)
- Spot-check 1-2 smoke tests (manual or automated)

**Hourly**:
- Review Sentry exceptions (grouping, frequency)
- Check sync lag (gerente should see sales within 2min)

**Daily**:
- Gather operador feedback
- Review performance metrics
- Plan any hotfixes

### Alert Thresholds

| Metric | Yellow 🟡 | Red 🔴 |
|--------|-----------|--------|
| Sentry Error Rate | > 0.5% | > 2% |
| Vercel Pageload | > 2s | > 4s |
| Sync Lag | > 3min | > 5min |
| Auth Failures | > 10/hr | > 50/hr |
| RPC Timeouts | > 5/hr | > 20/hr |

**Action**:
- Yellow → Alert team, investigate
- Red → Page on-call engineer, prepare rollback decision

---

## 🎯 Success Criteria

✅ **Go-Live Successful If:**
1. All 7 smoke tests PASS (or 🟡 yellow with explanation)
2. Sentry shows zero unexpected critical exceptions
3. Vercel health check passing
4. Sync working (gerente sees sales < 2min)
5. Operadors report normal operation
6. No data loss detected (verify in Supabase)

❌ **Go-Live Failed If:**
1. Any CRITICAL test fails (🔴 auth, sale, sync)
2. Uncontrolled error rate (> 10 errors/min)
3. Data corruption or loss
4. Security breach detected

---

## 📞 Escalation & Contacts

### On-Call Rotation
- **Tech Lead**: [Name] — Slack @tech-lead — +55-11-XXXX-XXXX
- **DevOps**: [Name] — Slack @devops — +55-11-XXXX-XXXX
- **Product**: [Name] — Slack @product — +55-11-XXXX-XXXX

### Escalation Path
```
Issue detected
    ↓ (5min)
Tech Lead investigates
    ├→ Minor issue → Log, plan fix
    ├→ Major but fixable → Hotfix + redeploy
    └→ Critical / data loss → ROLLBACK + notify CEO
```

---

## 📝 Sign-Off & Notes

**Pre-Deployment Review**:
- [ ] Tech Lead reviewed runbook
- [ ] Rollback procedures tested (documented)
- [ ] Contact list updated
- [ ] Slack #incidents channel ready
- [ ] Status page prepared

**Post-Deployment**:
- [ ] All smoke tests documented
- [ ] Issues logged (if any)
- [ ] Operador feedback collected
- [ ] Next review scheduled (24h)

---

## Appendix: Environment Variables Checklist

Verify in Vercel project settings before deploy:

- [ ] `NEXT_PUBLIC_SUPABASE_URL` → set to production Supabase URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` → set to production anon key
- [ ] `SENTRY_ORG` → set to Sentry org name
- [ ] `SENTRY_PROJECT` → set to Sentry project slug
- [ ] `SENTRY_AUTH_TOKEN` → set (if source maps uploaded via CI)
- [ ] No secrets in `NEXT_PUBLIC_*` → verify with `npm audit`

---

## Appendix: Rollback Checklist Template

Copy & paste into Slack / Notion:

```
[ ] T-1h: Pre-deployment checklist (lint, test, build)
[ ] T-0: Deploy initiated (monitor Vercel)
[ ] T+2min: Health check (curl /api/health)
[ ] T+5min: Smoke tests (7 tests, all pass?)
[ ] T+30min: Decision (GO or ROLLBACK?)

[ ] T+30min+: Begin 24h monitoring
[ ] T+24h: First daily standup (review Sentry, performance)
[ ] T+7d: Week-1 retrospective
```

---

**Ready to go live! 🚀**  
*Last review: Jul 23, 2026*  
*Next deployment: [Date/Time]*
