# Plano de Reconciliação — Estratégia Baseline Squash

**Data:** 2026-07-11 23:40 UTC  
**Status:** ✅ Passo 1 concluído — Pronto para Passo 2  
**Evidência:** BASELINE_PRODUCAO.md + MAPA_DE_EQUIVALENCIA.md

---

## Objetivo Final

Após reconciliação, o repositório será a **Single Source of Truth** para schema:

```
┌─────────────────────────────────────────┐
│ Repositório (baselines + migrations)    │
│ ───────────────────────────────────────  │
│ • 00000000000000_baseline_prod.sql      │
│ • 20260712HHMMSS_migration_1.sql        │
│ • 20260712HHMMSS_migration_2.sql        │
└─────────────────────────────────────────┘
         ↓ (supabase db reset)
┌─────────────────────────────────────────┐
│ Banco Local / Staging / Produção (novo) │
│ ───────────────────────────────────────  │
│ Schema idêntico bit-a-bit ao banco      │
│ atual (mesmo fingerprint SHA256)        │
└─────────────────────────────────────────┘
```

---

## Passo 2 — Gerar Baseline (Próximo)

### 2.1 Dump do Schema de Produção

**Comando:**
```bash
supabase db dump --schema-only \
  --project-id kbabmewnahysfvlybiak \
  --output backend/supabase/migrations/00000000000000_baseline_prod.sql
```

**Ou via pg_dump:**
```bash
pg_dump --schema-only \
  --dbname "postgresql://..." \
  --no-owner --no-privileges \
  > backend/supabase/migrations/00000000000000_baseline_prod.sql
```

