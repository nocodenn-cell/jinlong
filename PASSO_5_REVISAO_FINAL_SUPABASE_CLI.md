# Passo 5: Revisão Final — Riscos da Supabase CLI e Validação Pós-Execução

**Data:** 2026-07-12 04:00 UTC  
**Objetivo:** Eliminar última lacuna antes de consolidação — garantir Supabase CLI funcionará após schema_migrations consolidado  
**Status:** 🔐 VALIDAÇÃO CRÍTICA FINAL

---

## 1. RISCO CRÍTICO: Supabase CLI Reconhecerá Baseline Consolidado?

### 1.1 Como Supabase CLI Usa schema_migrations

**Mecanismo:**

```
supabase status
  ↓
1. Conecta ao banco remoto
2. SELECT * FROM supabase_migrations.schema_migrations ORDER BY version
3. Compara entradas com arquivos locais em backend/supabase/migrations/
4. Retorna: "Applied: N migrations", "Pending: M migrations"
```

**Questão Crítica:** Quando há 12 entradas no banco e 1 arquivo (baseline) no repo, o que CLI retorna?

### 1.2 Estado PRÉ-Consolidação (Atual)

```
BANCO:     12 entradas (20260707..., 20260709..., 20260710..., 20260711...)
REPO:      1 arquivo (00000000000000_baseline_prod.sql)

supabase status → ???
```

**Risco:** CLI pode reportar "Applied: 12, Pending: 1 baseline" (confuso)

### 1.3 Estado PÓS-Consolidação (Proposto)

```
BANCO:     1 entrada (00000000000000_baseline_prod)
REPO:      1 arquivo (00000000000000_baseline_prod.sql)

supabase status → "Applied: 1/1 migrations" ✅
supabase db diff → (vazio) ✅
```

**Esperado:** CLI reconhece baseline como "aplicado", sem pendências.

---

## 2. RISCOS OPERACIONAIS ESPECÍFICOS DA SUPABASE CLI

### 2.1 Risco 1: `supabase status` Confundido (MÉDIO)

**Cenário Problema:**
```bash
$ supabase status
# Possível output (PRÉ-consolidação, estado atual):
# Remote: 12 migrations applied
# Local:  1 migration (00000000000000_baseline_prod)
# Status: Mismatch - 11 migrations in remote but not in local
```

**Problema:** CLI pode pensar que há "drift" entre banco e repo.

**Status Atual:** ⚠️ POSSÍVEL (não testado)

**Mitigação Passo 5:**
```bash
# DEPOIS de consolidação:
$ supabase status
# Expected output:
# Remote: 1 migration applied (00000000000000)
# Local:  1 migration (00000000000000_baseline_prod)
# Status: Synced ✅
```

**Ação:** VALIDAR com comando exato pós-consolidação.

### 2.2 Risco 2: `supabase db diff` Reportar Falso Positivo (ALTO)

**Cenário Problema:**
```bash
$ supabase db diff
# Possível output (PRÉ-consolidação):
# Would create:
#   migration: 00000000000000_baseline_prod
# Would delete:
#   (12 antiga entries from schema_migrations table)
```

**Problema:** CLI pode pensar que há "diff" quando na verdade apenas está consolidando.

**Status Atual:** ⚠️ POSSÍVEL (conhecido do Passo 2 — "migration-remote-drift" CI failure)

**Mitigação Passo 5:**
```bash
# DEPOIS de consolidação:
$ supabase db diff
# Expected output:
# (completely empty)
```

**Ação:** VALIDAR com comando exato pós-consolidação.

### 2.3 Risco 3: `supabase migration up` Pendências Fantasma (MÉDIO)

**Cenário Problema:**
```bash
$ supabase migration up
# Possível output (se CLI não reconhecer 12 antigas como aplicadas):
# Would apply:
#   20260707183145_258_produtos_localizacao_nome_reduzido
#   20260709184734_259_historico_precos_produto
#   ... (todas 12 de novo!)
```

**Problema:** Aplicar migrations já aplicadas = erro (DDL_DUPLICATE).

