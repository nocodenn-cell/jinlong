# ONDA 2 — GAPS MAPEADOS E PLANO DE CORREÇÃO

**Status:** Investigação concluída | Plano detalhado pronto | Implementação autorizada

---

## 📋 RESUMO EXECUTIVO

| ID | Gap | Fix | Complexidade | Deps | Status |
|----|-----|-----|--------------|------|--------|
| **36** | Sem E2E test | ✅ Teste criado | Baixa | — | ✅ PRONTO |
| **32** | Docs desatualizada | Atualizar matriz | Trivial | — | 📝 TRIVIAL |
| **33** | UI legacy confusa | Deprecar campos | Baixa | — | 📝 TRIVIAL |
| **40** | Badge não mostra qty_min | Refatorar tooltip | Baixa | — | 📝 PEQUENO |
| **44** | Sem validação tier<varejo | Adicionar CHECK SQL | Média | — | 📝 MÉDIO |
| **50** | Motivo override missing | Schema+RPC | Média | — | 📝 MÉDIO |
| **51** | Tiers não auditados | Audit trail | Média | — | 📝 MÉDIO |

---

## DETALHAMENTO POR ID

### ✅ ID 36 — Aplicação Automática Faixa (PRONTO)

**Status:** Implementação ✓ | E2E test criado ✓

**Arquivo novo:** `pdv-importados/e2e/caixa-atacado-quantidade-minima.spec.ts`
- Testa: qty 1→10, validação VAREJO→ATACADO, regressão
- Segue padrão existente (loginCaixaOperador, helpers)
- Pronto para merge

**Checklist:**
- [x] RPC existe e funciona
- [x] TS porta equivalente testada (unitário)
- [x] Integração PDV validada (3 pontos de reprecificação)
- [x] Backend revalida na finalização
- [x] E2E test criado

---

### 📝 ID 32 — Preço Atacado Runtime (TRIVIAL)

**Gap:** Matriz de auditoria diz "produtos.preco_atacado ignorado RPC" mas não está claro se isso é esperado.

**Fix:** 1 linha de comentário/documentação

**Ação:**
- Arquivo: `AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md` linha 538
- Adicionar nota: "✓ Comportamento correto: legado não participa do runtime D0"
- PR title: "docs(atacado): esclarecer que preco_atacado legado é ignorado"

**Tempo:** 5 min

---

### 📝 ID 33 — Quantidade Mínima Atacado (TRIVIAL)

**Gap:** Campos legados `quantidade_gatilho_atacado` e `preco_atacado` confundem na UI.

**Fix:** Deprecar/ocultar campos legados

**Ações:**
1. **File:** `pdv-importados/app/admin/produtos/ProdutoFormModal.tsx`
   - Linha ~450: Remover campo "Quantidade Gatilho de Atacado" da UI
   - Remover campo "Preço Atacado Sugestão" da UI
   - Deixar nota: "Legado; faixas de atacado via `precos_atacado` table"

2. **File:** `shared-core/src/products/types.ts`
   - Marcar `quantidadeMinimaAtacadoPadrao` como `@deprecated`
   - Marcar `precoAtacado` como `@deprecated`

**Tempo:** 30 min

---

### 📝 ID 40 — Exibição Faixa Aplicada (PEQUENO)

**Gap:** Badge mostra "Atacado" mas não mostra `quantity_minima` da tier aplicada.

**Expected UI:** "Atacado (min 10)" ou "Atacado tier 10"

**Fix:**

1. **File:** `pdv-importados/components/ui/PriceTooltip.tsx`
   - Receber `regraId` do item
   - Buscar tier correspondente: `precos_atacado.find(t => t.id === regraId)`
   - Exibir: `Atacado: min ${tier.quantidade_minima} unid @ R$ ${tier.preco_unitario}`

2. **File:** `pdv-importados/app/caixa/CaixaCartList.tsx`
   - Passar `resultado.regraId` ao `PriceTooltip`

**SQL helper:**
```typescript
// Em caixaPrecoProduto.impl.ts, retornar regraId que RPC já devolve
```

**Tests:**
- Unitário: `PriceTooltip.spec.tsx` → exibir qty_min corretamente
- E2E: Validar badge mostra "min 10" quando tier aplicada

**Tempo:** 1 hora

---

### 📝 ID 44 — Validação Conflitos Tiers (MÉDIO)

**Gap:** Sem validação CRUD: permitir criar tier com `preco_unitario > preco_varejo`.

**Rule:** tier.preco < produtos.preco_varejo (sempre desconto no atacado)

**Fix:**

1. **File:** `backend/supabase/migrations/20260901000000_validar_tier_menor_que_varejo.sql`
   - Adicionar CHECK ao criar/atualizar `precos_atacado`:
   ```sql
   ALTER TABLE precos_atacado ADD CONSTRAINT tier_menor_que_varejo
     CHECK (preco_unitario <= (SELECT preco_varejo FROM produtos WHERE id = produto_id))
   ```

