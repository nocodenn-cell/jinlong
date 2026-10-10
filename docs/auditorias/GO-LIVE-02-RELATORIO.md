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

**NÃO EXECUTADO.** Recheck nesta continuação, 2026-10-10: `docker info` falha porque o pipe `dockerDesktopLinuxEngine` não existe. O daemon não foi iniciado. Nenhum serviço global foi alterado. Staging não foi usado. Os testes PGlite da GO-LIVE 01 não foram repetidos.

A evidência transacional já registrada continua válida como ensaio embarcado, não como Postgres 17 servidor: transação única, rollback de `SELECT 1/0`, segunda aplicação idempotente, `anon` negado, outra loja negada, usuário inativo negado, `service_role` enfileira, contagem da fila preservada no DDL. O critério que substitui esse ensaio, no dia da janela, é o restore do dump em Postgres descartável (seção 11).

## 5. Backup e restauração

**PENDENTE.** Esta continuação não extraiu dados.

- Plano Free, sem PITR. RPO diário **não garantido** (`docs/runbooks/BACKUP_RESTORE_CANONICO.md`).
- O último drill com dump real autorizado é de 2026-10-08, fora desta sprint.
- O roteiro executável está em `docs/auditorias/GO-LIVE-02-CHECKLIST-RESTORE.md`. A seção 6 separa quatro recuperações.

| Perda | Recuperação aceita |
|---|---|
| Função fiscal segura, depois do commit | Reaplicar só `20261009220000`. `assertRecoveryIsCanonical` recusa qualquer outro texto, inclusive `20261007161220`. |
| Schema da janela que não commitou | `ROLLBACK`. O ledger não muda. |
| Dados | Restore de `data.sql` num Postgres novo. Não é um swap de corpo de função. |
| Operação da loja depois da hora do dump | Reprocessar outbox e fila a partir dessa hora. O restore não apaga o que aconteceu depois. |

## 6. Matriz definitiva

Três fontes, sem misturar:

- **Ledger.** Job `migration-remote-drift` do run `38049357414`. O run `38050939058`, no `41ecf9f0`, falhou no mesmo check. O script só tira uma versão da lista bloqueante quando o par git/remoto está inteiro em `migration-human-gates.json`. Os onze arquivos abaixo saíram como `remote_ausente`. A lista de versões remotas sem arquivo no disco foi só o lado remoto desses pares já decididos. Não há versão órfã com o nome destes arquivos. Isso é ausência de registro, não prova isolada de que o SQL nunca rodou.
- **Catálogo.** Leitura de 2026-10-10 no plano da GO-LIVE 01. Objeto ausente, ou corpo ainda antigo, mostra que o efeito do arquivo não está no banco. Objeto presente com outra origem não conta como esta migration.
- **Arquivo.** O que o SQL cria e a ordem em que fica perigoso.

Nenhum par novo foi gravado. Nenhum `migration repair`. O guard permanece.