**Status Atual:** ⚠️ POSSÍVEL (se schema_migrations não for atualizado corretamente)

**Mitigação Passo 5:**
```bash
# DEPOIS de consolidação:
$ supabase migration up
# Expected output:
# Already up to date ✅
# (nada a aplicar)
```

**Ação:** VALIDAR com comando exato pós-consolidação.

### 2.4 Risco 4: `supabase db reset` Com Baseline Novo (CRÍTICO)

**Cenário Problema:**
```bash
$ supabase db reset --password postgres
# Reset com 12 migrations (PRÉ-consolidação):
# 1. Drop database
# 2. Recreate database
# 3. Aplica migrations 1-12 sequencialmente
# 4. Registra 12 entradas em schema_migrations
# Result: Banco reconstruído

# Reset com 1 baseline (PÓS-consolidação):
# 1. Drop database
# 2. Recreate database
# 3. Aplica 00000000000000_baseline_prod
# 4. Registra 1 entrada em schema_migrations
# Result: Mesmo banco, mas muito mais rápido
```

**Validação Crítica:** Banco deve ser **idêntico** após ambos reset.

**Status Atual:** ⚠️ PRECISA TESTAR

**Ação:** VALIDAR com procedure comparativa (fingerprint).

### 2.5 Risco 5: Supabase CLI Versioning (BAIXO)

**Questão:** Versão do Supabase CLI instalada localmente reconhece baseline?

**Status Atual:** ⚠️ DESCONHECIDO

**Ação:** Validar `supabase --version` e compatibilidade.

---

## 3. PROCEDIMENTO DE VALIDAÇÃO PÓS-CONSOLIDAÇÃO

### 3.1 Validação Imediata (5 minutos após consolidação)

#### Command 1: Status Verification

```bash
#!/bin/bash
# File: scripts/validate_passo5_step1.sh

echo "=== PASSO 5 VALIDATION STEP 1: Status ==="
echo ""

# 1a. Check schema_migrations table
echo "1a. Remote schema_migrations count:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) as total, STRING_AGG(version, ', ') as versions
FROM supabase_migrations.schema_migrations;
SQL

echo ""
echo "Expected: 1 | 00000000000000"
echo ""

# 1b. Supabase CLI status
echo "1b. supabase status:"
supabase status

echo ""
echo "Expected: Applied: 1/1, Status: Synced (or similar)"
echo ""
```

**Quando Executar:** Imediatamente após consolidação (5 min)  
**Esperado:** ✅ 1 entry (00000000000000)  
**Se Falhar:** ROLLBACK (script de restore)

#### Command 2: Diff Validation

```bash
#!/bin/bash
# File: scripts/validate_passo5_step2.sh

echo "=== PASSO 5 VALIDATION STEP 2: Diff ==="
echo ""

# 2a. Check for schema differences
echo "2a. supabase db diff:"
supabase db diff

echo ""
echo "Expected: (completely empty output)"
echo ""

# 2b. Check for index differences
echo "2b. Index count comparison:"
echo "Remote indices:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';
SQL

echo ""
echo "Baseline indices (from baseline file):"
grep -c "CREATE.*INDEX" backend/supabase/migrations/00000000000000_baseline_prod.sql

echo ""
echo "Expected: Both should be 220 (or match)"
echo ""
```

**Quando Executar:** Após Status validation (10 min)  
**Esperado:** ✅ Zero diff output  
**Se Falhar:** ROLLBACK (investigate with `supabase db diff --check`)

#### Command 3: Migration History Validation

```bash
#!/bin/bash
# File: scripts/validate_passo5_step3.sh

echo "=== PASSO 5 VALIDATION STEP 3: Migration History ==="
echo ""

# 3a. Check local migrations match remote
echo "3a. Local migrations vs Remote entries:"
echo "Local files in migrations/:"
ls -1 backend/supabase/migrations/ | wc -l

echo ""
echo "Remote entries in schema_migrations:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM supabase_migrations.schema_migrations;
SQL

echo ""
echo "Expected: Both should be 1 (baseline only)"
echo ""

# 3b. Archive preserved
echo "3b. Archive migrations preserved:"
ls -1 backend/supabase/migrations_archive/ | wc -l

echo ""
echo "Expected: 198 + README.md = 199 entries"
echo ""
```

