# GO-LIVE 02 — Regularização de produção

Data: 2026-10-10.  
Branch: `sprint/go-live-01`.  
PR: https://github.com/nocodenn-cell/fastproduct/pull/535  
Base da evidência: `docs/auditorias/GO-LIVE-01-ENCERRAMENTO.md`, `GO-LIVE-01-PLANO-REMEDIACAO-FISCAL.md` e `GO-LIVE-01-CHECKLIST-FISCAL.md`.

Sprint: **CONCLUÍDA** como preparação.  
Implantação e piloto: **NO-GO**.

Nenhuma migration, dump ou escrita foi feita em produção ou staging.

## 1. CI e PR #535

`114e6c800b4a7b946138c24e06ce7cb99900ae02` está em `origin/sprint/go-live-01`. A correção de tipos está em `95017e76`. A ponta que o CI abaixo executou é `41ecf9f0`.

No run `38049357414` de `114e6c80`, `Supabase local gates` falhou em `check:types-drift`. A primeira divergência era `caixas.loja_id` opcional no `Insert` versionado e obrigatório no banco local, porque `20261010120000` faz `DROP DEFAULT`. O arquivo `pdv-importados/lib/supabase/database.types.ts` passou a exigir `loja_id: string` no `Insert`. O `Update` continua opcional. `npx tsc --noEmit -p tsconfig.typecheck.json` em `pdv-importados` passou. `npx eslint lib/supabase/database.types.ts` passou. O caixa web já envia `loja_id` em `pdv-importados/app/caixa/server/cashSession.ts`.

No run de `41ecf9f0`:

| Check | Resultado |
|---|---|
| `Supabase local gates` | **PASS** (5m48s) |
| `build-and-test` de `pdv-importados` e de `pdv-local` | **PASS** |
| `gitleaks`, `detect-paths`, `outbox-contract`, `edge-functions-typecheck`, `anti-replay-diagnostic-gate` | **PASS** |
| Vercel `pdv-importados` | PASS por Ignored Build Step |
| Vercel `jinlong-site` | preview concluído pela integração Git. Não houve promote manual. |
| `migration-remote-drift` | **FAIL**. Lista na seção 6. Não foi mascarado. |

Checks obrigatórios de `main`, lidos em `required_status_checks`: `build-and-test`, `gitleaks`, `Supabase local gates`, `edge-functions-typecheck`, `outbox-contract`, `anti-replay-diagnostic-gate`. Todos passaram em `41ecf9f0`. O drift não está nessa lista e permanece vermelho.

`e2e-playwright` e o E2E crítico desse SHA ainda estavam pendentes no registro. Não são checks obrigatórios de `main`.

## 2. Correções

- Tipo de inserção de `caixas.loja_id` alinhado ao `DROP DEFAULT` ainda não aplicado em produção.
- Nenhuma função fiscal antiga foi restaurada.
- Nenhum par novo em `migration-human-gates.json`.
- Nenhum `migration repair`.

## 3. Testes desta sessão

| Comando | Resultado |
|---|---|
| `tsc --noEmit` em `pdv-importados` | PASS |
| `eslint` em `database.types.ts` | PASS |
| `npm run test:fiscal-p0-pre-req` | PASS |
| `npm run test:fiscal-rpc-authz` | PASS |
| `npm run test:go-live-01-isolamento` | PASS |
| `npm run test:backup-restore-isolado` | PASS |
| `node scripts/sync-outbox-contract-smoke.mjs` | PASS |
| Lint, teste e build do `pdv-importados` | PASS no CI de `41ecf9f0` (`build-and-test`, 6m23s). O `next build` local não rodou: o job usa o secret `CI_NEXT_PUBLIC_SUPABASE_ANON_KEY`. |

## 4. PostgreSQL servidor

**NÃO EXECUTADO.**

