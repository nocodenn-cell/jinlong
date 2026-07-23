# Fase 4, Missão 4.2: Fortalecer Testes Unitários (Vitest)

**Status:** ✅ INICIADO  
**Data:** 2026-07-23  
**Objetivo:** Aumentar cobertura em `pdv-importados` para >80%, com foco em RPC layer (P0)

---

## 📊 Status Atual — npm run test

```
✅ pdv-importados:  737 testes passados em 36.58s
✅ pdv-local:       Todos passam
✅ shared-core:     Todos passam

Resultado: PASS (sem bloqueadores)
```

---

## 📁 Inventário de Testes Existentes

### pdv-importados (737 testes)

#### Hooks (Comportamento)
```
✓ app/caixa/hooks/
  - useReprecificarQuantidadeCaixa.test.tsx (7 testes)
  - useScannerDetector.test.tsx (3 testes)
  - useCaixaKeyboardShortcuts.behavior.test.tsx (3 testes)

✓ lib/hooks/
  - usePolling.test.ts (4 testes)
  - useHasMounted.test.ts

Cobertura: ~70% (hooks de caixa bem cobertos, admin/gerente parcial)
LACUNA: useCartContext, useSyncContext, usePricing hooks (RPC)
```

#### Componentes (Comportamento + Rendering)
```
✓ components/
  - ui/ (radio-group, select — 7 testes)
  - DragonModal.behavior (11 testes)
  - gerente/ (navbar, table, modais — ~20 testes)
  - produtos/ (forms, modais — ~20 testes)

Cobertura: ~80% (UI bem testado, regra: cada modal = 1 behavior test)
LACUNA: caixa/ componentes (CaixaCartList tem behavior, mas faltam testes de renderização)
```

#### Admin/Gerente (Features)
```
✓ app/admin/
  - produtos/ (productForm, productReader, productLifecycle — 8 testes)
  - clientes/ (customerWriter, customerReader — 4 testes)
  - implantacao/ (homologação, evidência — 3 testes)
  - provisionamento/ (policies, defaults — 2 testes)
  - funcionarios/ (policies — 1 teste)
  - catalogo/ (novoProdutoEntradas — 3 testes)
  - estoque/ (inventory — 2 testes)
  - dashboard/ (utils — 1 teste)

Cobertura: ~75% (testes unitários básicos)
LACUNA: RPC calls (precoProduto, validarVenda, etc), error handling
```

#### Internacionalização
```
✓ src/lib/
  - idioma/ (htmlLang, normalizeIdioma, usuarioIdioma — 3 testes)
  - i18n/ (catalogAdapter, getMessages — 2 testes)

Cobertura: ~90% (bem testado)
```

### pdv-local (~10 testes)

```
✓ stores/
  - cartStore.test.ts (coverage bem documentado)
  - cartStore.behavior.test.ts

✓ pricing/
  - offlineRpcEquivalence.golden.test.ts
  - operationalParity.prod-fixture.test.ts

✓ lib/
  - recalcularPrecoItemLocal.test.ts
  - logger.test.ts
  - mapRegraPrecoSync.test.ts
  - outboxEventValidate.test.ts
  - catalogoLookup.test.ts

Cobertura: ~80% (pricing/sync bem testados)
```

---

## 🎯 Lacunas Identificadas (P0 → P2)

### P0: RPC Layer Testing

**Impacto:** Alto — RPC é interface crítica entre frontend + backend

| Módulo | Função | Status | Prioridade |
|--------|--------|--------|-----------|
| `app/caixa/rpc/` | precoProduto | ❌ Sem teste | P0 |
| `app/caixa/rpc/` | validarVenda | ❌ Sem teste | P0 |
| `app/gerente/rpc/` | syncFluxo | ❌ Sem teste | P0 |
| `app/admin/rpc/` | criarProduto | ❌ Sem teste | P0 |
| Todos | Error handling (timeout, validation) | ❌ Sem teste | P0 |
| Todos | Retry logic | ❌ Sem teste | P0 |

**Plano:**
- [ ] Criar `src/__tests__/rpc/` folder
- [ ] Mock Supabase client (`@supabase/supabase-js`)
- [ ] Escrever 15-20 testes de RPC (3-4h)

### P0: Context Hooks (State Management)

| Hook | Status | Prioridade |
|------|--------|-----------|
| `useCartContext` | ❌ Sem teste | P0 |
| `useSyncContext` | ❌ Sem teste | P0 |
| `useCaixaState` | ⚠️ Teste parcial | P1 |
| `useGerente...` hooks | ❌ Sem teste | P1 |

**Plano:**
- [ ] Testes de context actions (add item, remove, clear cart)
- [ ] Testes de sync state transitions
- [ ] 8-10 testes (2-3h)

### P1: Page/Route Tests

| Rota | Status | Prioridade |
|------|--------|-----------|
| `/caixa` | ❌ Sem teste unit (E2E apenas) | P1 |
| `/gerente/*` | ❌ Sem teste unit | P1 |
| `/admin/*` | ⚠️ Teste parcial (features, not rendering) | P1 |
| `/login` | ❌ Sem teste | P1 |