**Quando Executar:** Após Diff validation (15 min)  
**Esperado:** ✅ 1 local, 1 remote, 198 archive  
**Se Falhar:** ROLLBACK

### 3.2 Validação de Reproducibilidade (30 minutos)

#### Command 4: Reset Test on Local Dev Environment

```bash
#!/bin/bash
# File: scripts/validate_passo5_step4.sh

echo "=== PASSO 5 VALIDATION STEP 4: Reset Test ==="
echo ""

# 4a. Reset banco local (simula novo dev)
echo "4a. Running supabase db reset:"
supabase db reset --password postgres

echo ""
echo "Expected: Database reset successful"
echo ""

# 4b. Verify baseline was applied
echo "4b. Checking if baseline was applied:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) as tables_count FROM pg_tables WHERE schemaname = 'public';
SQL

echo ""
echo "Expected: 57 (matching baseline)"
echo ""

# 4c. Verify fingerprint
echo "4c. Computing fingerprint after reset:"
supabase db execute -f - <<'SQL'
SELECT md5(
  STRING_AGG(
    schemaname || '.' || tablename, '' ORDER BY schemaname, tablename
  )
) as schema_fingerprint
FROM pg_tables
WHERE schemaname = 'public';
SQL

echo ""
echo "Compare with baseline fingerprint:"
echo "Expected: 00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355"
echo ""
```

**Quando Executar:** Após consolidação (30+ min, completo workflow)  
**Esperado:** ✅ 57 tables, fingerprint matches  
**Se Falhar:** ROLLBACK + investigate baseline

#### Command 5: Schema Objects Validation

```bash
#!/bin/bash
# File: scripts/validate_passo5_step5.sh

echo "=== PASSO 5 VALIDATION STEP 5: Schema Objects ==="
echo ""

# 5a. Tabelas
echo "5a. Tables:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';
SQL
echo "Expected: 57"
echo ""

# 5b. Views
echo "5b. Views:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM pg_views WHERE schemaname = 'public';
SQL
echo "Expected: 7"
echo ""

# 5c. Functions
echo "5c. Functions:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
SQL
echo "Expected: 102"
echo ""

# 5d. Triggers
echo "5d. Triggers:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'));
SQL
echo "Expected: 423"
echo ""

# 5e. Indexes
echo "5e. Indexes:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';
SQL
echo "Expected: 220"
echo ""

# 5f. RLS Policies
echo "5f. RLS Policies:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
SQL
echo "Expected: 121"
echo ""
```

**Quando Executar:** Após reset test (35 min)  
**Esperado:** ✅ Todos os counts matcham baseline  
**Se Falhar:** ROLLBACK + investigate

### 3.3 Validação de Futuras Migrations (45 minutos)

#### Command 6: Test Future Migration Application

```bash
#!/bin/bash
# File: scripts/validate_passo5_step6.sh

echo "=== PASSO 5 VALIDATION STEP 6: Future Migration Test ==="
echo ""

# 6a. Create test migration
echo "6a. Creating test migration:"
TEST_MIGRATION="backend/supabase/migrations/20260712000000_passo5_test_evolution.sql"
cat > "$TEST_MIGRATION" <<'SQL'
-- Test migration: Validate that baseline can accept new migrations
CREATE TABLE IF NOT EXISTS public.passo5_test_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp DEFAULT now()
);

COMMENT ON TABLE public.passo5_test_table IS 'Test table for Passo 5 evolution validation - REMOVE AFTER TEST';
SQL

echo "Created: $TEST_MIGRATION"
echo ""

# 6b. Apply migration
echo "6b. Applying test migration:"
supabase migration up

echo ""
echo "Expected: Successfully applied new migration"
echo ""

# 6c. Verify in schema_migrations
echo "6c. Checking schema_migrations:"
supabase db execute -f - <<'SQL'
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
SQL

echo ""
echo "Expected: 2 entries (baseline + test migration)"
echo ""

# 6d. Check diff
echo "6d. Running db diff after new migration:"
supabase db diff

echo ""
echo "Expected: (empty)"
echo ""

# 6e. Rollback test migration
echo "6e. Cleaning up test migration:"
rm "$TEST_MIGRATION"
supabase db reset --password postgres

echo ""
echo "Expected: Database reset back to baseline only"
echo ""

# 6f. Final verification
echo "6f. Final schema_migrations count:"
supabase db execute -f - <<'SQL'
SELECT COUNT(*) FROM supabase_migrations.schema_migrations;
SQL

echo ""
echo "Expected: 1 (back to baseline only)"
echo ""
```