| Arquivo | Ledger | Efeito no catálogo | Classe |
|---|---|---|---|
| `20261009220000` | `remote_ausente` | `internal.fiscal_sessao_privilegiada()` ausente. As três RPCs existentes ainda têm `current_user` e não têm `FISCAL_REPROCESSO_LOJA`. O arquivo não cita `formas_pagamento`, `contas_financeiras` nem `valor_sistema_dinheiro`. | **Não aplicada.** Pendente desta janela, passo 1. |
| `20261007163200` | `remote_ausente` | `INSERT` em `documentos_fiscais_pendentes` ainda concedido a `authenticated`. A RPC `fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)` já existe, então a prova do arquivo não depende da série financeira. | **Não aplicada.** Pendente desta janela, passo 2, na mesma transação, sem o `BEGIN`/`COMMIT` do arquivo. |
| `20261007161220` | `remote_ausente` | `fiscal_cancelar_documento` e `fiscal_marcar_cancelado` ausentes. `fiscal_marcar_emitido` não contém `CANCELADO`. O cancelamento deste arquivo usa `current_user <> 'postgres'` e não contém `FISCAL_CANCELAR_LOJA`. | **Não aplicada.** **Incompatível** se rodar depois de `20261009220000`: regrava o cancelamento sem loja. `fiscal_marcar_cancelado` e a trava `CANCELADO` de `fiscal_marcar_emitido` continuam pendentes, mas só num arquivo novo que não recrie `fiscal_cancelar_documento`. |
| `20261006120000` | `remote_ausente` | Coluna `formas_pagamento.conta_financeira_id` ausente. | **Não aplicada.** Pendente de janela financeira. Não é dependência de `20261009220000`. |
| `20261007163000` | `remote_ausente` | `financeiro_painel` ainda soma `saldo_atual` e não chama `internal.valor_sistema_dinheiro`. O arquivo é uma transação: se tivesse commitado, o painel teria mudado junto. `CANCELAR_VENDA_JA_CANCELADA` no cancelamento vem de `20260820150000`, já pareada no human-gates, não deste arquivo. | **Não aplicada.** Pendente de janela de caixa. **Incompatível** na janela fiscal: reescreve `cancelar_venda_transacional`. |
| `20261007163100` | `remote_ausente`; sem versão remota de outro timestamp | O marcador `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA` não foi relido no corpo de `confirmar_importacao_nfe`. Ausência de ledger não foi promovida a "aplicada por fora". | **Não aplicada no registro.** Efeito no catálogo fica para o pré-check da janela de NF-e. Não entra em lote. |
| `20261007170000` | `remote_ausente`; sem versão remota de outro timestamp | O corpo de `registrar_movimentacao` não foi relido. `internal.valor_sistema_dinheiro(uuid)` existe e é dependência deste arquivo, não prova de que ele rodou. | **Não aplicada no registro.** Efeito no catálogo fica para a janela de caixa. Não entra em lote. |
| `20261007171000` | `remote_ausente` | A guarda de estoque já está no cancelamento por `20260820150000`. A prova deste arquivo é `valor_sistema_dinheiro` antes de `INSERT INTO public.devolucoes`. Essa ordem não foi lida. O painel antigo torna improvável que a série E(c) tenha commitado. | **Não aplicada.** Não é "substituída": o efeito de estoque é de outra migration. **Incompatível** na janela fiscal porque substitui `cancelar_venda_transacional`. |
| `20261007180000` | `remote_ausente` | `calcular_valor_sistema_por_forma_caixa(uuid)` ausente. `internal.valor_sistema_dinheiro` existe e basta para este arquivo compilar. | **Não aplicada.** Pendente antes de `20261007190000`. |
| `20261007190000` | `remote_ausente` | Tabela `caixas_fechamento_formas` ausente. | **Não aplicada.** Depende da anterior. Pendente da mesma janela de fechamento. |
| `20261010120000` | `remote_ausente` | `caixas.loja_id` continua `NOT NULL` com default `a0000001-0000-4000-8000-000000000001`. | **Não aplicada.** Pendente junto com o deploy da Edge e do PDV que enviam `loja_id`. **Incompatível** se o `DROP DEFAULT` subir antes desse deploy. Fora da janela fiscal. |

Nenhuma linha está na classe "aplicada sem registro". Onde o catálogo foi lido, o efeito do arquivo está ausente. Onde não foi, a classe fica "não aplicada no registro", não "substituída".

## 7. Procedimento de implantação fiscal

Alvo futuro, só com autorização nova: produção `kbabmewnahysfvlybiak`.

Pré-condição de catálogo, já lida em 2026-10-10 e a repetir no dump do dia: as colunas que `20261009220000` grava existem; `fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)` existe; `auth.uid` e `auth.role` existem. O arquivo não depende de `20261006120000` nem da série `2026100716*`–`2026100719*`.

1. Cumprir `GO-LIVE-02-CHECKLIST-RESTORE.md` no mesmo dia. Sem dump restaurado, parar.
2. Pré-checks do `GO-LIVE-01-CHECKLIST-FISCAL.md` nesse Postgres.
3. Uma transação: `20261009220000_fiscal_rpc_isola_loja.sql` e depois o SQL de `20261007163200` sem o `BEGIN`/`COMMIT` do arquivo. O helper é `bundleFiscalP0` em `backend/scripts/fiscal-p0-janela.mjs`. A segunda aplicação é idempotente. `SELECT 1/0` antes do `COMMIT` desfaz os dois arquivos.
4. Não aplicar `20261007161220` em momento nenhum depois.
5. Conferir: `internal.fiscal_sessao_privilegiada()` existe; `fiscal_cancelar_documento(uuid, text)` existe; gerente de outra loja recebe `FISCAL_REPROCESSO_LOJA` ou `FISCAL_CANCELAR_LOJA`; usuário inativo é negado; `anon` não executa; `service_role` enfileira; `COUNT(*)` da fila igual ao snapshot; `INSERT` de `authenticated` na fila é zero.

