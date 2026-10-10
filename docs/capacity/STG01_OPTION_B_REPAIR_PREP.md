# STG-01 Option B — Análise e preparação do reparo (sem escrita remota)

**Data:** 2026-10-10  
**Escopo:** somente análise + preparação + dry-run local  
**Proibido nesta etapa:** `db push`, `migration repair`, `apply_migration`, `psql` de escrita, DDL remoto, alteração/exclusão do staging, produção, AgeGuard, MCP fragmentado  
**Auth futura:** apenas mecanismos seguros do ambiente (secrets manager / `supabase login` / link CLI) — **não** colar credenciais no chat

Artefatos gerados:

| Arquivo | Conteúdo |
|---------|----------|
| `docs/capacity/staging/repair-prep/matrix.csv` | Matriz 406×histórico |
| `docs/capacity/staging/repair-prep/matrix.json` | Classificação completa |
| `docs/capacity/staging/repair-prep/synthetic-map.json` | 48 órfãos → Git |
| `docs/capacity/staging/repair-prep/summary.json` | Contagens |
| `docs/capacity/staging/repair-prep/normalize-dry-run-report.json` | Dry-run SQLite local |
| `docs/capacity/staging/repair-prep/class-*.md` | Listas por status |
| `scripts/capacity/build-migration-matrix.mjs` | Gerador offline |
| `scripts/capacity/dry-run-history-normalize.mjs` | Homologação local do plano |

---

## 1. Matriz Git × staging

| Fonte | Contagem |
|-------|---------:|
| Arquivos `backend/supabase/migrations/*.sql` | **406** |
| `supabase_migrations.schema_migrations` (snapshot) | **339** |
| Órfãos no histórico (sem arquivo 1:1) | **48** |

### Classificação (por arquivo Git)

| Status | Qtd | Significado |
|--------|----:|-------------|
| `applied_verified` | **301** | Histórico exato e/ou fingerprints DDL presentes no schema |
| `partial` | **60** | Evidência incompleta (schema parcial e/ou histórico sem cobertura total) |
| `indeterminate` | **40** | Sem fingerprint extraível e/ou histórico ambíguo |
| `not_applied` | **5** | Sem histórico e fingerprints ausentes |

Regenerar offline (sem rede):

```bash
node scripts/capacity/build-migration-matrix.mjs
node scripts/capacity/dry-run-history-normalize.mjs
```

Pré-requisito local: `tmp/stg-repair-prep/schema_sets.json` + `docs/capacity/staging/repair-prep/history-snapshot.json` (já versionados / gerados nesta pausa).

---

## 2. Entradas sintéticas (48)

Ver `synthetic-map.json`. Padrões:

- splits (`045_*_p1/p2/p3`, `066_*_tail`, `296_*_ddl1/ddl2`)
- batches (`batch_*`, `303_304_305_308_batch`, `209_210_fiscal_campos`, `chunk013_medium_batch`)
- renomes curtos (`291_*`, `295_*`, `298_*` …) mapeados a stems timestampados quando possível

**Política Option B:** mapear e documentar; **não** apagar órfãos remotamente nesta etapa; **não** registrar canônico só porque existe sintético — exige fingerprint ou nome exato.

`chunk013_medium_batch`: confiança **low** — não usar como prova para register canônico.

---

## 3. Ledger financeiro (parcial) — investigação

Arquivo: `20261005004647_financeiro_loja_contas_ledger.sql`  
Status: **`partial`**  
Histórico: **ausente** (`hist_financeiro = []`)

| Objeto esperado | Presente? |
|-----------------|:---------:|
| 6 tabelas (`contas_financeiras` … `conciliacoes_financeiras`) | sim |
| Colunas extras AP/AR / `conta_financeira_id` | sim |
| Funções `internal.financeiro_*` (9) | sim |
| Triggers `financeiro%` (8) | sim |
| Policies `financeiro_leitura` (6) | sim |
| `public.financeiro_comando` | **não** |
| `public.financeiro_painel` | **não** |
| `public.financeiro_candidatos_conciliacao` | **não** |

Interpretação: DDL + camada internal/triggers aplicados via `execute_sql` (ou apply interrompido) **antes** das RPCs públicas do final do arquivo.  
**Não registrar** como aplicada. Próxima etapa autorizada deve **completar** o SQL restante (RPCs públicas + grants) de forma idempotente, depois registrar.

Leftover MCP: tabela `public._stg_mig_scratch` ainda existe — limpeza só com autorização explícita.

