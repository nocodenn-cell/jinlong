# ADR-011 — SSOT único de migrations e modelo de numeração

| Campo | Valor |
|--------|--------|
| **ID** | ADR-011 |
| **Título** | Fonte única de migrations (`backend/supabase/migrations/`) e numeração timestamp |
| **Status** | Aceito |
| **Data** | 2026-08-13 |
| **Missão** | Remediação P0 — integridade estrutural de schema |
| **Relacionados** | [FASE_3_1](../FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md) · [FASE_3_2](../FASE_3_2_REAPPLY_VENDA_FINANCE_CONTEXT.md) · [archive legacy](../archive/legacy-pdv-importados-supabase/README.md) · `scripts/migration-sequence-guard.mjs` |

---

## Contexto

A assimilação documental de 2026-08-13 encontrou **dois** diretórios de migrations no monorepo e
**dois** esquemas de numeração convivendo no diretório canônico. Nenhum dos dois estava registrado
como decisão — eram estados de fato.

**Diretório paralelo.** `pdv-importados/supabase/migrations/` não era lido pelo Supabase CLI nem
pelo CI, mas era aplicado por `EXECUTAR_MIGRATIONS*.sh` via `psql "$DATABASE_URL"`, documentado
como procedimento oficial em três `.md`. Um desses arquivos recriava
`finalizar_venda_transacional_canonica_v3` (18 args) e dropava a v2, enquanto produção roda a
**v4 com 22 args e scope-guard**. Regressão do núcleo transacional a um comando de distância.
Evidência completa em [`docs/archive/legacy-pdv-importados-supabase/README.md`](../archive/legacy-pdv-importados-supabase/README.md).

**Numeração dupla.** `backend/supabase/migrations/` tem **125** arquivos sequenciais (`001_`…`127_`)
e **145** com prefixo timestamp (`20260809120837_`…). A transição nunca foi formalizada, e produziu
15 colisões número↔versão já catalogadas em
`backend/supabase/reports/phase3-collision-diff-summary.json`.

## Decisão

### 1. SSOT único

O único diretório de migrations aplicáveis do monorepo é:

```
backend/supabase/migrations/
```

Justificado por: único `config.toml` de projeto Supabase CLI (`backend/supabase/config.toml`,
`project_id = "fastproduct"`); alvo exclusivo de `scripts/migration-sequence-guard.mjs`, dos
scripts de backport/reconciliação em `backend/supabase/scripts/` e dos testes de contrato em
`pdv-importados/tests/`.

**Proibido** criar qualquer outro diretório `migrations/` com `.sql`. SQL histórico vai para
`docs/archive/`, onde nenhum tooling o lê.

**Proibido** aplicar schema por script `psql` ad-hoc fora do fluxo do Supabase CLI. Migration que
não passa pelo SSOT não existe.

### 2. Numeração

| Esquema | Status | Regra |
|---|---|---|
| Timestamp (`YYYYMMDDHHMMSS_nome.sql`) | **Vigente** | Todo arquivo novo usa este formato |
| Sequencial (`NNN_nome.sql`) | **Histórico congelado** | Não criar novos; não renomear os existentes |

Os sequenciais **não serão renumerados**: têm histórico remoto em `supabase_migrations.schema_migrations`
e renomear quebraria replay e `db reset` em ambientes existentes.

### 3. Colisões herdadas

As 15 colisões catalogadas permanecem como dívida **explícita e documentada**, nunca reexecutadas.
Regra por par já registrada em `phase3-collision-diff-summary.json` (ex.: `255_grant_baseline`
× `255_vendas_em_espera` → prevalece o timestamp para a feature de espera).

`INHERITED_COLLISIONS` no guard permanece **vazio**: qualquer colisão *nova* falha o CI.

### 4. O reconciliador superestima o drift — não confiar nos números crus

`reconcile-prod-repo-inventory.mjs` casa repo × produção **apenas pelo prefixo de versão**. Como a
renomeação sequencial → timestamp mudou esse prefixo sem mudar o conteúdo, o mesmo arquivo aparece
duas vezes: como `onlyRepo` (chave nova) e como `onlyProd` (chave antiga).

Medição de 2026-08-13 (3 execuções idênticas — o script **é** determinístico):

| Métrica | Valor |
|---|---|
| `repoFiles` / `prodTracked` | 270 / 263 |
| `onlyRepo` / `onlyProd` | **80 / 73** |
| `nameMismatch` | 0 |
| Entradas de `onlyProd` com arquivo correspondente no repo | **73 de 73** |
| Migrations realmente ausentes | **0** |

Exemplo do par: prod rastreia `205 force_com_nf`; o repo tem
`20260621000100_205_force_com_nf.sql`. Mesma migration, duas chaves.

**Consequências práticas:**

1. O relatório commitado `backend/supabase/reports/reconcile-prod-repo-inventory.json` foi gerado em
   2026-08-08 com `onlyRepo=4 / onlyProd=0`. **Esses números não reproduzem hoje** — rodar o script
   sobrescreve o arquivo com 80/73. Não citar o valor antigo como prova de alinhamento.
2. `onlyProd > 0` **não** significa que produção tem migration que o repo não tem. Antes de tratar
   qualquer entrada como drift, pareie por **nome** da migration, não por versão.
3. O drift real e comprovado continua sendo apenas o de `venda_finance_context`
   (tracking × catálogo), tratado na trilha FASE_3.

Corrigir o script para parear por nome é melhoria desejável, **não** feita aqui: mexer no
reconciliador durante uma reconciliação em aberto trocaria uma medição conhecida-imprecisa por uma
não validada.

### 5. Ledger remoto

Este ADR **não** autoriza correção do ledger remoto. O drift conhecido
(`schema_migrations.version='252'` marcada como applied com objetos ausentes do catálogo) é tratado
pela trilha FASE_3, sob HUMAN GATE, e nunca por `migration repair`.

## Consequências

**Positivas.** Ordem de aplicação determinística; impossível regredir a RPC transacional por script
paralelo; guard automatizado impede reincidência.

**Negativas.** Os dois esquemas de numeração continuam convivendo no mesmo diretório — resolver
isso exigiria renomear migrations com histórico remoto, o que é mais arriscado que a inconsistência
estética. Aceito como dívida permanente e documentada.

## Enforcement

`scripts/migration-sequence-guard.mjs` falha (exit 1) quando encontra diretório `migrations/`
contendo `.sql` fora do SSOT canônico, ignorando `docs/archive/`. Roda em `npm run guard:all` e no
CI. Comportamento verificado com teste negativo em 2026-08-13.