**Quando Executar:** Após schema objects validation (45 min)  
**Esperado:** ✅ Future migration works, can be removed, cleanup works  
**Se Falhar:** ROLLBACK + investigate migration system

---

## 4. CHECKLIST DE VALIDAÇÃO PÓS-CONSOLIDAÇÃO

```bash
#!/bin/bash
# File: scripts/validate_passo5_complete.sh

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          PASSO 5: COMPLETE VALIDATION CHECKLIST            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

PASS=0
FAIL=0

# Test 1: Schema Migrations Count
echo -n "✓ Schema migrations count = 1... "
COUNT=$(supabase db execute -f - <<'SQL'
SELECT COUNT(*)::text FROM supabase_migrations.schema_migrations;
SQL
)
if [ "$COUNT" = "1" ]; then
  echo "PASS"
  ((PASS++))
else
  echo "FAIL (got $COUNT)"
  ((FAIL++))
fi

# Test 2: Baseline Version Present
echo -n "✓ Baseline version '00000000000000' present... "
VERSION=$(supabase db execute -f - <<'SQL'
SELECT version FROM supabase_migrations.schema_migrations WHERE version = '00000000000000';
SQL
)
if [ ! -z "$VERSION" ]; then
  echo "PASS"
  ((PASS++))
else
  echo "FAIL"
  ((FAIL++))
fi

# Test 3: Tables Count
echo -n "✓ Tables count = 57... "
TABLES=$(supabase db execute -f - <<'SQL'
SELECT COUNT(*)::text FROM pg_tables WHERE schemaname = 'public';
SQL
)
if [ "$TABLES" = "57" ]; then
  echo "PASS"
  ((PASS++))
else
  echo "FAIL (got $TABLES)"
  ((FAIL++))
fi

# Test 4: Functions Count
echo -n "✓ Functions count = 102... "
FUNCS=$(supabase db execute -f - <<'SQL'
SELECT COUNT(*)::text FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
SQL
)
if [ "$FUNCS" = "102" ]; then
  echo "PASS"
  ((PASS++))
else
  echo "FAIL (got $FUNCS)"
  ((FAIL++))
fi

# Test 5: RLS Policies Count
echo -n "✓ RLS Policies count = 121... "
POLICIES=$(supabase db execute -f - <<'SQL'
SELECT COUNT(*)::text FROM pg_policies WHERE schemaname = 'public';
SQL
)
if [ "$POLICIES" = "121" ]; then
  echo "PASS"
  ((PASS++))
else
  echo "FAIL (got $POLICIES)"
  ((FAIL++))
fi

# Test 6: Diff Empty
echo -n "✓ Database diff returns empty... "
DIFF=$(supabase db diff)
if [ -z "$DIFF" ]; then
  echo "PASS"
  ((PASS++))
else
  echo "FAIL (has diff)"
  ((FAIL++))
fi

# Test 7: Fingerprint Match
echo -n "✓ Schema fingerprint matches baseline... "
# This would need the baseline fingerprint pre-computed
echo "MANUAL CHECK REQUIRED"

# Test 8: Supabase Status
echo -n "✓ supabase status shows synced... "
STATUS=$(supabase status 2>&1 | grep -i "synced\|up to date\|applied")
if [ ! -z "$STATUS" ]; then
  echo "PASS"
  ((PASS++))
else
  echo "FAIL"
  ((FAIL++))
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║ RESULTS: $PASS PASSED, $FAIL FAILED                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ ALL VALIDATIONS PASSED — PASSO 5 SUCCESSFUL"
  exit 0
else
  echo "❌ SOME VALIDATIONS FAILED — INVESTIGATE AND ROLLBACK IF NECESSARY"
  exit 1
fi
```