---

## 4. Plano de normalização canônica (preparado, não executado)

### 4.1 O que é seguro propor (subset)

Dry-run local (SQLite clone do snapshot):

- before: **339**
- after simulado: **359** (+**20** INSERTs)
- skips: 0
- **105** stems `partial|not_applied|indeterminate` → **proibidos** de register

Os 20 candidatos estão em `normalize-dry-run-report.json` → `proposed_inserts`  
(critério: `applied_verified` + fingerprint completo + nome canônico ausente + versão 14 dígitos livre).

### 4.2 O que NÃO fazer no repair de histórico

- Registrar `partial` / `not_applied` / `indeterminate`
- Apagar sintéticos sem gate humano
- `supabase migration repair` em massa sem matriz
- `db push` antes do histórico canônico (risco de reexecutar 406)

### 4.3 Sequência futura (após aprovação + auth segura)

1. Auth CLI via fluxo oficial (`supabase login` / token em secret store do ambiente) — **não** no chat.
2. Backup lógico do histórico: `SELECT version,name FROM supabase_migrations.schema_migrations` → arquivo local.
3. Aplicar **somente** os INSERTs do dry-run (histórico), um a um, em staging.
4. Revalidar matriz (`build-migration-matrix`).
5. Só então discutir apply DDL dos `not_applied`/`partial` (missão separada).

---

## 5. Homologação local isolada (executada)

Ambiente: **SQLite in-memory** (`node:sqlite`) clonando o snapshot — **zero** conexão Postgres remota.

```bash
node scripts/capacity/dry-run-history-normalize.mjs
# → docs/capacity/staging/repair-prep/normalize-dry-run-report.json
```

Docker/`psql` local indisponíveis neste VM; o dry-run cobre a lógica de INSERT/colisões/política. Validação de DDL real permanece bloqueada até auth + aprovação.

---

## 6. Comandos propostos (futuros — NÃO executar agora)

```bash
# A) Regenerar matriz (local)
node scripts/capacity/build-migration-matrix.mjs

# B) Dry-run normalize (local)
node scripts/capacity/dry-run-history-normalize.mjs

# C) Após aprovação + auth segura no ambiente (exemplo; staging only):
#    npx supabase link --project-ref "$CAPACITY_ALLOWED_PROJECT_REF"
#    # aplicar INSERTs de histórico a partir de proposed-history-inserts.json
#    # via SQL controlado / migration repair pontual — NUNCA db push cego
```

Guards já existentes: `pdv-importados/scripts/staging/assert-staging-target.mjs` + denylist.

---

## 7. Riscos e rollback

| Risco | Mitigação |
|-------|-----------|
| Registrar migration não aplicada | Política fingerprint; dry-run bloqueia partial/indet |
| Colisão de `version` canônica | Dry-run checa PK; skip em colisão |
| `db push` prematuro | Explicitamente fora do Option B |
| Apagar sintéticos que documentam batch | KEEP até gate humano |
| Completar financeiro sem idempotência | Requer script `IF NOT EXISTS` / `CREATE OR REPLACE` |
| Leftover `_stg_mig_scratch` | Limpeza opcional pós-autorização |

**Rollback (histórico):** `DELETE FROM supabase_migrations.schema_migrations WHERE version IN (…) AND name IN (…)` apenas das linhas inseridas pelo repair — requer backup prévio. Sem DDL nessa fase, rollback de schema não se aplica.

---

## 8. Critérios de aceitação (Option B)

- [x] Matriz 406 gerada e classificada
- [x] 48 sintéticas mapeadas (arquivo `synthetic-map.json`)
- [x] Financeiro documentado como `partial` com RPCs públicas faltantes
- [x] Dry-run local sem escrita remota
- [x] Lista de INSERTs seguros (20) vs bloqueados (105)
- [ ] **Gate humano** antes de qualquer escrita no staging

---

## 9. Veredito de segurança

**O reparo de histórico NÃO pode ser executado de ponta a ponta com segurança agora.**

- **Pode** (após aprovação): inserir no histórico **apenas** o subset dry-run de **20** stems `applied_verified` com fingerprint completo.
- **Exige intervenção manual** antes de qualquer register/apply:
  - **60** `partial` (inclui financeiro — completar RPCs públicas)
  - **40** `indeterminate`
  - **5** `not_applied`
  - órfãos sintéticos de confiança baixa (`chunk013_medium_batch`)

**Aguardando aprovação explícita** antes de modificar o banco remoto.