Contrato do app publicado, sem mudança de assinatura:

- `cancelarDocumentoFiscal` chama `fiscal_cancelar_documento` com `p_documento_id` e `p_justificativa`. A função não existe hoje; a janela cria essa assinatura.
- Reprocessar continua em `fiscal_reprocessar_documento(uuid)`.
- O enqueue do caixa não envia `p_loja_id`; a função lê a loja do caixa.
- Códigos novos seguem em `error.message`.

## 8. Recuperação

Detalhe operacional na seção 6 do checklist.

- Falha antes do `COMMIT`: schema e funções ficam como estavam. Não há repair de ledger.
- Função segura perdida depois do commit: reaplicar só o texto de `20261009220000`. Outro SQL, inclusive `20261007161220`, é recusado por `assertRecoveryIsCanonical`.
- Dado alterado por chamada real: restaurar o dump do dia num Postgres novo. Não trocar o corpo da função pelo corpo vulnerável.
- Venda ou documento nascido depois da hora do dump: reconciliar pela outbox e pela fila. O restore não os contém.

## 9. Riscos

**P0**

- Três RPCs fiscais em produção ainda usam o predicado morto `current_user`.
- `fiscal_cancelar_documento` ausente enquanto a tela chama essa assinatura.
- `INSERT` direto na fila fiscal continua concedido a `authenticated`.
- RPO diário não garantido. Sem dump do dia, a janela não abre.

**P1**

- Postgres 17 servidor não rodou: daemon Docker ausente.
- `20261010120000` só pode subir com a Edge e o PDV que enviam `loja_id`. O tipo TypeScript já exige o campo; o default de produção continua.
- `fiscal_marcar_cancelado` e a trava de `fiscal_marcar_emitido` continuam fora do banco. Exigem arquivo novo, não `20261007161220`.
- Série financeira, NF-e e fechamento por forma permanece não aplicada. `20261007163100` e `20261007170000` ainda precisam de leitura do corpo no dia da janela delas.
- Staging não é clone.

## 10. Critérios para liberar a janela fiscal

Todos, no mesmo dia. Falhou um, a janela não abre.

1. Autorização escrita nomeia produção `kbabmewnahysfvlybiak` e só os dois arquivos `20261009220000` e `20261007163200`.
2. Dump lógico do dia restaurado em Postgres descartável, com contagens de tabelas, policies, functions e triggers iguais à origem, SHA-256 anotado e arquivos apagados ao fim.
3. Pré-checks do checklist fiscal passam nesse restore.
4. O bundle, nesse restore, passa na matriz da seção 7: outra loja, inativo, `anon`, `service_role`, contagem da fila e `INSERT` revogado.
5. `20261007161220` não está no conjunto aplicado.
6. Nenhum `migration repair` e nenhum par novo no human-gates antes do `COMMIT` em produção.
7. Há operador nomeado para interromper se a contagem da fila mudar no DDL.

## 11. Decisão

- Merge na `main`: **NO-GO**. O PR #535 fica aberto. O drift é real e o guard permanece.
- Implantação fiscal: **NO-GO** até os sete critérios da seção 10.
- Piloto: **NO-GO**.

Banco de produção: **inalterado**.

## 12. O que ainda depende de autorização humana

- Dump lógico de produção e o restore desse dump.
- `COMMIT` dos dois arquivos fiscais em produção.
- Merge do PR #535.
- Deploy da Edge e do PDV junto com `20261010120000`.
- Leitura do corpo de `confirmar_importacao_nfe` e de `registrar_movimentacao` antes das janelas de NF-e e de caixa.
- Arquivo novo para `fiscal_marcar_cancelado` e para a trava de `fiscal_marcar_emitido`, em change separado.