2. **File:** `pdv-importados/app/gerente/produtos/precosAtacadoActions.ts`
   - Validação client: se `tier.preco >= produto.preco_varejo` → toast erro

3. **File:** `shared-core/src/products/policies/validateProductInput.ts`
   - Adicionar validação Zod: `preco_unitario < preco_varejo`

**Tests:**
- Unitário: `validateProductInput.spec.ts` → deve falhar se tier >= varejo
- Integração: `productUpdater.test.ts` → RPC rejeita tier inválida

**Tempo:** 1.5 horas

---

### 📝 ID 50 — Auditoria Sobrescrita (MÉDIO)

**Gap:** Quando operador faz MANUAL override, falta capturar `motivo_override`.

**Fix:**

1. **File:** `backend/supabase/migrations/20260901010000_add_motivo_override.sql`
   ```sql
   ALTER TABLE itens_venda ADD COLUMN motivo_override TEXT;
   ```

2. **File:** `pdv-importados/app/caixa/CaixaGerenteModal.tsx`
   - Quando aplica desconto manual (MANUAL), pedir motivo
   - Input: "Motivo do override"

3. **File:** `pdv-importados/app/caixa/actions.ts` → `finalizarVendaCaixa`
   - Capturar `motivo_override` do item
   - Passar para RPC `finalizar_venda v4`

4. **File:** `backend/supabase/migrations/20260901010100_finalizar_venda_v4_motivo.sql`
   - RPC: receber `p_itens_motivo_override[]`
   - Persistir em `itens_venda.motivo_override`

**Tests:**
- Integração: `finalizarVendaCaixa.integration.test.ts`
  - Teste override sem motivo → campo obrigatório
  - Teste override com motivo → persiste corretamente

**Tempo:** 2 horas

---

### 📝 ID 51 — Histórico Preços (MÉDIO)

**Gap:** Tiers CRUD não auditadas; `historico_precos_produto` só tem preço varejo.

**Fix:**

1. **File:** `backend/supabase/migrations/20260901020000_historico_tiers_crud.sql`
   - Nova tabela: `historico_precos_tier_crud`
   ```sql
   CREATE TABLE historico_precos_tier_crud (
     id uuid PRIMARY KEY,
     produto_id uuid,
     tier_id uuid,
     acao TEXT, -- 'CREATE', 'UPDATE', 'DELETE'
     quantidade_minima_antes INT,
     quantidade_minima_depois INT,
     preco_unitario_antes NUMERIC,
     preco_unitario_depois NUMERIC,
     criado_em TIMESTAMP,
     criado_por uuid
   );
   ```
   - Trigger em `precos_atacado.INSERT/UPDATE/DELETE`

2. **File:** `pdv-importados/app/admin/produtos/productPriceReader.ts`
   - Query histórico de tier CRUD junto com `historico_precos_produto`
   - Retornar: preço varejo + tier CRUD trail

3. **File:** `pdv-importados/app/admin/produtos/HistoricoPrecosSection.tsx`
   - Exibir: "Preço varejo atualizado", "Tier 10 criado", "Tier 50 removido"
   - Ordenar por data DESC

**Tests:**
- Unitário: `productPriceReader.test.ts`
  - Criar tier → histórico registra
  - Atualizar tier → histórico registra mudança (before/after)
  - Remover tier → histórico registra

**Tempo:** 1.5 horas

---

## 📦 ORDEM DE MERGE RECOMENDADA

```
1. ID 36 (E2E) ← Desbloqueia validação
   ↓
2. ID 32+33 (Limpeza doc/UI) ← Trivial, baixo risco
   ↓
3. ID 40 (Badge) ← Melhora UX, baixo risco
   ↓
4. ID 44 (Validação) ← Segurança, medium risk
   ↓
5. ID 50+51 (Auditoria) ← Compliance, medium risk
```

---

## 🎯 PRÓXIMAS AÇÕES

**Imediato:**
- [ ] Merge PR #1: ID 36 E2E test (`caixa-atacado-quantidade-minima.spec.ts`)
- [ ] Criar 6 PRs baseadas neste documento (uma por ID ou agrupadas)

**Cada PR deve incluir:**
- Arquivo(s) modificado(s)
- Teste (unitário ou integração)
- Descrição do gap e fix
- Validação de regressão

**Estimativa total:** 7-8 horas desenvolvimento | Parallelizável em até 3 PRs simultâneas

---

## ✅ CHECKLIST ONDA 2 COMPLETA

- [x] ID 36: E2E test criado
- [ ] ID 32: Docs esclarecidas
- [ ] ID 33: UI deprecada
- [ ] ID 40: Badge qty_min implementado
- [ ] ID 44: CHECK tier validação
- [ ] ID 50: Schema + motivo override
- [ ] ID 51: Audit trail tier CRUD
- [ ] Todos os testes passando
- [ ] Zero regressões

**Quando todos estiverem checkados: Onda 2 FECHADA** ✅
