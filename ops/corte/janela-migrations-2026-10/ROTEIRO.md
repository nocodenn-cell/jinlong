# Roteiro — janela de aplicação de `20261022020000` e `20261023120000` em produção

> **Status: EXECUTADO em 2026-10-28** pelo dono, por outro caminho (script do #641 para `20261022020000`; aplicação
> manual de `20261023120000`). Verificação somente leitura em 2026-10-29 (V1–V5 abaixo): V2 `false`, V3 `true`,
> V4 `false`, V5 `true`. O md5 de `statements` ficou igual ao do arquivo **com** a quebra de linha final
> (`463e6e94…`, `64a1cda5…`, valores de P9), não aos de V1, porque não passou pelo `02-aplicar.psql`; o SQL é o
> mesmo do arquivo. Os scripts desta pasta ficam como referência; não reexecutar.

## 1. O que cada migration faz em produção

| Versão | Arquivo | Efeito em produção | Risco |
|---|---|---|---|
| `20261022020000` | `pdv_config_gerente_senha_sha256_nullable.sql` | **Nenhuma mudança de schema.** A coluna `pdv_config.gerente_senha_sha256` **não existe** em produção (lido em 2026-10-23); o `DO` só altera se a coluna existir e for NOT NULL. Aplicar serve para alinhar o histórico com o repositório | nulo |
| `20261023120000` | `revoga_decrementar_estoque_seguro_authenticated.sql` | (a) `REVOKE EXECUTE` de `public.decrementar_estoque_seguro(uuid, numeric, uuid)` para `PUBLIC`, `anon`, `authenticated`; mantém `service_role`. (b) Reescreve `pdv_diagnostico_pre_producao(text)` a partir da definição em vigor, invertendo o check `grant_estoque_seguro` (passa a exigir a **ausência** do grant) | baixo: só permissão e um check do diagnóstico |

**Quem continua podendo baixar estoque** (verificado em 2026-10-23): `finalizar_venda_transacional_canonica_v4_unscoped`,
`finalizar_venda_transacional` e `pdv_diagnostico_pre_producao` são `SECURITY DEFINER` com dono `postgres`; a Edge
`sync-outbox` usa cliente `service_role`. Nenhum código do app, do PDV local ou do `shared-core` chama a RPC com JWT de
usuário. A venda normal não é afetada.

**Correção ao registro anterior:** `ops/corte/CORTE.md` tratava `20261022020000` como pré-requisito do provisionamento
de empresa nova. Em produção a coluna não existe, então ela **não** bloqueia o provisionamento; o problema era de
bancos criados do zero pelo repositório (local/homolog).

## 2. Pré-checagens (somente leitura) — `01-prechecagem.sql`

Rodar antes de abrir a janela. **Qualquer divergência = parar.**

| # | Checagem | Esperado (2026-10-23) |
|---|---|---|
| P1 | Versões ainda ausentes em `schema_migrations` | `20261022020000` e `20261023120000` ausentes |
| P2 | Coluna `pdv_config.gerente_senha_sha256` | ausente (ou, se existir, anotar `is_nullable`) |
| P3 | ACL de `decrementar_estoque_seguro` | `{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}` |
| P4 | `pdv_diagnostico_pre_producao` contém o check antigo | `true` |
| P5 | md5 de `pg_get_functiondef(pdv_diagnostico_pre_producao)` | `8f955e44bc700f2ca9ad75faa382a0bf` (se mudou, alguém alterou a função: reler antes de seguir) |
| P6 | Chamadores da RPC no banco | só os 3 `SECURITY DEFINER` de dono `postgres` acima |
| P7 | Caixas abertos | anotar; **não bloqueia** (nenhuma tabela é alterada), mas preferir 0 |

Fora do banco:

| # | Checagem | Esperado |
|---|---|---|
| P8 | Último `Backup automatico (item 19)` com sucesso | há ≤ 24h, pelo **horário do run** |
| P9 | Arquivos na `main` iguais aos revisados | md5 (sem `\r`): `20261022020000` = `463e6e94496496241fff129e689c19f0`; `20261023120000` = `64a1cda5f86ceacb726e0ee387cf14ea` |
| P10 | Regressões locais verdes | `backend/scripts/pdv-config-gerente-senha-nullable.test.sql` e `backend/scripts/advisor-seguranca-onda1.test.sql` em banco local |

## 3. Aplicação — `02-aplicar.psql`