`docker info` falhou: o pipe `dockerDesktopLinuxEngine` não existe. O daemon não foi iniciado e nenhum serviço global foi alterado. Staging não foi usado. A evidência transacional continua sendo o PGlite do `test:fiscal-p0-pre-req` (GO-LIVE 01): transação única, rollback de `SELECT 1/0`, segunda aplicação idempotente, `anon` negado, outra loja negada, usuário inativo negado, `service_role` enfileira, contagem da fila preservada no DDL.

## 5. Backup e restauração

Estado herdado, sem dump novo:

- Plano Free, sem PITR. RPO diário **não garantido** (`docs/runbooks/BACKUP_RESTORE_CANONICO.md`).
- O último drill com dump real autorizado é de 2026-10-08, fora desta sprint. Esta sprint não extraiu dados.
- Ensaio sintético em PGlite: PASS. Recusa produção e staging.

Checklist para o dia autorizado: `docs/auditorias/GO-LIVE-02-CHECKLIST-RESTORE.md`. Resultado de hoje: **PENDENTE**.

## 6. Matriz de drift

Fonte do ledger: job `migration-remote-drift` do run `38049357414` (2026-10-10), projeto linkado de produção, sem escrita. Fonte do catálogo: leitura de 2026-10-10 já registrada no plano da GO-LIVE 01. Os pares com gate humano (N1, diagnóstico, C3, fiscal de setembro) aparecem como decisão já registrada e não entram nesta matriz.

| Arquivo | Ledger | Catálogo em 2026-10-10 | Classe | Nesta janela |
|---|---|---|---|---|
| `20261009220000_fiscal_rpc_isola_loja.sql` | `remote_ausente` | `internal.fiscal_sessao_privilegiada` ausente; três RPCs ainda com `current_user` | Não aplicada. Necessária. | sim, passo 1 |
| `20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql` | `remote_ausente` | `INSERT` da fila ainda concedido a `authenticated` | Não aplicada. Necessária. | sim, passo 2, na mesma transação |
| `20261007161220_fiscal_cancelado_ssot.sql` | `remote_ausente` | `fiscal_cancelar_documento` e `fiscal_marcar_cancelado` ausentes; `fiscal_marcar_emitido` sem `CANCELADO` | Não aplicada. O `CREATE` de `fiscal_cancelar_documento` deste arquivo é incompatível depois de `20261009220000`. O endurecimento de `fiscal_marcar_emitido` e a criação de `fiscal_marcar_cancelado` continuam necessários noutro change, extraídos deste arquivo. | não |
| `20261006120000_financeiro_contas_formas_e_painel.sql` | `remote_ausente` | `formas_pagamento.conta_financeira_id` ausente | Não aplicada. Necessária na janela financeira. | não |
| `20261007163000_ssot_001_002_painel_ec_cache.sql` | `remote_ausente` | `financeiro_painel` ainda soma `saldo_atual` | Não aplicada. Necessária. Pré-check do corpo antes de aplicar. | não |
| `20261007163100_ssot_003_nfe_obrigacao_duplicata.sql` | `remote_ausente` | corpo de `confirmar_importacao_nfe` não foi relido nesta sprint | Ledger ausente. Não tratar como aplicada. Não aplicar em lote. | não |
| `20261007170000_ssot_002_mov_ar_ec_cache.sql` | `remote_ausente` | sem leitura nova do corpo de `registrar_movimentacao` | Ledger ausente. Janela de caixa, separada. | não |
| `20261007171000_ssot_002_cancel_guard_antes_devolucao.sql` | `remote_ausente` | `cancelar_venda_transacional` já tem `CANCELAR_VENDA_JA_CANCELADA` e `v_ja_reposto_qtd` antes do `UPDATE` de estoque. Isso não é este arquivo. | Não aplicada. Reescreve a função de cancelamento. Fora da janela fiscal. | não |
| `20261007180000_calcular_valor_sistema_por_forma_caixa.sql` | `remote_ausente` | função ausente. `internal.valor_sistema_dinheiro` existe. | Não aplicada. Necessária antes da seguinte. | não |
| `20261007190000_caixas_fechamento_formas_snapshot.sql` | `remote_ausente` | tabela `caixas_fechamento_formas` ausente | Não aplicada. Depende da anterior. | não |
| `20261010120000_caixa_sem_loja_padrao.sql` | `remote_ausente` | `caixas.loja_id` `NOT NULL` com default do UUID piloto | Não aplicada. Necessária junto com o deploy da Edge e do PDV que enviam `loja_id`. | não |

