# Archived Migrations

**Archive Date:** 2026-07-12  
**Total Archived Migrations:** 198  
**Numbering:** 001 — 268 (sequential, numeric)

---

## Overview

This directory contains the historical record of sequential migrations applied to the FastProduct database before baseline consolidation (Passo 3 of reconciliation strategy).

All schema changes represented by these 198 migrations have been consolidated into a single **authoritative baseline** (`00000000000000_baseline_prod.sql`).

**These files are archived for audit trail and historical reference ONLY.**

**Deployments use:**
```bash
supabase db reset
# Applies: 00000000000000_baseline_prod.sql (current schema)
# Then: 20260712+ future migrations (append-only, timestamp-versioned)
```

---

## Migration Sequence History

### Phase 1: Core Schema (001-100)
- Basic tables and structures
- Multi-tenant foundation (lojas, usuarios, caixas)
- Product and inventory
- Sales and finance

### Phase 2: Features & Enhancements (101-200)
- RLS policies and security
- Reporting views
- Advanced pricing rules
- Commission systems
- Fiscal document handling

### Phase 3: Go-Live Integration (249-268)
- Final reconciliation of parallel PRs
- Commission and employee management
- Fiado module removal
- Sale finalization v4 (with cliente_id + FIADO-guard)
- Storage buckets

---

## Critical Migrations

### 258: Products Localization
- **File:** `258_produtos_localizacao_nome_reduzido.sql`
- **Status:** ✅ Matches production exactly

### 259-268: Go-Live Integration Sequence
- **259:** Vendas cliente_id
- **260:** Finalizar venda v4 com cliente (v4 unification)
- **261:** Remove modulo fiado completo
- **262:** Funcionarios separate from usuarios
- **263:** Comissoes regras funcionario
- **264:** Comissoes vendedores regra e congelamento
- **265:** RLS vendor isolation (🔴 also exists as prod-only in schema_migrations)
- **267:** Funcionarios meta CRUD
- **268:** Finalizar venda v4 guard suspensao cliente (UNIFIES 260 + 152 features)

---

## Orphaned Migrations (Critical)

Two migrations exist in PRODUCTION but were NOT tracked in repository (discovered during Passo 0 audit):

### 265: `clientes_insert_operador_pdv` (Prod-Only Orphan)
**Banco version:** 20260710212349  
**Location:** Schema_migrations table only  
**Content:** RLS policies for clientes table (multi-loja isolation)
```sql
CREATE POLICY clientes_insert_loja ON public.clientes
  FOR INSERT WITH CHECK (...)
CREATE POLICY clientes_update_gerente_loja ON public.clientes
  FOR UPDATE USING (...)
CREATE POLICY clientes_delete_gerente_loja ON public.clientes
  FOR DELETE USING (...)
```
**Captured in baseline:** ✅ YES

### 266: `clientes_unique_documento_loja` (Prod-Only Orphan)
**Banco version:** 20260710212628  
**Location:** Schema_migrations table only  
**Content:** Unique index ensuring document uniqueness per store
```sql
CREATE UNIQUE INDEX clientes_loja_documento_unique
  ON public.clientes (loja_id, documento)
  WHERE documento IS NOT NULL;
```
**Captured in baseline:** ✅ YES

---

## Relative Orphan

### 259: `historico_precos_produto` (Branch Orphan)
**Status:** Applied in production, exists in PR #148 (not merged to main)  
**Location:** 
- Production: schema_migrations table (20260709184734)
- Repo: PR #148 (feature/pricing-history branch)
- Main: ❌ NOT present

**Action:** Captured in baseline; awaiting PR #148 integration or manual rescue.

---

## Reconciliation Notes

### Renumbered Equivalents (6 migrations)
Repository used different numbering than production in some cases:

