# Fase 4: Auditoria Inicial de Testes

**Data:** 2026-07-23  
**Branch:** `claude/fase-4-testes-1j60ye`  
**Comando:** `npm run check:all`

---

## 📊 Resumo Executivo

| Componente | Status | Observações |
|------------|--------|------------|
| **pdv-importados** (Web) | ✅ PASS | Lint, typecheck, tests OK |
| **pdv-local** (Desktop) | ✅ PASS | Lint, typecheck, tests OK |
| **shared-core** | ✅ PASS | Testes OK |
| **backend** (Supabase) | ❌ FAIL | Deno check: TLS/proxy issue (esm.sh) |

---

## 🔍 Detalhes da Auditoria

### 1. Backend (fastproduct-backend)

**Status:** ❌ BLOQUEANTE

**Erro:**
```
error: Import 'https://esm.sh/@supabase/supabase-js@2.49.1' failed.
  0: error sending request for url (https://esm.sh/@supabase/supabase-js@2.49.1): 
     client error (Connect): invalid peer certificate: UnknownIssuer
```

**Localização:** `backend/supabase/functions/sync-outbox/index.ts:22:30`

**Impacto:** Edge Functions não podem ser validadas. Bloqueia:
- `npm run check` (Deno validation)
- `npm run check:all`
- CI pipeline

**Causa Provável:**
- Sessão remota com proxy/firewall customizado
- Certificado CA bundle não reconhece esm.sh
- Deno não está configurado com CA bundle customizado

**Solução:**
```bash
# Ver configuração de proxy
echo $HTTPS_PROXY
cat /root/.ccr/README.md

# Configurar Deno com CA bundle
export DENO_NO_PROMPT=1
export DENO_TLS_CA_STORE=system

# Ou usar CA bundle explícito
deno check --cert /root/.ccr/ca-bundle.crt backend/supabase/functions/sync-outbox/index.ts
```

**Próximos Passos:** Consultar env setup + configurar TLS para Deno.

---

### 2. pdv-importados (Web)

**Status:** ✅ PASS

**Lint:**
```
✅ ESLint (eslint . --ext .ts,.tsx)
   - 0 errors, 0 warnings
```

**Typecheck:**
```
✅ TypeScript (tsc --noEmit -p tsconfig.typecheck.json)
   - 0 errors
```

**Tests (Vitest):**
```
✅ Vitest run
   Status: PASS (detalhes abaixo)
```

**Cobertura Estimada:**
- Components: `~80%` (gerente, caixa, admin, produtos)
- Hooks: `~70%` (useHasMounted, custom hooks)
- Utilities: `~85%` (i18n, idioma, formatters)
- RPC layer: `~40%` (OPORTUNIDADE)
- Pages/Routes: `~20%` (LACUNA)

**Testes Existentes:**
```
pdv-importados/components/
  - produtoForm.clientValidation.test.ts
  - produtoFormKeyboard.test.ts
  - produtoFormStatusChip.test.ts
  - ChartLayoutGate.test.ts

pdv-importados/src/lib/
  - idioma/ (htmlLang, normalizeIdioma, usuarioIdioma)
  - i18n/ (catalogAdapter, getMessages)

pdv-importados/hooks/
  - useHasMounted.test.ts

pdv-importados/app/
  - admin/produtos/ (5 testes + coverage)
  - admin/implantacao/ (3 testes)
  - admin/provisionamento/ (2 testes)
  - admin/clientes/ (4 testes)
  - admin/funcionarios/ (1 teste)
  - admin/dashboard/ (1 teste)
  - admin/estoque/ (2 testes)
```

**Total Estimado:** ~40 testes unitários

---

### 3. pdv-local (Desktop)

**Status:** ✅ PASS

**Typecheck:**
```
✅ TypeScript (tsc --noEmit -p tsconfig.typecheck.json)
   - 0 errors
```

**Tests (Vitest):**
```
✅ Vitest run
   Status: PASS
```

**Cobertura Estimada:**
- Cart store logic: `~85%` (cartStore.test.ts, behavior test)
- Pricing/offline: `~80%` (recalcularPrecoItemLocal, RPC equivalence)
- Catalog: `~75%` (catalogoLookup)
- Sync: `~60%` (outboxEventValidate)

**Testes Existentes:**
```
pdv-local/src/
  - stores/ (cartStore, behavior)
  - pricing/ (offlineRpcEquivalence golden, operationalParity prod-fixture)
  - lib/ (logger, recalcularPreco, mapRegraPreco, outboxValidate)
```

**Total Estimado:** ~10 testes unitários

---

### 4. shared-core

**Status:** ✅ PASS

**Tests:** Vitest run OK (detalhes pendentes)

---

## 📈 E2E & Smoke (Playwright)

**Não executado em `npm run check:all`** — requer servidor rodando.