**Inclusões (capturado em BASELINE_PRODUCAO.md):**
- ✅ Schema de 64 tabelas + 8 views
- ✅ 102 funções (inclusão RPC v4 com FIADO-guard seguro)
- ✅ 220 índices (inclusão clientes_loja_documento_unique #266)
- ✅ 24 triggers
- ✅ 121 RLS policies (inclusão clientes INSERT/UPDATE/DELETE policies #265)
- ✅ 10 extensões
- ✅ 1 storage bucket (produto-imagens)
- ✅ Grants (permissões por role)

**Exclusões (não no baseline — esquema congelado):**
- ❌ Dados (`INSERT`, `COPY`) — apenas schema (DDL)
- ❌ `schema_migrations` table — será recriada por Supabase CLI
- ❌ Auth schema (gerenciado por Supabase separadamente)

### 2.2 Inclusão de Migrations Órfãs

O dump acima já contém as estruturas finalizadas. Porém, será necessário adicionar **migration records** correspondentes para rastreabilidade histórica.

**Adição ao baseline (comentário):**
```sql
-- Baseline snapshot de produção (2026-07-11 23:40 UTC)
-- Incorpora:
-- - 12 migrations aplicadas em produção (schema_migrations)
-- - 6 renumeradas do repo (relação banco ↔ repo documentada)
-- - 2 órfãs prod-only (265, 266): RLS clientes + índice único
-- - 1 órfã relativa (259_historico): será capturada pós-Go-Live
-- Fingerprint SHA256: 00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355
```

---

## Passo 2 — Validação: Diff Vazio (Gate Obrigatório)

### 2.3 Teste em Banco Shadow

**Processo:**
1. Clonar banco produção → shadow/test bank (Supabase branch ou local Postgres)
2. Aplicar baseline: `supabase db reset --password <pwd> --project-id shadow-id`
3. Comparar schema shadow vs produção atual

**Validação:**
```bash
# Gerar diff entre baseline-rebuilt e produção
pg_dump --schema-only <shadow> > /tmp/shadow.sql
pg_dump --schema-only <production> > /tmp/prod.sql

diff -u /tmp/prod.sql /tmp/shadow.sql
# Expected: (empty diff = PASS)
```

### 2.4 Fingerprint Validation (Bit-a-Bit)

**Comparação:**
```sql
-- Em produção
SELECT sha256(pg_dump(schema_only)) → 00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355

-- Em banco reconstruído a partir do baseline
SELECT sha256(pg_dump(schema_only)) → ?????

-- Se iguais: ✅ PASS (equivalência bit-a-bit comprovada)
-- Se diferentes: 🔴 ABORT (não prosseguir com Passo 3/4)
```

### 2.5 Gate Decision

**Critério de Progressão:**
- ✅ Diff vazio: **Prosseguir para Passo 3**
- ❌ Diff não-vazio: **ABORT** — investigar, corrigir baseline, revalidar

**Caso ABORT:**
- Documentar diferenças encontradas
- Investigar causa (função não capturada? trigger? grant?)
- Regenrar baseline
- Revalidar

---

## Passo 3 — Arquivar Histórico Legado (Não-Destrutivo para Produção)

### 3.1 Reorganizar Repo

**Antes:**
```
backend/supabase/migrations/
├── 001_schema_inicial.sql
├── 002_...
├── ...
├── 268_finalizar_venda_v4_guard...
└── (198 arquivos total)
```

**Depois:**
```
backend/supabase/migrations/
├── 00000000000000_baseline_prod.sql (novo, único)
│
migrations_archive/ (novo diretório)
├── 001_schema_inicial.sql
├── 002_...
├── ...
├── 268_finalizar_venda_v4_guard...
└── (198 arquivos: histórico preservado)
```

**Comando:**
```bash
mkdir -p backend/supabase/migrations_archive
git mv backend/supabase/migrations/[001-268_* backend/supabase/migrations_archive/
# Deixar apenas baseline
git add -A
git commit -m "refactor: archive legacy migrations, retain baseline"
```

### 3.2 Documentação

Criar `migrations_archive/README.md`:
```markdown
# Archived Migrations

Historical record of 198 migrations (001-268) applied before baseline consolidation.

Baseline (`00000000000000_baseline_prod.sql`) incorporates all schema changes.

## Index

- 001-127: Core schema (2024-2025)
- 20260419-20260620: Supabase transitions, v3 experimental
- 247a-247c: Payment/sales iterations
- 258-268: Go-Live integration (renumbered for sequence)

## Reconstruction

These are archived for audit trail only. Deployments use:
`supabase db reset → baseline only → future migrations`
```

---

## Passo 4 — Reparar schema_migrations (Metadata, Não-Schema)

### 4.1 Backup (Obrigatório)

**Antes de qualquer alteração:**
```sql
-- Backup das 12 entradas atuais
COPY (SELECT * FROM supabase_migrations.schema_migrations) 
TO '/tmp/schema_migrations_backup_2026-07-11.csv';
```

### 4.2 Limpeza de Tracking

**Operação: Consolidar 12 entradas em 1 baseline**

```sql
-- Remover as 12 entradas antigas (manter backup acima)
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260707183145', '20260709184734', '20260710163032', 
  '20260710212200', '20260710212305', '20260710212349',
  '20260710212628', '20260711015958', '20260711020021', 
  '20260711020053', '20260711143312', '20260711230618'
);

-- Inserir entrada única do baseline
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '00000000000000',
  '00000000000000_baseline_prod',
  ARRAY['-- Baseline snapshot (00000000000000) replaces 12 prior migrations']::text[]
);
```

**Impact:**
- ✅ `supabase db push` — reconhece baseline como "current state"
- ✅ `supabase migration up` — nada a fazer (baseline já aplicado)
- ✅ Futuras migrations (20260712+) — append-only, rastreadas

### 4.3 Pós-Limpeza

**Garantias:**
- ✅ Dados: Nenhum `INSERT`, `UPDATE`, `DELETE` foi executado
- ✅ Schema: Nenhuma tabela/função/trigger modificada
- ✅ Operação**: Apenas tabela de tracking atualizada
- ✅ Reversível:** Backup em `/tmp/schema_migrations_backup_*.csv`

---

## Passo 5 — Determinismo

**Após Passo 4, o histórico é determinístico:**

```bash
# Cenário 1: Banco novo (staging)
$ supabase db reset
$ supabase migration up
# Resultado: schema idêntico a produção (baseline aplicado, nenhuma migração futura ainda)

# Cenário 2: Produção existente (upgrade)
$ git pull origin main  # Contains baseline + new migrations
$ supabase migration up
# Resultado: apenas novas migrations (258-268+) aplicadas, baseline reconhecido como "já aplicado"
```

---

## Passo 6 — Migrations Futuras (Append-Only)

### 6.1 Política Rigorosa

**Formato obrigatório (timestamp, não numérico):**
```bash
supabase migration new "nome_descritivo"
# Gera: backend/supabase/migrations/20260712141530_nome_descritivo.sql
```

**Regra: Nenhuma renumeração, nenhuma modificação de já-commitadas.**

### 6.2 CI Guards (Passo 7)

5 checks automáticos:

1. **migration-format-guard** — Rejeita `259_` (numérico); exige `20260712HHMMSS_` (timestamp)
2. **migration-unique-version-guard** — Nenhum par de arquivos compartilha prefixo
3. **migration-append-only-guard** — Migrations commitadas nunca são modificadas
4. **migration-drift-guard** — `supabase db reset` + diff contra baseline = deve ser vazio
5. **migration-sequence-guard** — Verifica cronologia e compatibilidade

---

## Passo 7 — Guards CI (Impedir Recorrência)

### 7.1 Implementação (Exemplo: .github/workflows/migration-guards.yml)

```yaml
name: Migration Guards
on: [pull_request, push]

jobs:
  format-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check timestamp format
        run: |
          for f in backend/supabase/migrations/*.sql; do
            if [[ $(basename "$f") =~ ^[0-9]{14}_ ]]; then
              echo "✅ $f"
            else
              echo "❌ $f — must be 20260712HHMMSS_ format"
              exit 1
            fi
          done

  drift-guard:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
    steps:
      - uses: actions/checkout@v4
      - name: Spin up Postgres
        run: |
          docker-compose -f docker/postgres.yml up -d
          sleep 5
      - name: Apply baseline + migrations
        run: |
          psql -U postgres -h localhost -f backend/supabase/migrations/00000000000000_baseline_prod.sql
          for f in backend/supabase/migrations/2026*.sql; do
            psql -U postgres -h localhost -f "$f"
          done
      - name: Diff against snapshot
        run: |
          pg_dump --schema-only > /tmp/current.sql
          diff -u backend/supabase/schema.snapshot.sql /tmp/current.sql
          # Exit 1 if diff non-empty
```

### 7.2 Snapshot Reference

**Gerar após Passo 2 validação:**
```bash
pg_dump --schema-only -d <prod> > backend/supabase/schema.snapshot.sql
git add backend/supabase/schema.snapshot.sql
git commit -m "docs: schema snapshot (baseline validation reference)"
```

---

## Timeline Executivo

| Passo | Etapa | Tempo Estimado | Risco | Gate |
|-------|-------|-------------------|--------|------|
| 0 | Prova de Equivalência | ✅ Completo | Nenhum | — |
| 1 | Capturar Schema Produção | ✅ Completo | Nenhum | — |
| **2** | **Gerar + Validar Baseline** | ~1h | Médio (diff não-vazio?) | **Diff vazio** |
| 3 | Arquivar Histórico | ~15m | Baixo (reversível) | — |
| 4 | Reparar schema_migrations | ~10m | Médio (metadata, não-schema) | Backup OK |
| 5 | Testar Determinismo | ~30m | Baixo | Verify in staging |
| 6 | Políticas Futuras | Contínuo | N/A | — |
| 7 | CI Guards | ~2h | Baixo (CI only) | CI passing |

**Total:** ~4h (não-interrupção, passo 2 é gate crítico)

---

## Critério de Sucesso — Passo 2

Para avançar para Passo 3, TODAS estas condições devem estar em verde:

### ✅ Baseline Exists
- [ ] Arquivo `00000000000000_baseline_prod.sql` existe
- [ ] Contém DDL para 64 tabelas
- [ ] Contém 102 funções (v4 com FIADO-guard)
- [ ] Contém 121 RLS policies (inclusive #265 clientes)
- [ ] Contém 220 índices (inclusive #266 clientes_loja_documento_unique)

### ✅ Diff Vazio
- [ ] Shadow bank + baseline = produção (pg_dump diff = empty)
- [ ] Sem tabelas extras, sem colunas faltando
- [ ] Sem triggers perdidos, sem functions modificadas

### ✅ Fingerprint Match
- [ ] SHA256 banco produção = SHA256 baseline reconstruído
- [ ] Equivalência bit-a-bit comprovada

### ✅ Órfãs Capturadas
- [ ] #265_clientes RLS policies presentes no baseline
- [ ] #266_clientes índice único presente no baseline
- [ ] #259_historico_precos (de PR #148) capturado ou planejado pós-Go-Live

### ✅ Documentação
- [ ] BASELINE_PRODUCAO.md ← Estado capturado
- [ ] MAPA_DE_EQUIVALENCIA.md ← Mapeamento banco/repo
- [ ] Este documento ← Plano executivo

**Se TODAS as checkbox estão [✓]:** Aprovado para Passo 3

---

## Rollback (Se Diff Não-Vazio)

**Cenário:** Passo 2 falha (diff encontrado)

1. **Não Prosseguir.** Abortar e não executar Passos 3/4
2. **Investigar:** Qual objeto está faltando?
   ```bash
   diff -u /tmp/prod.sql /tmp/baseline.sql | head -50
   ```
3. **Corrigir Baseline:** Adicionar função/trigger/trigger ausente
4. **Revalidar:** Repetir Passo 2 inteiro
5. **Documentar:** Atualizar BASELINE_PRODUCAO.md

---

## Próximo: Aprovação para Passo 2

Este documento documenta:
- ✅ Estado atual capturado (Passo 1)
- ✅ Plano de validação (Passo 2 — gate crítico)
- ✅ Estratégia pós-validação (Passos 3-7)
- ✅ Critério de sucesso (bit-a-bit equivalência)

**Aguardando aprovação do usuário para proceder a Passo 2.**
