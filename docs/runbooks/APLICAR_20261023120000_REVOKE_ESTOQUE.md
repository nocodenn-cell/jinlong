# Runbook — aplicação manual de `20261023120000` em produção

Migration: `backend/supabase/migrations/20261023120000_revoga_decrementar_estoque_seguro_authenticated.sql` (PR #628, na `main` desde `8bbf5120`).

**Não executar sem autorização específica para esta janela.** A integração GitHub→Supabase não aplica migrations no merge (ver `docs/ops/deploy-governance.md`); a aplicação é manual e registrada.

## O que muda

| Antes | Depois |
|---|---|
| `authenticated` executa `decrementar_estoque_seguro(uuid, numeric, uuid)` direto via `/rest/v1/rpc` (operador baixa qualquer quantidade sobre venda própria) | Só `service_role` e funções `SECURITY DEFINER` (finalizar v4, `sync-outbox`) |
| Diagnóstico `/admin/diagnostico-caixa` exige esse grant (`grant_estoque_seguro`) | Exige a negação; veredito não vira `BLOQUEADO` |

Sem alteração de dados, tabelas ou corpo das funções de venda. Locks: `REVOKE`/`GRANT` e `CREATE OR REPLACE FUNCTION` em duas funções — instantâneo.

## Validação já feita (2026-10-23)

Banco representativo: container isolado `supabase/postgres:17.6.1.084` (mesma versão de produção) com as 437 migrations da `main` aplicadas em ordem.

- `advisor-seguranca-onda1.test.sql`: OK.
- Chamada real como DONO: `pdv_diagnostico_pre_producao` → `grant_estoque_seguro = ok`.
- Rollback abaixo aplicado e verificado; reaplicação após rollback e segunda aplicação seguida (no-op): OK.
- Padrões de texto do diagnóstico conferidos contra a definição **de produção** (somente leitura): 1 ocorrência.

## 1. Pré-checagem (somente leitura, em produção)

```sql
SELECT
  NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261023120000') AS ainda_nao_aplicada,
  has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE') AS grant_aberto,
  pg_get_functiondef('public.pdv_diagnostico_pre_producao(text)'::regprocedure)
    ~ $re$v_ok\s*:=\s*has_function_privilege\(\s*'authenticated'\s*,\s*'public\.decrementar_estoque_seguro\(uuid, numeric, uuid\)'\s*,\s*'EXECUTE'\s*\)$re$ AS diag_com_padrao_esperado;
```

Prosseguir só se as três colunas forem `true`. Em 2026-10-23 13:08 UTC eram.

## 2. Backup recuperável

1. Disparar `backup-scheduled.yml` (Actions → *Run workflow*; mesmo job do backup diário, sem custo adicional fora da cota de minutos) e esperar `success`.
2. Conferir o artifact `jinlong-backup-<run_id>` (não expirado; `schema.sql` e `data.sql` com tamanho > 0 no log).
3. Opcional (recomendado): `backup-restore-test.yml` sobre esse backup — confere checksum e contagens por tabela.

## 3. Aplicação

Uma transação, com a versão real do arquivo (nunca `supabase db push`):

- **MCP** `apply_migration` com `name = revoga_decrementar_estoque_seguro_authenticated` e o conteúdo do arquivo — grava a versão com o timestamp da execução; depois registrar o par em `backend/supabase/migration-human-gates.json` (padrão das aplicações via MCP); **ou**
- **SQL Editor / psql**:

```sql
BEGIN;
\i backend/supabase/migrations/20261023120000_revoga_decrementar_estoque_seguro_authenticated.sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261023120000', 'revoga_decrementar_estoque_seguro_authenticated');
COMMIT;
```

A migration aborta sozinha (`RAISE EXCEPTION ... drift`) se o trecho do diagnóstico não for encontrado — nesse caso nada é gravado.

## 4. Pós-checagem

```sql
SELECT
  NOT has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE') AS revogado,
  has_function_privilege('service_role', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE') AS service_role_ok,
  pg_get_functiondef('public.pdv_diagnostico_pre_producao(text)'::regprocedure) ~ 'NOT has_function_privilege' AS diag_ajustado;
```

Depois:

1. `psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/advisor-seguranca-onda1.test.sql` (transação com ROLLBACK; não grava nada).
2. Advisor de segurança do Supabase: `decrementar_estoque_seguro` some de `authenticated_security_definer_function_executable`.
3. Smoke no PDV: uma venda completa (finalizar v4 baixa estoque via `SECURITY DEFINER`) e `/admin/diagnostico-caixa` como DONO sem `falha` em "Estoque seguro sem EXECUTE direto".
4. Uma venda offline sincronizada (`sync-outbox`, `service_role`) baixa estoque normalmente.

## 5. Rollback (testado)

```sql
BEGIN;
GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) TO authenticated;
DO $rb$
DECLARE v_def text := pg_get_functiondef('public.pdv_diagnostico_pre_producao(text)'::regprocedure);
BEGIN
  v_def := regexp_replace(v_def,
    $re$v_ok\s*:=\s*NOT\s+has_function_privilege\(\s*'authenticated'\s*,\s*'public\.decrementar_estoque_seguro\(uuid, numeric, uuid\)'\s*,\s*'EXECUTE'\s*\)$re$,
    $r$v_ok := has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE')$r$);
  v_def := replace(v_def, $t$'Estoque seguro sem EXECUTE direto'$t$, $t$'GRANT estoque seguro'$t$);
  v_def := replace(v_def, $d$'authenticated sem EXECUTE direto (só finalizar v4 / sync-outbox).'$d$, $d$'authenticated EXECUTE estoque.'$d$);
  EXECUTE v_def;
END $rb$;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261023120000';
COMMIT;
```

Gatilho para rollback: qualquer venda online/offline falhando na baixa de estoque com `permission denied for function decrementar_estoque_seguro`.