| Production | Repository | Type | Reason |
|-----------|-----------|------|--------|
| 259 (funcionarios) | 262 | Equivalente | PR #159 renumbered to avoid collision |
| 260 (comissoes_regras) | 263 | Equivalente | Cascading renumber |
| 261 (comissoes_vend) | 264 | Equivalente | Cascading renumber |
| 263 (vendas_cliente_id) | 259 | Equivalente | PR #158 numbered before #159 merged |
| 264 (v4_cliente_id) | 260 | Divergência | PR #152 needed to add FIADO-guard after #158 merged |
| 255 (vendas_em_espera) | 247c | Equivalente | Historical numbering (247a/b/c series) |

### Critical Observation: Migration 268 Unification
**Problem:** Migrations 260 (repo) and 264 (banco) both defined `finalizar_venda_transacional_canonica_v4` but:
- 260 (repo): Added `p_cliente_id` parameter, **omitted FIADO-guard** (vulnerability)
- 264 (banco): Had FIADO-guard, appeared to lack `p_cliente_id`

**Solution:** Migration 268 (`finalizar_venda_v4_guard_suspensao_cliente.sql`) unifies both:
```sql
CREATE OR REPLACE FUNCTION finalizar_venda_transacional_canonica_v4(
  ...,
  p_cliente_id uuid DEFAULT NULL  -- ✅ FEATURE #158
)
...
BEGIN
  -- ✅ FEATURE #152: FIADO-guard at header
  IF upper(COALESCE(p_forma_pagamento, '')) = 'FIADO' THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO';
  END IF;
  ...
  INSERT INTO vendas (..., cliente_id) VALUES (..., p_cliente_id);
  ...
END;
```

---

## Baseline Consolidation

All schema changes from these 198 migrations have been consolidated into:

**File:** `00000000000000_baseline_prod.sql`  
**Size:** ~15 MB (DDL only, no data)  
**Structure:**
1. CREATE EXTENSION (10 total)
2. CREATE SCHEMA
3. CREATE TABLE (57 total)
4. CREATE INDEX (220 total)
5. CREATE FUNCTION (102 total)
6. CREATE TRIGGER (24 business logic + 403 FK)
7. CREATE POLICY / RLS (121 total)
8. CREATE VIEW (7 total)
9. Storage buckets
10. GRANT permissions

**Fingerprint:** `00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355`

---

## Future Migrations

All NEW migrations (post-baseline) will use:
- **Format:** `20260712HHMMSS_description.sql` (timestamp, NOT numeric)
- **Location:** `backend/supabase/migrations/` (NOT here in archive)
- **Tracking:** Automatically recorded in `schema_migrations` by Supabase CLI
- **Policy:** Append-only, never modify or renumber committed migrations

---

## Reconstruction

To rebuild the schema from archive + baseline:

```bash
# 1. Navigate to repo root
cd /path/to/fastproduct

# 2. Start with baseline (all schema)
supabase db reset --password <password>
# → Applies 00000000000000_baseline_prod.sql

# 3. Apply any future migrations (20260712+)
supabase migration up
# → Applies only NEW migrations since baseline

# 4. Verify state
supabase status
# → Should show current schema version
```

---

## Audit Trail

**Consolidation Date:** 2026-07-12  
**Reason:** Baseline Squash Strategy (Passo 3 of Reconciliation)  
**Authorization:** User approval for Passo 2 completion  
**Validation:** Schema fingerprint match on production database  

**References:**
- `PASSO_0_PROVA_EQUIVALENCIA.md` — Detailed equivalence audit
- `BASELINE_PRODUCAO.md` — Production schema snapshot
- `PASSO_2_VALIDACAO_REPRODUTIBILIDADE.md` — Reproducibility validation
- `PASSO_2_RELATORIO_FINAL.md` — Gate decision and approval
- `INVESTIGACAO_MIGRATION_268_FIADO.md` — Migration 268 unification analysis
- `PLANO_RECONCILIACAO.md` — 7-step reconciliation strategy

---

## Contact & Questions

For questions about archived migrations:
1. Refer to `MAPA_DE_EQUIVALENCIA.md` for banco ↔ repo mapping
2. Check `INVESTIGACAO_MIGRATION_268_FIADO.md` for migration 268 specifics
3. Review `PASSO_0_PROVA_EQUIVALENCIA.md` for detailed audit

Archive is immutable. All future work uses timestamp-versioned migrations.