**Plano:**
- [ ] Testes de rendering + interaction por página
- [ ] 10-15 testes (4-5h)

### P1: Error Handling & Edge Cases

| Cenário | Status | Prioridade |
|---------|--------|-----------|
| Network timeout | ❌ Sem teste | P1 |
| Validation errors | ⚠️ Parcial | P1 |
| Offline mode | ❌ Sem teste | P1 |
| Multi-pagamento (split) | ❌ Sem teste (E2E apenas) | P1 |

**Plano:**
- [ ] Testes de erro para RPC
- [ ] Testes de validação (form + data)
- [ ] 8-10 testes (2-3h)

### P2: Performance & Optimization

| Caso | Status |
|------|--------|
| Cart recalc performance | ❌ Sem benchmark |
| Sync batch optimization | ❌ Sem teste |
| De-duplication logic | ❌ Sem teste |

---

## 🚀 Roadmap Executivo (Próximas 24-48h)

### Sprint 1: RPC Layer (2-3h)
**Goal:** Cobertura de RPC + error handling

```bash
# Criar estrutura
mkdir -p pdv-importados/src/__tests__/rpc

# Escrever testes para:
# 1. precoProduto (sucesso + erro)
# 2. validarVenda (sucesso + erro)
# 3. syncFluxo (sucesso + erro + timeout)
# 4. retry logic
```

**Arquivos a criar:**
- `src/__tests__/rpc/precoProduto.test.ts` (~30 linhas, 4 testes)
- `src/__tests__/rpc/validarVenda.test.ts` (~40 linhas, 5 testes)
- `src/__tests__/rpc/syncFluxo.test.ts` (~40 linhas, 5 testes)
- `src/__tests__/rpc/rpcErrorHandler.test.ts` (~50 linhas, 6 testes)

### Sprint 2: Context Hooks (1-2h)
**Goal:** State management coverage

```bash
# Estrutura
mkdir -p pdv-importados/src/__tests__/hooks

# Testes para:
# 1. useCartContext (add, remove, clear, recalc)
# 2. useSyncContext (status transitions)
```

### Sprint 3: Page Tests (2-3h)
**Goal:** Route + integration básico

```bash
# Estrutura
mkdir -p pdv-importados/src/__tests__/pages

# Testes para:
# 1. /caixa rendering + interactions
# 2. /admin/produtos CRUD
```

---

## 📌 Padrão para Novos Testes

### Template: RPC Test
```typescript
import { describe, it, expect, vi } from 'vitest';
import { precoProduto } from 'app/caixa/rpc/precoProduto';
import { createMockSupabaseClient } from 'src/__tests__/mocks/supabase';

describe('precoProduto RPC', () => {
  it('retorna preço correto para produto varejo', async () => {
    const supabase = createMockSupabaseClient();
    supabase.rpc.mockResolvedValueOnce({
      data: { preco: 100, desconto: 0, margem: 30 },
    });

    const result = await precoProduto(supabase, { codigo: '123' });
    expect(result.preco).toBe(100);
  });

  it('trata erro de validação', async () => {
    const supabase = createMockSupabaseClient();
    supabase.rpc.mockRejectedValueOnce(new Error('Invalid codigo'));

    await expect(precoProduto(supabase, { codigo: '' }))
      .rejects.toThrow('Invalid codigo');
  });
});
```

### Template: Hook Test
```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCartContext } from 'hooks/useCartContext';

describe('useCartContext', () => {
  it('adiciona item ao carrinho', () => {
    const { result } = renderHook(() => useCartContext());

    act(() => {
      result.current.addItem({ id: '1', qty: 2, preco: 50 });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.total).toBe(100);
  });
});
```

---

## 🔍 Verificação de Cobertura

```bash
# Gerar relatório
cd pdv-importados
npx vitest run --coverage

# Resultado esperado (pós-expansion):
# Statements: 80%+
# Branches: 75%+
# Functions: 80%+
# Lines: 80%+
```

---

## ✅ Checklist Missão 4.2

- [ ] Criar `src/__tests__/rpc/` com 4-5 arquivos
- [ ] Escrever 15-20 testes de RPC
- [ ] Criar `src/__tests__/hooks/` com testes de context
- [ ] Escrever 8-10 testes de hooks
- [ ] Criar `src/__tests__/mocks/` (supabase, etc)
- [ ] Rodar `npm run test` — verificar 800+ testes
- [ ] Gerar cobertura: `npx vitest run --coverage`
- [ ] Commit: "test: RPC layer + context hooks coverage (Fase 4, Missão 4.2)"
- [ ] Update FASE_4_STATUS_TESTES_MISSAO_4_2.md com resultados

---

## 🔗 Referências

- Supabase client mocking: `https://supabase.com/docs/reference/javascript/calling-custom-functions`
- Vitest: `https://vitest.dev/`
- React Testing Library: `https://testing-library.com/docs/react-testing-library/intro/`

---

**ETA:** 4-6h de trabalho (4-5 sprints de 1h each)  
**Responsável:** Claude Code  
**Deadline:** 2026-07-24 EOD

---

**Próxima Missão:** 4.3 (Integration Tests — Backend)