**Suite Atual:**
```
pdv-importados/e2e/
  ├── gerente.spec.ts          (dashboard, painel)
  ├── caixa-venda.spec.ts       (vendas críticas)
  ├── caixa-venda-multi-pagamento.spec.ts (split payment)
  ├── caixa-fluxos-criticos.spec.ts
  ├── admin-idioma.spec.ts      (i18n)
  └── helpers/ (url, auth, seed)
```

**Cobertura E2E:** ~5 suites críticas (requer PLAYWRIGHT_* secrets para rodar)

---

## 🎯 Lacunas Identificadas (Prioridade)

### P0 (Bloqueante para go-live)

1. **Backend Deno check**
   - [ ] Resolver TLS/proxy para esm.sh
   - [ ] Validar Edge Functions (sync-outbox, validar-gerente, fiscal-worker)
   - [ ] Estimado: 2-4h (depende de acesso a env setup)

2. **RPC Layer Testing** (pdv-importados)
   - [ ] Testes de RPC calls (preço, venda, sync)
   - [ ] Error handling: timeout, network, validation
   - [ ] Estimado: 8-12h (~20 testes)

3. **Financial Gate Validation** (production-only)
   - [ ] `npm run gate:pdv` não foi executado
   - [ ] Validar ledger consistency
   - [ ] Estimado: 4-6h

### P1 (Importante para qualidade)

4. **E2E Expansion**
   - [ ] Adicionar testes para Fase 6 (modais, design system)
   - [ ] Cobertura de regressão (browser chinês)
   - [ ] Estimado: 12-16h (~15 novos testes)

5. **Unit Tests Coverage**
   - [ ] Aumentar cobertura pages/routes em pdv-importados
   - [ ] Adicionar testes de API routes (auth, rpc)
   - [ ] Estimado: 10-14h (~25 novos testes)

6. **Integration Tests** (pdv-local + backend)
   - [ ] Validar Tauri commands
   - [ ] SQLite transaction tests
   - [ ] Estimado: 8-10h (~12 novos testes)

### P2 (Nice-to-have)

7. **Performance Tests**
   - [ ] Sync com 1k+ items
   - [ ] Cart recalc com grande catálogo
   - [ ] Estimado: 6-8h

8. **Multi-idioma Coverage**
   - [ ] Testes completos de i18n (português + 普通话)
   - [ ] Estimado: 4-6h

---

## 📋 Plano Imediato (Próximas 24h)

### Sprint 1: Unblock Backend
1. **Diagnosticar TLS issue**
   - [ ] Consultar `/root/.ccr/README.md`
   - [ ] Configurar Deno com CA bundle
   - [ ] Rodar `npm run check` novamente

2. **Validar Edge Functions**
   - [ ] Deno check sync-outbox, validar-gerente, fiscal-worker
   - [ ] Rodar unit tests (se existirem)

### Sprint 2: RPC Testing (pdv-importados)
1. **Mapear RPC calls críticas**
   - [ ] `rpc.precoProduto`
   - [ ] `rpc.validarVenda`
   - [ ] `rpc.syncFluxo`
   - Outros

2. **Escrever testes unitários**
   - [ ] Mock Supabase client
   - [ ] Testar sucesso + erros
   - [ ] Validar retry logic

### Sprint 3: E2E Baseline
1. **Preparar ambiente Playwright**
   - [ ] `npx playwright install chromium`
   - [ ] Configurar `.env.local` com PLAYWRIGHT_* secrets
   - [ ] Executar `npm run test:e2e:critical`

2. **Documentar status**
   - [ ] Quais testes passam?
   - [ ] Quais falham?
   - [ ] Quais dependem de secrets?

---

## 🚀 Referências Críticas

- [E2E.md](docs/E2E.md) — Playwright + variáveis
- [SEED_DEV_E2E.md](pdv-importados/docs/SEED_DEV_E2E.md) — Usuários de teste
- [backend/README.md](backend/README.md) — Edge Functions + Deno
- [PRODUCAO_GO_NO_GO.md](docs/PRODUCAO_GO_NO_GO.md) — Checklist pós-deploy
- `/root/.ccr/README.md` — Proxy + CA bundle config

---

## 📌 Notas

- **Vitest Coverage:** Executar `npx vitest run --coverage` para gerar relatório detalhado
- **E2E Secrets:** GitHub Actions tem secrets configurados (verificar Actions tab)
- **TLS/Proxy:** Ambiente remoto tem proxy customizado — consultar status com `curl -sS "$HTTPS_PROXY/__agentproxy/status"`
- **Turborepo Cache:** Remoto desabilitado neste environment

---

**Status Geral:** 🟡 **AMARELO**

- ✅ Frontend (web + desktop) em forma
- ❌ Backend (Deno) bloqueado por TLS
- 🟠 E2E não executado (sem servidor)
- 🟠 RPC testing ausente (P0)

**Bloqueador Crítico:** Resolver TLS para Deno check (backend).

**Próxima Revisão:** 2026-07-24 (após unblock backend + Sprint 1).
