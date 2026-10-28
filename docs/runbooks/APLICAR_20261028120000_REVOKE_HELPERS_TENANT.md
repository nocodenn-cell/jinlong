# Runbook — aplicação manual de `20261028120000` em produção

Migration: `backend/supabase/migrations/20261028120000_revoga_helpers_tenant_authenticated.sql` (auditoria SECDEF, na `main` desde `f3f75434`).

**Não executar sem autorização específica para esta janela.** A integração GitHub→Supabase não aplica migrations no merge (ver `docs/ops/deploy-governance.md`); a aplicação é manual e registrada. Enquanto não for aplicada, o check `migration-remote-drift` de todo PR atualizado com a `main` falha com `20261028120000 (remote_ausente)`.

## O que muda

| Antes | Depois |
|---|---|
| `authenticated` executa via `/rest/v1/rpc` os helpers `fp_empresa_da_loja(uuid)`, `fp_empresa_operacional(uuid)`, `fp_pdv_config_id(uuid)` e `fp_mesma_empresa(uuid, uuid)`. Um usuário da empresa A, com o UUID de uma loja da empresa B, descobre a empresa B, se ela está operacional e o id da config de PDV | Só `postgres` (dono) e `service_role`. As funções `SECURITY DEFINER` que usam os helpers continuam funcionando, porque executam como dono |

Sem alteração de dados, tabelas ou corpo de função. Locks: `REVOKE`/`GRANT` em 4 funções — instantâneo.

## Evidência de que nada legítimo depende do grant (produção, somente leitura, 2026-10-28)

- ACL atual dos 4 helpers: `{postgres=X, service_role=X, authenticated=X}` (sem `PUBLIC` nem `anon`). O rollback devolve exatamente isso.
- Chamadores no banco: 22 funções, **todas** `SECURITY DEFINER` com dono `postgres` (ex.: `fp_pode_operar_loja`, `fp_modulo_ativo`, `obter_limite_sangria_sem_gerente`).
- **0** policies de RLS, **0** views e **0** funções `SECURITY INVOKER` que chamam os helpers.
- Código do repositório (apps, Edge Functions, shared-core): nenhuma chamada `rpc(...)` aos helpers; só os testes de backend.
- `20261028120000` ainda não consta em `schema_migrations` de produção.

## Validação já feita (2026-10-28)

Banco representativo: container isolado `supabase/postgres:17.6.1.084` (mesma versão de produção) com as migrations da `main` aplicadas e a mesma ACL de produção nos 4 helpers.

- `ops/aplicar_20261028120000.sql`: ACL passa a `{postgres=X, service_role=X}`; ledger com a versão real e `statements` idêntico ao arquivo (md5 `2fc3a718…` nos dois).
- Segunda execução: recusada (`já consta em schema_migrations`), nada gravado.
- `authenticated` chamando `fp_empresa_da_loja`: `permission denied for function fp_empresa_da_loja`.
- `ops/rollback_20261028120000.sql`: ACL volta igual à de produção e a versão sai do ledger; reaplicação depois do rollback: OK.
- CI da `main`: `rpc-helpers-tenant-authenticated.test.mjs` (regressão) e suítes multiempresa.

## Plano para aprovação

| Item | Decisão |
|---|---|
| Janela | Fora do horário de loja |
| Executor | Uma pessoa, com a sessão aberta até o fim da pós-checagem |
| Método | `ops/aplicar_20261028120000.sql` (seção 3). Não usar `apply_migration` nem `db push` |
| Pré-condições | Seção 1 com as três colunas em `true` |
| Backup | Seção 2 concluída antes da janela, incluindo o restore drill com `success` |
| Critério de sucesso | Seção 4 inteira verde |
| Critério de rollback | Qualquer `permission denied for function` em um dos 4 helpers em log da API, do PDV ou de Edge Function. `ops/rollback_20261028120000.sql`, uma transação, testado (seção 5) |
| Efeito colateral | Nenhum dado alterado; só privilégio |

## 1. Pré-checagem (somente leitura, em produção)

