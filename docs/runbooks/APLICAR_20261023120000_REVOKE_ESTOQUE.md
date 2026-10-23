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

## Plano final para aprovação (revisado em 2026-10-23 14:33 UTC)

| Item | Decisão |
|---|---|
| Janela | Fora do horário de loja. Última baixa de estoque por venda em produção: 2026-10-16 23:44 UTC (tráfego baixo) |
| Executor | Uma pessoa, com a sessão aberta até o fim da pós-checagem |
| Método | `ops/aplicar_20261023120000.sql`: uma transação que executa a migration e grava a versão real com o SQL em `statements` (seção 3). Não usar `apply_migration` nem `db push` |
| Pré-condições | As 3 colunas da seção 1 em `true`. Em 2026-10-23 14:33 UTC: `true/true/true`, e **0** funções SECURITY INVOKER executáveis por `authenticated` que chamam `decrementar_estoque_seguro` (todas as chamadoras são SECURITY DEFINER ou service_role) |
| Backup | Seção 2 concluída **antes** da janela, incluindo o restore drill (`backup-restore-test.yml`) com `success`; registrar os `run_id` |
| Critério de sucesso | Seção 4 inteira verde: catálogo, `advisor-seguranca-onda1.test.sql`, advisor, venda online, venda offline sincronizada, diagnóstico sem `falha` |
| Critério de rollback | Qualquer `permission denied for function decrementar_estoque_seguro` em venda (online ou `sync-outbox`) ou diagnóstico `BLOQUEADO` por este item. `ops/rollback_20261023120000.sql`, uma transação, testado (seção 5) |
| Efeito colateral | Nenhum dado alterado; só privilégio e o corpo de `pdv_diagnostico_pre_producao` |

## 1. Pré-checagem (somente leitura, em produção)

```sql
SELECT
  NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261023120000') AS ainda_nao_aplicada,
  has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE') AS grant_aberto,
  pg_get_functiondef('public.pdv_diagnostico_pre_producao(text)'::regprocedure)
    ~ $re$v_ok\s*:=\s*has_function_privilege\(\s*'authenticated'\s*,\s*'public\.decrementar_estoque_seguro\(uuid, numeric, uuid\)'\s*,\s*'EXECUTE'\s*\)$re$ AS diag_com_padrao_esperado;
```

Prosseguir só se as três colunas forem `true`. Em 2026-10-23 13:08 e 14:33 UTC eram.

## 2. Backup recuperável (obrigatório antes da janela)

1. Disparar `backup-scheduled.yml` (Actions → *Run workflow*; mesmo job do backup diário, dentro da cota de minutos) e esperar `success`. Anotar o `run_id`.
2. Conferir o artifact `jinlong-backup-<run_id>`: não expirado, `schema.sql` e `data.sql` com tamanho > 0 no log.
3. **Obrigatório:** disparar `backup-restore-test.yml` e esperar `success`. Ele restaura o backup mais recente bem-sucedido, confere o checksum e compara as contagens por tabela. Confirmar no log que o artifact restaurado é o do `run_id` do passo 1. Sem esse `success`, **não há janela** (mesmo critério de `docs/runbooks/PLANO_MIGRATIONS_PENDENTES_2026-10-08.md`).

## 3. Aplicação

Usar **só** `ops/aplicar_20261023120000.sql`, gerado a partir do arquivo da migration. Uma transação:

- recusa se `20261023120000` já estiver em `schema_migrations`;
- executa o conteúdo exato da migration;
- grava a versão real `20261023120000`, com o SQL aplicado em `statements` (rastreável em investigação de drift).

| Onde | Como |
|---|---|
| SQL Editor do Supabase | Abrir `ops/aplicar_20261023120000.sql`, copiar o arquivo **inteiro** e executar. É SQL puro (sem `\i` nem meta-comando do psql) |
| psql | `psql "$DB_URL" -v ON_ERROR_STOP=1 -f ops/aplicar_20261023120000.sql`, a partir da raiz do repositório |

Não usar `apply_migration` do MCP (grava outra versão, e o rollback abaixo não a encontraria) nem `supabase db push`.

A migration aborta sozinha (`RAISE EXCEPTION ... drift`) se o trecho do diagnóstico não for encontrado. Nesse caso nada é gravado.

Validado em 2026-10-23 no banco representativo: estado anterior → aplicação (grant revogado, diagnóstico ajustado, ledger com versão real e `statements` de 3.881 caracteres) → segunda execução recusada.

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

Usar `ops/rollback_20261023120000.sql` (SQL Editor: colar inteiro; psql: `-f`). Uma transação:

- devolve `EXECUTE` a `authenticated`;
- restaura o check do diagnóstico;
- remove a versão `20261023120000`, que é exatamente a gravada pela aplicação da seção 3.

Validado em 2026-10-23 no banco representativo, junto com a reaplicação.

Gatilho para rollback: qualquer venda online ou offline falhando na baixa de estoque com `permission denied for function decrementar_estoque_seguro`, ou diagnóstico `BLOQUEADO` por este item.
