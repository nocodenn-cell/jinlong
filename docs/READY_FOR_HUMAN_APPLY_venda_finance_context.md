# READY FOR HUMAN APPLY — `venda_finance_context` (20260808130200)

**Preparado em:** 2026-08-13 · **Executor:** o dono do projeto, manualmente
**Estado:** validado em ambiente efêmero · **produção NÃO tocada** nesta preparação

> Este documento existe para ser executado por um humano. Nenhum comando abaixo foi rodado contra
> produção. Decisão de origem: `FASE_3_1` (**MANTER + idempotentizar**) — a solução **não** foi
> redesenhada, apenas validada.

---

## 1. O que se está corrigindo

Produção declara a migration **`252`** como aplicada em `supabase_migrations.schema_migrations`,
mas **os objetos que ela deveria ter criado não existem no catálogo**. O ledger de migrations diz
uma coisa e o banco mostra outra — drift **tracking × catálogo**.

A correção **não** é reexecutar a `252` (a chave já ocupa PK no ledger; replay não é caminho SSOT).
É aplicar uma **nova versão timestamp** com o mesmo DDL, idempotente.

| Campo | Valor |
|---|---|
| **Arquivo** | `backend/supabase/migrations/20260808130200_24704_reapply_venda_finance_context_idempotent.sql` |
| **Versão a registrar** | `20260808130200` |
| **Nome** | `24704_reapply_venda_finance_context_idempotent` |
| **SHA256** | `841824a6239ee064dcc23c9bd231f1d060173af4cee47d85d9a4bc51599c2d98` |
| **Linhas** | 203 |
| **Chave 252** | **NUNCA reexecutar** — permanece só como histórico |

## 2. O que a migration faz (diff SQL resumido)

Puramente **aditiva**. Não altera `vendas`, caixa, `contas_receber`, nem qualquer RPC do núcleo
transacional.

| # | Objeto | Operação |
|---|---|---|
| 1 | `public.venda_finance_context` | `CREATE TABLE IF NOT EXISTS` (espelho passivo) |
| 2 | `idx_venda_finance_context_{loja,status,conta}` | `CREATE INDEX IF NOT EXISTS` |
| 3 | RLS + `venda_finance_context_select_loja` | `ENABLE ROW LEVEL SECURITY` + `DROP/CREATE POLICY` (SELECT por loja) |
| 4 | `sincronizar_finance_context_venda(uuid)` | `CREATE OR REPLACE`; `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE` a `authenticated` e `service_role` |
| 5 | `trg_finance_context_via_pagamento()` / `_via_conta()` | `CREATE OR REPLACE` |
| 6 | `trg_finance_context_pagamento` em `vendas_pagamentos`; `trg_finance_context_conta` em `contas_receber` | `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` |
| 7 | Backfill | `DO $$ … FOR r IN SELECT id FROM vendas WHERE status='CONCLUIDA' LOOP PERFORM sincronizar_finance_context_venda(r.id) …` |

Ver arquivo completo para o DDL literal.

## 3. Validações executadas (evidência desta preparação)

| Gate | Comando | Resultado |
|---|---|---|
| Gate Fase 3.2 | `node backend/supabase/scripts/validate-phase3-2.mjs` | ✅ exit 0 |
| Backport Fase 1 | (embutido no acima) | ✅ **30/30** arquivos |
| Sequência de migrations | `npm run guard:migrations` | ✅ OK — 270 `.sql`, sem colisão |
| **Catálogo, base limpa** | smoke isolado, Postgres 16 efêmero + `phase3-2-smoke-stubs.sql` | ✅ **10/10 checks** |
| **Idempotência** | migration aplicada **3×** na mesma base | ✅ 2ª e 3ª aplicações concluem com `NOTICE … already exists, skipping` |
| Guards do monorepo | `npm run guard:all` | ✅ 9/9 |
| Testes web | `npx vitest run` (pdv-importados) | ✅ 177 arquivos / 906 testes |

**10/10 checks de catálogo, base limpa:** `table_venda_finance_context` · `fn_sincronizar` ·
`fn_trg_pagamento` · `fn_trg_conta` · `trg_pagamento` · `trg_conta` · `policy_select` ·
`idx_loja` · `idx_status` · `idx_conta`.

### 3.1 Gate que NÃO foi possível fechar