```sql
SELECT
  NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261028120000') AS ainda_nao_aplicada,
  has_function_privilege('authenticated', 'public.fp_empresa_da_loja(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.fp_empresa_operacional(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.fp_pdv_config_id(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.fp_mesma_empresa(uuid, uuid)', 'EXECUTE') AS grants_abertos,
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND NOT p.prosecdef
       AND p.prosrc ~ '(fp_empresa_da_loja|fp_empresa_operacional|fp_pdv_config_id|fp_mesma_empresa)\s*\('
       AND p.proname NOT IN ('fp_empresa_da_loja', 'fp_empresa_operacional', 'fp_pdv_config_id', 'fp_mesma_empresa')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE coalesce(qual, '') || coalesce(with_check, '') ~ '(fp_empresa_da_loja|fp_empresa_operacional|fp_pdv_config_id|fp_mesma_empresa)'
  ) AS sem_chamador_invoker_nem_policy;
```

Prosseguir só se as três colunas forem `true`. Em 2026-10-28 eram.

## 2. Backup recuperável (obrigatório antes da janela)

1. Disparar `backup-scheduled.yml` (Actions → *Run workflow*) e esperar `success`. Anotar o `run_id`.
2. Conferir o artifact `jinlong-backup-<run_id>`: não expirado, `schema.sql` e `data.sql` com tamanho > 0 no log.
3. **Obrigatório:** disparar `backup-restore-test.yml` e esperar `success`, confirmando no log que o artifact restaurado é o do passo 1. Sem esse `success`, **não há janela**.

## 3. Aplicação

Usar **só** `ops/aplicar_20261028120000.sql`, gerado a partir do arquivo da migration. Uma transação:

- recusa se `20261028120000` já estiver em `schema_migrations`;
- executa o conteúdo exato da migration;
- grava a versão real `20261028120000`, com o SQL aplicado em `statements`.

| Onde | Como |
|---|---|
| SQL Editor do Supabase | Abrir `ops/aplicar_20261028120000.sql`, copiar o arquivo **inteiro** e executar. É SQL puro |
| psql | `psql "$DB_URL" -v ON_ERROR_STOP=1 -f ops/aplicar_20261028120000.sql`, a partir da raiz do repositório |

Não usar `apply_migration` do MCP (grava outra versão, e o rollback não a encontraria) nem `supabase db push`.

## 4. Pós-checagem

```sql
SELECT
  NOT has_function_privilege('authenticated', 'public.fp_empresa_da_loja(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.fp_empresa_operacional(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.fp_pdv_config_id(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.fp_mesma_empresa(uuid, uuid)', 'EXECUTE') AS revogados,
  has_function_privilege('service_role', 'public.fp_empresa_da_loja(uuid)', 'EXECUTE') AS service_role_ok,
  (SELECT md5(statements[1]) FROM supabase_migrations.schema_migrations WHERE version = '20261028120000') AS md5_statements;
-- esperado: true | true | 2fc3a718fcfe0d7aabc2a070ae27d4ef
```

Depois:

1. Check `migration-remote-drift` de um PR atualizado com a `main` (ex.: #630): sem `20261028120000 (remote_ausente)`.
2. Smoke no PDV como OPERADOR: abrir caixa, uma venda completa e uma sangria (passam por `fp_pode_operar_loja`, `fp_modulo_ativo` e `obter_limite_sangria_sem_gerente`).
3. `/admin` como DONO: trocar de loja e abrir a configuração do PDV.
4. Logs da API e de Edge Functions nos 30 min seguintes: nenhum `permission denied for function fp_`.

## 5. Rollback (testado)

Usar `ops/rollback_20261028120000.sql` (SQL Editor: colar inteiro; psql: `-f`). Uma transação: devolve `EXECUTE` a `authenticated` nos 4 helpers (ACL igual à de produção antes da aplicação) e remove a versão `20261028120000`, que é exatamente a gravada pela seção 3.

Gatilho: qualquer `permission denied` para um dos 4 helpers em operação real.
