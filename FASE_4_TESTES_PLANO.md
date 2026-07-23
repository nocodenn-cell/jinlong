# Fase 4: Testes — Plano Executivo

**Objetivo:** Consolidar e expandir a cobertura de testes do FastProduct (unit, integração, E2E) garantindo qualidade produção-ready, rastreabilidade e confiabilidade operacional.

**Status:** Iniciando  
**Branch:** `claude/fase-4-testes-1j60ye`  
**Data de Início:** 2026-07-23

---

## 🎯 Missões da Fase 4

### Missão 4.1: Auditoria de Cobertura de Testes
- [ ] Mapear cobertura atual (unit, integração, E2E)
- [ ] Identificar lacunas críticas em fluxos de caixa, sync e financeiro
- [ ] Documentar estado de cada workspace (`pdv-importados`, `pdv-local`, `backend`)

### Missão 4.2: Fortalecer Testes Unitários (Vitest)
- [ ] Aumentar cobertura em `pdv-importados/src/` (alvo: >80%)
- [ ] Adicionar unit tests para hooks e utilities críticas
- [ ] Validar lógica de pricing, vendas e sync
- [ ] Testes para RPC layer (Supabase integração)

### Missão 4.3: Testes de Integração (Backend)
- [ ] Deno + Supabase: validar Edge Functions (`sync-outbox`, `validar-gerente`, `fiscal-worker`)
- [ ] Testes de RPC com dados reais
- [ ] Migração + rollback scenarios
- [ ] Performance: sync sob carga

### Missão 4.4: E2E & Smoke (Playwright)
- [ ] Expandir suite crítica (`caixa-venda`, `caixa-fluxos-criticos`)
- [ ] Adicionar testes de regressão para Fase 6 (design system, modais)
- [ ] Validar multi-idioma (português + 普通话)
- [ ] Testes em browsers chineses (360, QQ)

### Missão 4.5: Testes de Produção (Production Gate)
- [ ] Validar financial gate (`npm run gate:pdv`)
- [ ] Verificar SSRA + deployment ID tracking
- [ ] Smoke pós-deploy em staging/produção
- [ ] Cenários de fallback e rollback

### Missão 4.6: CI/CD & Automação
- [ ] Consolidar workflows (`.github/workflows/`)
- [ ] Reparar baselines (guards, lint)
- [ ] Configurar secrets de staging/produção
- [ ] Documentar processo de release

---

## 📊 Estrutura de Testes Atual

### `pdv-importados` (Next.js Web)
```
Vitest:
  - src/__tests__/ (unit + integração)
  - Hooks (useCart, usePrice, useSyncContext)
  - Utilities (formatters, validators)
  - API routes (rpc, auth)

E2E (Playwright):
  - e2e/ (chrome, mobile-chrome, mobile-safari)
  - gerente.spec.ts (dashboard, painel)
  - caixa-venda.spec.ts (vendas críticas)
  - caixa-fluxos-criticos.spec.ts
  - caixa-venda-multi-pagamento.spec.ts
  - admin-idioma.spec.ts (internacionalização)
  - Smoke (test:e2e:critical)
```

### `pdv-local` (Tauri Desktop)
```
Vitest:
  - Unit tests (SQLite bridge, offline logic)
  - Integração com Tauri commands
```

### `backend` (Supabase)
```
Deno:
  - Edge Functions: sync-outbox, validar-gerente, fiscal-worker
  - Migrations (PostgreSQL)
  - RPC validators
```

---

## 🔧 Scripts Existentes

| Script | Workspace | Propósito |
|--------|-----------|----------|
| `npm run test` | Raiz | Vitest em `pdv-importados` + `pdv-local` |
| `npm run test:e2e` | `pdv-importados` | Suite completa Playwright |
| `npm run test:e2e:critical` | `pdv-importados` | Smoke crítico (sync, vendas) |
| `npm run test:e2e:ui` | `pdv-importados` | Debug UI (Playwright Inspector) |
| `npm run test:e2e:report` | `pdv-importados` | HTML report pós-falha |
| `npm run check` | Raiz (`backend`) | Deno check Edge Functions |
| `npm run check:all` | Raiz | `check` + `lint` + `typecheck` + `test` |
| `npm run ci` | Raiz | Full CI (check + lint + typecheck + test + build) |
| `npm run gate:pdv` | Raiz | Production financial gate |
| `npm run validate:production` | Raiz | SSRA validation pós-deploy |

---

## 📋 Checklist da Fase 4

### Sprint 1: Auditoria & Baseline
- [ ] Executar `npm run check:all` — verificar estado atual
- [ ] Gerar cobertura: `npx vitest run --coverage`
- [ ] Documentar lacunas (por arquivo/módulo)
- [ ] Identificar P0 (financeiro, sync) vs P1 (UI)

### Sprint 2: Unit Tests (Web)
- [ ] Aumentar cobertura `pdv-importados` para >75%
- [ ] Testes de pricing logic (margin, discount, tax)
- [ ] Testes de cart state management
- [ ] Testes de RPC error handling

### Sprint 3: Integration Tests (Backend)
- [ ] Validar Edge Functions com dados reais
- [ ] Testes de migração (apply + rollback)
- [ ] Performance: sync com 1k+ items
- [ ] Failover scenarios

### Sprint 4: E2E Expansion
- [ ] Adicionar testes de regressão para modais (Fase 6)
- [ ] Testes de multi-pagamento com várias formas
- [ ] Cobertura de erros de network/timeout
- [ ] Browser chinês (360/QQ)

### Sprint 5: Production Gate
- [ ] Rodar `npm run gate:pdv` em staging
- [ ] Validar ledger consistency
- [ ] Testar SSRA tracking
- [ ] Smoke pós-deploy

### Sprint 6: CI/CD Consolidation
- [ ] Reparar baselines (guards)
- [ ] Configurar secrets (GitHub Actions)
- [ ] Documentar processo de release
- [ ] Estabelecer SLA (tempo de suite)

---

## 🎓 Referências Críticas

| Documento | Propósito |
|-----------|----------|
| [E2E.md](docs/E2E.md) | Guia completo Playwright + variáveis |
| [SEED_DEV_E2E.md](pdv-importados/docs/SEED_DEV_E2E.md) | Criar usuários de teste no Supabase |
| [pdv-production-financial-gate.md](docs/pdv-production-financial-gate.md) | Production financial validation |
| [PRODUCAO_GO_NO_GO.md](docs/PRODUCAO_GO_NO_GO.md) | Checklist pós-deploy |
| [backend/README.md](backend/README.md) | Edge Functions + Deno check |

---

## 🚀 Próximos Passos

1. **Hoje:** Executar auditoria (`npm run check:all`)
2. **Dia 1:** Documentar cobertura atual + lacunas (Missão 4.1)
3. **Dia 2-3:** Fortalecer unit tests (Missão 4.2)
4. **Dia 4-5:** Testes de integração (Missão 4.3)
5. **Dia 6-7:** E2E + smoke (Missão 4.4)
6. **Dia 8:** Production gate validation (Missão 4.5)
7. **Dia 9-10:** CI/CD consolidation (Missão 4.6)

---

**Dúvidas ou bloqueadores?** Revisar com staff engineer + head de QA.

**Deadline Fase 4:** Semana de 2026-08-02 (go-live ready)