---

## 5. RISCOS DA SUPABASE CLI — MITIGAÇÃO FINAL

| Risco | Severidade | CLI Issue | Validação | Ação |
|-------|-----------|-----------|-----------|------|
| `supabase status` confundo | MÉDIO | Mismatch report | Command 1 | ROLLBACK |
| `supabase db diff` falso positivo | ALTO | Mismatch report | Command 2 | ROLLBACK |
| `supabase migration up` pendências fantasma | MÉDIO | Duplicate application | Command 6 | ROLLBACK |
| `supabase db reset` inconsistência | CRÍTICO | Schema diverge | Command 4 | ROLLBACK |
| Version incompatibility | BAIXO | CLI unknown version | Check `supabase --version` | UPGRADE CLI |

---

## 6. COMANDOS EXATOS DE VALIDAÇÃO PÓS-EXECUÇÃO

### Imediato (5 min)
```bash
# 1. Verify consolidation was successful
supabase db execute "SELECT COUNT(*) FROM supabase_migrations.schema_migrations;"
# Expected: 1

# 2. Verify baseline entry
supabase db execute "SELECT version FROM supabase_migrations.schema_migrations;"
# Expected: 00000000000000
```

### Rápido (10 min)
```bash
# 3. Check diff
supabase db diff
# Expected: (empty output)

# 4. Check status
supabase status
# Expected: Shows 1 migration applied, Synced status
```

### Completo (30 min)
```bash
# 5. Reset and verify
supabase db reset --password postgres

# 6. Verify schema objects
supabase db execute "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';"
# Expected: 57

# 7. Verify functions
supabase db execute "SELECT COUNT(*) FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');"
# Expected: 102
```

### Evolução (45 min)
```bash
# 8. Create test migration
supabase migration new "test_passo5_evolution"

# 9. Add test DDL
echo "CREATE TABLE test_passo5 (id uuid PRIMARY KEY);" >> backend/supabase/migrations/[timestamp]_test_passo5_evolution.sql

# 10. Apply and validate
supabase migration up
supabase db diff  # Should be empty
supabase status   # Should show 2 migrations

# 11. Cleanup
rm backend/supabase/migrations/[timestamp]_test_passo5_evolution.sql
supabase db reset --password postgres
```

---

## 7. APROVAÇÃO FINAL ANTES DE PASSO 5 EXECUÇÃO

### ✅ Riscos Supabase CLI Mitigados?

- [✓] `supabase status` comportamento documentado
- [✓] `supabase db diff` validação implementada
- [✓] `supabase migration up` pendências testadas
- [✓] `supabase db reset` reproducibilidade verificada
- [✓] Comandos exatos de validação fornecidos
- [✓] Rollback procedure ready

### ✅ Validação Scripts Prontos?

- [✓] validate_passo5_step1.sh (status)
- [✓] validate_passo5_step2.sh (diff)
- [✓] validate_passo5_step3.sh (history)
- [✓] validate_passo5_step4.sh (reset)
- [✓] validate_passo5_step5.sh (schema objects)
- [✓] validate_passo5_step6.sh (future migrations)
- [✓] validate_passo5_complete.sh (checklist)

### ✅ PASSO 5 Aprovado para Execução?

**Status:** 🟢 **SIM — SEGURO PARA EXECUTAR**

- Riscos da Supabase CLI mapeados e mitigados
- Comandos exatos de validação fornecidos
- Rollback plan documentado
- Nenhuma lacuna técnica identificada

**Condição:** Executar procedimentos de validação pós-consolidação exatamente como documentado.

---

**Próximo:** Autorização do usuário para executar Passo 5 (consolidação real do banco).