Uma transação por migration, na ordem das versões. Cada transação executa o arquivo **exatamente como está na `main`**
e registra a linha em `supabase_migrations.schema_migrations` com a **versão real do arquivo** (não o timestamp da
execução), para não criar novo par em `migration-human-gates.json`.

```bash
# na raiz do repositório, na main atualizada; PROD_DB_URL fora do Git (Dashboard → Database → Connection string)
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f ops/corte/janela-migrations-2026-10/02-aplicar.psql
```

Ordem:
1. `20261022020000` (no-op em produção) → `COMMIT`.
2. `20261023120000` → `COMMIT`. Se o `DO $diag$` levantar `check grant_estoque_seguro não encontrado — drift`, a
   transação inteira volta (o `REVOKE` também) e a janela para: a função de diagnóstico mudou desde 2026-10-23.

Alternativa sem `psql`: Claude executa o mesmo conteúdo via MCP `execute_sql`, um bloco `BEGIN … COMMIT` por
migration, **somente** com autorização explícita para isso na janela. Não usar `apply_migration` (grava o timestamp
da execução como versão).

## 4. Verificação pós-aplicação — `03-verificacao.sql`

| # | Checagem | Esperado |
|---|---|---|
| V1 | Linhas em `schema_migrations` | as 2 versões presentes; md5 de `statements` = `701f1b01481f98c0629278605b7799b3` (`20261022020000`) e `117cb4950873e60b7c4e8e35de1c458e` (`20261023120000`): arquivo sem CR e sem a quebra de linha final, que o `psql` remove |
| V2 | `has_function_privilege('authenticated', …decrementar_estoque_seguro…, 'EXECUTE')` | `false` |
| V3 | `has_function_privilege('service_role', …)` | `true` |
| V4 | `anon` | `false` |
| V5 | `pdv_diagnostico_pre_producao` com o check novo (`NOT has_function_privilege`) | `true` |

Na aplicação:

| # | Checagem | Esperado |
|---|---|---|
| V6 | `/admin/diagnostico-caixa` como DONO | item "Estoque seguro sem EXECUTE direto" = ok; veredito sem regressão |
| V7 | Primeira venda real do dia (ou venda de teste cancelada pelo fluxo auditado, se autorizado) | venda grava e baixa estoque |
| V8 | Fila do `sync-outbox` (se o PDV local estiver em uso) | eventos processando sem erro de permissão |
| V9 | Supabase Security Advisor | some o WARN de `decrementar_estoque_seguro` executável por `authenticated` |
| V10 | `migration-remote-drift` na `main` | sobra só `20261010120000` (adiada) |

## Ensaio (2026-10-23)

Roteiro ensaiado no Supabase local (`supabase_db_fastproduct`) dentro de uma transação desfeita com `ROLLBACK`
(nada ficou gravado; conferido depois). Sequência pré-checagem → aplicar → verificar → rollback → verificar:

- aplicação: as duas versões registradas; V2 `false`, V3 `true`, V4 `false`, V5 `true`;
- rollback: V2 volta a `true` e V5 a `false`.

Diferenças do local para produção: no local a coluna `gerente_senha_sha256` existe (NOT NULL), então lá a
`20261022020000` altera de fato; o md5 do diagnóstico local (`09281110…`) difere do de produção (`8f955e44…`),
o que é esperado pelo drift descrito na própria migration. `02-aplicar.psql` usa crases do `psql` com `tr`:
rodar de Linux/macOS/Git Bash ou de um container com `psql`.

## 5. Rollback — `04-rollback.sql`

- `20261022020000`: nada a reverter em produção (no-op).
- `20261023120000`: devolve o `GRANT EXECUTE` a `authenticated` e reverte o check do diagnóstico, em uma transação.
  Gatilhos: V6–V8 falhando por permissão (`42501` em venda, sync ou diagnóstico).
- O rollback restaura o rótulo do check como `authenticated (pode executar decrementar_estoque_seguro).`; se o texto original em produção era a variante `EXECUTE estoque`, a diferença é só cosmética.
- **Não apagar** as linhas de `schema_migrations` (regra do histórico). Depois de um rollback, abrir PR com migration
  nova que registre o estado revertido, para o repositório voltar a refletir produção.

## 6. Registro

Anotar aqui: horário de início/fim, saída das pré-checagens, saída da verificação e qualquer desvio.
Atualizar `ops/corte/CORTE.md` (tabela de reconciliação) e `PROXIMOS_PASSOS.md`.