`supabase db reset --local` — **BLOCKED EXTERNALLY**. O agente cloud tem cliente Docker mas
**nenhum daemon** (`/var/run/docker.sock` inexistente), e `ci-backend-supabase.yml` depende da stack
Supabase local para o reset. Mesmo bloqueio já registrado em `FASE_3_2 §2`.

Tentativa de substituto: replay manual das 270 migrations em Postgres vanilla com
`ci_stub_supabase_auth.sql`. Avançou **88/270** e parou em
`088_produto_imagens_storage_bucket.sql` → `ERROR: relation "storage.buckets" does not exist` — o
stub cobre o schema `auth`, não `storage`. **Não é falha da migration 20260808130200**; é limitação
do substituto. Registrado aqui em vez de mascarado.

> **Portanto:** o reset completo continua sendo pré-requisito do §4 e precisa rodar na sua máquina
> (ou num runner com Docker) **antes** do apply.

## 4. Procedimento de apply — comandos exatos

### Passo 1 — fechar o gate que falta (máquina com Docker)

```bash
cd backend
npx supabase db reset --local --yes
```

Depois, verificar o catálogo local:

```bash
psql "$(npx supabase status -o env | grep DATABASE_URL | cut -d= -f2-)" \
  -f supabase/scripts/verify-venda-finance-context-catalog.sql
```

Esperado: os mesmos 10 checks do §3. **Se algum falhar, PARE** — não siga para produção.

### Passo 2 — revisar o diff

```bash
sha256sum backend/supabase/migrations/20260808130200_24704_reapply_venda_finance_context_idempotent.sql
# deve bater com 841824a6239ee064dcc23c9bd231f1d060173af4cee47d85d9a4bc51599c2d98
```

### Passo 3 — janela operacional

O backfill percorre **linha a linha** todas as vendas `CONCLUIDA`. Meça antes:

```sql
SELECT count(*) FROM public.vendas WHERE status = 'CONCLUIDA';
```

Poucos milhares → segundos. Ordem de centenas de milhares → agende janela fora do horário de
operação do caixa.

### Passo 4 — apply em produção

Aplicar **somente** a versão `20260808130200`, com o **conteúdo do arquivo timestamp** e o nome
`24704_reapply_venda_finance_context_idempotent`. **Nunca** o arquivo `252_*.sql`.

```bash
cd backend
npx supabase db push --linked --include-all=false
```

Confirme na saída que a **única** versão pendente enviada é `20260808130200`. Se aparecer qualquer
outra, **cancele** e reconcilie antes.

### Passo 5 — verificação pós-apply (read-only)

```bash
psql "$PROD_URL" -f backend/supabase/scripts/verify-venda-finance-context-catalog.sql
```

E confirme o ledger:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE version IN ('252','20260808130200') ORDER BY version;
```

Esperado: **duas** linhas — `252` (histórica, intocada) e `20260808130200` (nova). Arquive o JSON de
saída junto aos demais em `backend/supabase/reports/`.

## 5. Risco

| Risco | Severidade | Mitigação |
|---|---|---|
| Backfill pesado trava escrita em `vendas` | **Média** | Medir com a query do Passo 3; janela fora de operação |
| Triggers novos em `vendas_pagamentos` / `contas_receber` | Baixa | Só escrevem no espelho; não alteram totais nem RPC v4 |
| Regressão de aplicação | **Muito baixa** | Zero consumidores: `venda_finance_context` aparece apenas em `lib/supabase/database.types.ts` (tipos gerados). `pdv-local` e `shared-core`: nenhuma referência |
| Reaplicação acidental | Baixa | DDL idempotente, comprovado com 3 aplicações |
| Confundir com a chave `252` | **Alta se ocorrer** | Passo 4 exige conferir a versão enviada; SHA no Passo 2 |

## 6. Rollback / contingência

`backend/supabase/README_24704_rollback_reference.sql.txt` — ordem: triggers → funções de trigger →
função de sync → policy → tabela.

Sem perda de dado operacional: o espelho é **derivável** por backfill a qualquer momento.

> **Não** remova a linha de `20260808130200` do ledger ao reverter. O ledger registra o que foi
> executado, não o estado do catálogo — apagá-la recriaria o mesmo drift que esta trilha fecha.

## 7. O que continua proibido

- Reexecutar a chave **`252`**.
- `migration repair` ou `UPDATE` manual em `supabase_migrations.schema_migrations`.
- Aplicar sem o `db reset --local` verde do Passo 1.
