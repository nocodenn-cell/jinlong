# Employee Commission System - Testing Guide

## Overview

This document provides step-by-step instructions for testing the employee commission system implementation (migrations, server actions, and UI components).

## Prerequisites

1. Migrations applied: 259, 260, 261
2. Server actions deployed: `/gerente/funcionarios/actions.ts`
3. UI components deployed: `/gerente/funcionarios/` route

## Phase 1: Database Verification

### 1.1 Verify Table Creation

```sql
-- Check funcionarios table
SELECT * FROM public.funcionarios LIMIT 1;

-- Check comissoes_regras_funcionario table
SELECT * FROM public.comissoes_regras_funcionario LIMIT 1;

-- Check comissoes_regras_historico table
SELECT * FROM public.comissoes_regras_historico LIMIT 1;

-- Check new columns on comissoes_vendedores
SELECT regra_id, percentual_aplicado FROM public.comissoes_vendedores LIMIT 1;
```

Expected results: All tables and columns exist with correct types and constraints.

### 1.2 Verify RLS Policies

```sql
-- Check RLS enabled on all new tables
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'comissoes%' OR tablename = 'funcionarios';

-- Verify policies are attached
SELECT tablename, policyname FROM pg_policies 
WHERE tablename IN ('funcionarios', 'comissoes_regras_funcionario', 'comissoes_regras_historico');
```

Expected results: RLS enabled on all three tables with at least 2 policies each.

### 1.3 Verify Trigger

```sql
-- Check trigger exists and is configured
SELECT * FROM pg_trigger WHERE tgname = 'trg_registrar_comissao';

-- Verify function exists
SELECT proname FROM pg_proc WHERE proname = 'fn_registrar_comissao';
```

Expected results: Trigger and function both exist.

---

## Phase 2: Server Actions Testing

### 2.1 Test Funcionarios CRUD

#### Create Funcionario
- Navigate to `/gerente/funcionarios`
- Click "+ Novo Funcionário"
- Fill form: Nome="João Silva", Telefone="11999999999", Status=Ativo
- Set Comissão Padrão = 3%
- Click Salvar
- **Expected:** Funcionário appears in list with 3% default commission

#### Read Funcionarios
- Navigate to `/gerente/funcionarios`
- **Expected:** List loads with all funcionarios in your loja
- Filter by Status=Inativo
- **Expected:** List filters correctly

#### Update Funcionario
- Click Editar on a funcionario
- Change Nome to "João Silva Atualizado"
- Change Status to Inativo
- Click Salvar
- **Expected:** List updates, status changes to Inativo

#### Soft Delete (Toggle Ativo)
- Click the status badge (Ativo/Inativo) on a row
- **Expected:** Status toggles without page reload

### 2.2 Test Commission Rules

#### Create Default Rule (Automatic)
- Create a new funcionario
- **Expected:** A default rule (tipo_regra='padrao') is created automatically
- Check audit trail: Should show "criada" action

#### Create Product-Specific Rule
- Edit funcionario → Tab 3 (Comissão)
- Click "+ Adicionar Regra"
- Select rule type: "Por Produto"
- Select a product (e.g., "Smartwatch")
- Set Comissão = 10%
- Set vigencia_inicio = today
- Leave vigencia_fim blank (ongoing)
- Click Salvar
- **Expected:** Rule created and audit logged

#### Create Category Rule
- Add rule for type "Por Categoria"
- Select "Eletrônicos"
- Set Comissão = 5%
- **Expected:** Rule created successfully

#### Create Margin Rule
- Add rule for type "Por Margem"
- Set Margem Mínima = 30%, Máxima = 50%
- Set Comissão = 8%
- **Expected:** Rule created with margin validation

### 2.3 Test Audit Trail

#### View Audit History
- Navigate to funcionario → Tab 4 (Histórico)
- **Expected:** See all rule changes with:
  - Data/Hora of change
  - Ação (criada/alterada/desativada)
  - Who changed it (Alterado por)
  - Before/after values for alterações

#### Verify Immutability
- Audit trail entries should be read-only
- **Expected:** No edit buttons on history rows

---

## Phase 3: Commission Calculation Testing

### 3.1 Setup for E2E Test

1. Create employee: "Carlos Vendedor"
   - Default commission: 2%

2. Add specific rules:
   - Product "Smartwatch": 10%
   - Category "Eletrônicos": 5%
   - Default: 2%

3. Create test products:
   - Product A: Category="Eletrônicos", Price=100, Cost=70 (30% margin)
   - Product B: Category="Alimentos", Price=50, Cost=40 (20% margin)

### 3.2 Test Rule Priority

#### Scenario 1: Product Rule Applied
- Sale item: Product="Smartwatch" (has 10% rule), Quantity=1, Price=100
- Operador: Carlos
- **Expected Commission:**
  - Base: 100
  - Percentual Aplicado: 10%
  - Valor: 10
  - regra_id: Points to product-specific rule

#### Scenario 2: Category Rule Applied
- Sale item: Product A (category="Eletrônicos", no product-specific rule), Qty=1, Price=100
- Operador: Carlos
- **Expected Commission:**
  - Base: 100
  - Percentual Aplicado: 5% (category rule)
  - Valor: 5
  - regra_id: Points to category rule