Nada desta tabela foi aplicada fora do ledger: o objeto que o arquivo cria está ausente, ou o corpo lido ainda é o anterior. A exceção explícita é `20261007171000`, cujo efeito de estoque já existe por outra definição; o arquivo em si não está no ledger e não deve ser empurrado junto com o fiscal.

## 7. Procedimento de implantação fiscal

Alvo futuro, só com autorização nova: produção `kbabmewnahysfvlybiak`.

1. Cumprir `GO-LIVE-02-CHECKLIST-RESTORE.md` no mesmo dia. Sem dump restaurado, parar.
2. Pré-checks do `GO-LIVE-01-CHECKLIST-FISCAL.md`.
3. Uma transação: `20261009220000_fiscal_rpc_isola_loja.sql` e depois o SQL de `20261007163200` sem o `BEGIN`/`COMMIT` do arquivo. O helper é `bundleFiscalP0` em `backend/scripts/fiscal-p0-janela.mjs`.
4. Não aplicar `20261007161220` depois.
5. Conferir: `internal.fiscal_sessao_privilegiada()` existe; `fiscal_cancelar_documento(uuid, text)` existe; gerente de outra loja recebe `FISCAL_REPROCESSO_LOJA` ou `FISCAL_CANCELAR_LOJA`; usuário inativo é negado; `anon` não executa; `service_role` enfileira; `COUNT(*)` da fila igual ao snapshot; `INSERT` de `authenticated` na fila é zero.

Contrato do app publicado, sem mudança de assinatura:

- `cancelarDocumentoFiscal` chama `fiscal_cancelar_documento` com `p_documento_id` e `p_justificativa`. A função não existe hoje; a janela cria essa assinatura. A tela deixa de falhar por função ausente.
- Reprocessar continua em `fiscal_reprocessar_documento(uuid)`.
- O enqueue do caixa não envia `p_loja_id`; a função lê a loja do caixa.
- Códigos novos (`FISCAL_REPROCESSO_LOJA`, `FISCAL_CANCELAR_LOJA`, `FISCAL_ENQUEUE_AUTH`) seguem em `error.message`.

## 8. Recuperação

- Falha antes do `COMMIT`: nada muda.
- Função segura perdida depois do commit: reaplicar só o texto de `20261009220000`. Outro SQL, inclusive `20261007161220`, é recusado por `assertRecoveryIsCanonical`.
- Dado alterado por chamada real depois do apply: restaurar o dump do dia num Postgres novo. Não trocar o corpo da função pelo corpo vulnerável.

## 9. Riscos pendentes

- Produção continua com as três RPCs fiscais no predicado morto e sem `fiscal_cancelar_documento`.
- `INSERT` direto na fila fiscal continua concedido a `authenticated`.
- Backup diário sem artefato recente. RPO não garantido.
- Ensaio em Postgres 17 servidor não rodou.
- `20261010120000` sem o PDV que manda `loja_id` faz o caixa antigo falhar. O tipo novo só obriga o TypeScript; o default de produção continua até essa migration.
- Aplicar a série `20261006`/`20261007` inteira no mesmo change mistura financeiro, NF-e e caixa com o fiscal.
- Staging não reproduz a produção.

## 10. Decisão

- Merge na `main`: **NO-GO** nesta sessão. O PR fica para revisão. O drift remoto só fecha com a janela autorizada, não com repair.
- Implantação fiscal: **NO-GO** até autorização explícita e dump do dia restaurado. O procedimento das seções 7 e 8 está pronto para essa janela.
- Piloto: **NO-GO**.

Banco de produção: **inalterado**.