#### Scenario 3: Default Rule Applied
- Sale item: Product B (category="Alimentos", no rules), Qty=1, Price=50
- Operador: Carlos
- **Expected Commission:**
  - Base: 50
  - Percentual Aplicado: 2% (employee default)
  - Valor: 1
  - regra_id: Points to employee default rule

### 3.3 Test Commission Freezing (Critical)

#### Setup
1. Carlos default: 2%
2. Create sale with Product B (no specific rules)
3. Commission calculated: 2% → valor_comissao = 1
4. **Change Carlos's default rule from 2% to 5%**

#### Verification
```sql
SELECT 
  v.id, 
  c.percentual_aplicado, 
  c.valor_comissao,
  c.created_at
FROM public.vendas v
JOIN public.comissoes_vendedores c ON c.venda_id = v.id
WHERE c.operador_id = '<carlos_id>'
ORDER BY v.created_at DESC
LIMIT 2;
```

**Expected Results:**
- First sale (before rule change): percentual_aplicado=2%, valor_comissao=1
- Second sale (after rule change): percentual_aplicado=5%, valor_comissao=2.5
- **Both sales retain their original commission** (no retroactive recalculation)

---

## Phase 4: Permissions & RLS Testing

### 4.1 OPERADOR Cannot Access Funcionarios

- Login as OPERADOR
- Try to navigate to `/gerente/funcionarios`
- **Expected:** 403 Forbidden or redirect to dashboard
- Try direct API call to `listarFuncionarios()`
- **Expected:** RLS blocks query, returns error

### 4.2 GERENTE Loja-Scoped Access

- Login as GERENTE for Loja A
- Navigate to `/gerente/funcionarios`
- **Expected:** Only see funcionarios from Loja A
- Try API manipulation to request Loja B data
- **Expected:** RLS blocks, returns error

### 4.3 DONO Multi-Loja Access

- Login as DONO
- Navigate to `/gerente/funcionarios`
- **Expected:** See funcionarios from all lojas
- Verify filtering still works

### 4.4 RLS on Commission Rules

- Verify GERENTE can only see/edit their loja's rules
- Verify DONO can see all rules
- Verify audit trail respects same RLS boundaries

---

## Phase 5: Data Integrity Testing

### 5.1 Constraint Validation

#### Rule Type Constraints
- Try to create por_produto rule without produto_id
- **Expected:** Validation error

- Try to create por_margem rule without margin range
- **Expected:** Validation error

#### Margin Range Validation
- Try to create rule with margem_minima > margem_maxima
- **Expected:** Validation error

#### Percentual Range
- Try to create rule with comissao > 100%
- **Expected:** Validation error

### 5.2 Audit Trail Integrity

- Verify historico table is append-only (no updates/deletes possible)
- Verify cada ação logged with timestamp and user attribution
- Test that deativating a rule creates audit entry with previous values captured

---

## Phase 6: Regression Testing

### 6.1 Existing Commission System Still Works

- Legacy product-level commissions (produtos.comissao_tipo) still apply if no employee rules
- Global fallback commission still applies as last resort
- Existing `/gerente/comissoes` page still loads and functions

### 6.2 Sales Finalization Still Works

- Sales with employee rules can be finalized normally
- Sales without employee rules (legacy) still calculate correctly
- Cancelar venda still works and creates reversals

---

## Known Limitations (v1)

- Meta/target monthly rules not implemented (v2 feature)
- ComissaoRulesEditor doesn't support editing existing rules (only create/deactivate)
- Produtos/Categorias dropdowns need backend integration
- Commission rules apply uniformly to all items in a sale (not per-item basis for mixed sales)

---

## Success Criteria

All tests pass when:

✅ Database tables and RLS policies created successfully
✅ Funcionarios CRUD operations work with proper validation
✅ Commission rules created and audit trail recorded
✅ Rule priority respected: product > category > margin > default > legacy > global
✅ Commission percentages frozen at sale time (no retroactive changes)
✅ RLS permissions enforced correctly per role and loja
✅ Existing commission system unaffected
✅ All validations and constraints working

---

## Troubleshooting

### Issue: RLS Policy Error on List
- Verify user's loja_id matches funcionario loja_id
- Check that user.perfil is in ['GERENTE', 'DONO', 'ADMIN']
- Verify auth.uid() is set in Supabase context

### Issue: Trigger Not Firing
- Verify migration 261 applied successfully
- Check PostgreSQL trigger logs
- Ensure status transitioning to 'CONCLUIDA' (not from 'CONCLUIDA')

### Issue: Commission Not Calculated
- Verify operador has associated funcionario
- Check that funcionario has at least one default rule (tipo_regra='padrao', ativo=true)
- Verify vigencia_inicio/fim dates are valid

### Issue: Rules Not Applying in Priority Order
- Verify migrations 259-261 applied in order
- Check trigger function fn_registrar_comissao implementation
- Review rule evaluation logic (should check product before category before margin)
