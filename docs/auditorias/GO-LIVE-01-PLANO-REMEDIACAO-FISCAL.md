# GO-LIVE 01 — Plano de remediação P0 do drift fiscal

Data: 2026-10-10.  
Alvo, quando autorizado: produção `kbabmewnahysfvlybiak` somente.  
Esta sessão: leitura de catálogo e dos arquivos. Nenhuma migration remota, merge, deploy ou carga.

Decisão de execução: **NO-GO**.

O plano abaixo está fechado. A aplicação continua bloqueada até autorização explícita e um backup restaurável fora do pglite.

## Resumo

Produção tem 42 linhas em `documentos_fiscais_pendentes` e o ledger termina em `20261009140739`. Três RPCs fiscais existem com o predicado morto `current_user`. `fiscal_cancelar_documento` e `fiscal_marcar_cancelado` não existem. O app publicado chama o cancelamento em `pdv-importados/app/gerente/financeiro/actions.ts`.

A correção que fecha o bypass das RPCs já existentes é `backend/supabase/migrations/20261009220000_fiscal_rpc_isola_loja.sql`. Ele não depende de `20261006120000` nem da série `20261007163000`–`20261007190000`. `20261006120000` está substituída e não se aplica. O lote `20261007*` é outra autorização e exige zero caixas `ABERTO`. O `CREATE` de `fiscal_cancelar_documento` em `20261007161220` é o mesmo texto de `20261009220000`.

## 1. O que está implantado

Consulta somente leitura em 2026-10-10.

| Objeto | Produção | `anon` / `PUBLIC` | `authenticated` | `service_role` | Corpo |
|---|---|---|---|---|---|
| `fiscal_reprocessar_documento(uuid)` | presente | não | sim | sim | `current_user`; sem `fiscal_sessao_privilegiada`; sem `FISCAL_REPROCESSO_LOJA` |
| `fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)` | presente | não | sim | sim | `current_user`; sem `fiscal_sessao_privilegiada` |
| `fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb)` | presente | não | sim | sim | `current_user`; sem `fiscal_sessao_privilegiada` |
| `fiscal_marcar_emitido(uuid, text, text, text, jsonb)` | presente | não | não | sim | sem a palavra `CANCELADO` |
| `fiscal_cancelar_documento(uuid, text)` | **ausente** | — | — | — | — |
| `fiscal_marcar_cancelado(uuid, text, jsonb)` | **ausente** | — | — | — | — |
| `internal.fiscal_sessao_privilegiada()` | **ausente** | — | — | — | — |

Colunas que o arquivo `20261009220000` grava já existem: `deleted_at`, `venda_id`, `status`, `ultimo_erro`, `fiscal_error_code`, `fiscal_error_category`, `fiscal_action_hint`, `fiscal_retryable`, `fiscal_next_step_url`, `fiscal_error_payload`, `proxima_tentativa_em`, `updated_at`, `tipo_doc`.

RLS da tabela está ligada. Policies de `authenticated`: `doc_fiscal_loja_isolado`, `doc_fiscal_pendentes_insert_loja`, `doc_fiscal_pendentes_select_loja`, `doc_fiscal_pendentes_update_loja`. Todas mencionam loja. `INSERT` continua concedido a `authenticated` e a `service_role`.

Efeitos que **não** estão no banco: `formas_pagamento.conta_financeira_id`, `public.caixas_fechamento_formas`, `public.calcular_valor_sistema_por_forma_caixa(uuid)`. `internal.valor_sistema_dinheiro(uuid)` e `public.financeiro_painel(date, date, integer)` existem. O painel ainda contém `sum(saldo_atual)` e não chama `internal.valor_sistema_dinheiro`.

O ledger não tem os nomes `fiscal_rpc`, `fiscal_cancel`, `ssot_00`, `financeiro_contas_formas`, `caixas_fechamento_formas` nem `calcular_valor_sistema_por_forma`. A ausência do nome não é a prova; a prova é o corpo das funções e a ausência dos objetos.

## 2. Dependências da migration fiscal

`20261009220000` faz `CREATE OR REPLACE` das três RPCs que já existem e cria `fiscal_cancelar_documento` e `internal.fiscal_sessao_privilegiada`. Assinaturas iguais às de produção e às de `pdv-importados/lib/supabase/database.types.ts`.

Para compilar, o arquivo precisa de objetos que já estão em produção:

- `public.documentos_fiscais_pendentes` com as colunas da seção 1
- `public.vendas`, `public.caixas.loja_id`, `public.usuarios` (`id`, `ativo`, `perfil`, `loja_id`)
- `auth.uid()` e `auth.role()`
- a trilha de evento que `fiscal_registrar_evento_enqueue_erro` já grava hoje

Não precisa de:

| Arquivo | Por que fica fora desta janela |
|---|---|
| `20261006120000_financeiro_contas_formas_e_painel.sql` | Substituída por `20261006180000` (ledger `20261006195837`). Ausência da coluna `conta_financeira_id` não a torna pendência. Não aplicar. Não é dependência de `20261009220000`. |
| `20261007161220_fiscal_cancelado_ssot.sql` | O `CREATE` de `fiscal_cancelar_documento` é o mesmo de `20261009220000` (`ativo` + `FISCAL_CANCELAR_LOJA`). Reaplicar o arquivo não reabre cancelamento entre lojas. Continua fora desta janela porque também grava `fiscal_marcar_cancelado` e `fiscal_marcar_emitido`, e entra no lote `20261007*` com zero caixas `ABERTO`. |
| `20261007163000_ssot_001_002_painel_ec_cache.sql` | Troca `sum(saldo_atual)` por `E(c)` dentro de `financeiro_painel`. O painel de produção ainda soma `saldo_atual`. Domínio de caixa. |
| `20261007163100_ssot_003_nfe_obrigacao_duplicata.sql` | Reescreve `confirmar_importacao_nfe`. NF-e de compra, não a fila de NFC-e. |
| `20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql` | Só revoga `INSERT` e prova que a RPC de enqueue existe. A RPC já existe. Pode entrar **depois** do `20261009220000`, no mesmo change, como passo 2. Não substitui função. |
| `20261007170000_ssot_002_mov_ar_ec_cache.sql` | Reescreve `registrar_movimentacao`. Fora do P0 fiscal. |
| `20261007171000_ssot_002_cancel_guard_antes_devolucao.sql` | Reescreve `cancelar_venda_transacional`. O corpo vivo já tem `CANCELAR_VENDA_JA_CANCELADA` e `v_ja_reposto_qtd` antes do `UPDATE` de estoque. Não faz parte do drift fiscal. |
| `20261007180000` e `20261007190000` | `190000` cria `caixas_fechamento_formas` e chama `calcular_valor_sistema_por_forma_caixa`, criada em `180000`. Nenhuma das duas está em produção. Ordem, se um dia forem autorizadas: `180000`, depois `190000`. |

Ordem segura desta janela: `20261009220000`, em seguida só o arquivo `20261007163200`. Nada antes. Nada da série financeira no mesmo change.

## 3. Por que `fiscal_cancelar_documento` está ausente

A função não aparece em nenhuma migration anterior a 2026-10-07. Os únicos `CREATE` no Git são:

1. `20261007161220_fiscal_cancelado_ssot.sql` — instala o mesmo `CREATE` de `20261009220000`
2. `20261009220000_fiscal_rpc_isola_loja.sql` — último escritor das quatro RPCs, com o mesmo cancelamento

O corpo sem loja não está mais em migration. Ficou em `backend/scripts/fixtures/fiscal_cancelar_documento.pre-isolamento.sql`, só para o teste do bypass histórico. Não aplicar esse fixture.

Nenhum dos dois efeitos está no catálogo: a função não existe e `internal.fiscal_sessao_privilegiada()` não existe. O painel publicado chama a RPC mesmo assim. O cancelamento fiscal da tela falha com função ausente. O reprocesso existe e segue com o bypass de loja.

## 4. Grants, RLS e contrato do frontend

O arquivo `20261009220000` altera grants assim:

- `REVOKE ALL` de `PUBLIC` e `anon` nas quatro RPCs
- `GRANT EXECUTE` para `authenticated` e `service_role`
- `internal.fiscal_sessao_privilegiada()`: `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated` e `service_role`. Quem chama é a RPC `SECURITY DEFINER`, como dono.

`anon` continua sem `EXECUTE`. O papel que o app usa é `authenticated`, via `createClient()` em `cancelarDocumentoFiscal` e `reprocessarDocumentoFiscal`. O caixa chama `fiscal_enfileirar_documento_venda` sem `p_loja_id` (`caixaFiscalEnqueueServer.ts`). O parâmetro tem default `NULL`; a loja continua sendo a do caixa. `service_role` (sync e worker) passa por `fiscal_sessao_privilegiada()` e não pela checagem de perfil.

Assinaturas em `database.types.ts` permanecem:

- `fiscal_cancelar_documento(p_documento_id, p_justificativa)` → `void`
- `fiscal_reprocessar_documento(p_documento_id)` → `void`
- `fiscal_enfileirar_documento_venda(p_venda_id, p_tipo_doc, p_payload, p_loja_id?)` → `uuid`
- `fiscal_registrar_evento_enqueue_erro(p_venda_id, p_tipo_doc, p_erro_mensagem, p_detalhe?)` → `void`

Códigos novos que a tela mostra em `error.message`, sem mapa próprio: `FISCAL_REPROCESSO_AUTH`, `FISCAL_REPROCESSO_PERFIL`, `FISCAL_REPROCESSO_LOJA`, `FISCAL_CANCELAR_AUTH_REQUIRED`, `FISCAL_CANCELAR_FORBIDDEN`, `FISCAL_CANCELAR_LOJA`, `FISCAL_CANCELAR_JUSTIFICATIVA_CURTA`, `FISCAL_ENQUEUE_AUTH`, `FISCAL_ENQUEUE_LOJA_DIVERGENTE`.

As policies RLS não mudam. As RPCs são `SECURITY DEFINER` e atravessam a RLS; a checagem de loja dentro da função é o controle que passa a valer. O `INSERT` direto de `authenticated` permanece até o passo `20261007163200`. Hoje esse insert ainda passa pela policy `doc_fiscal_pendentes_insert_loja`.

`20261007161220` continua fora desta janela fiscal. O `CREATE` de `fiscal_cancelar_documento` que ele contém é o mesmo de `20261009220000`, então uma execução posterior não reabre o cancelamento entre lojas. O arquivo ainda substitui `fiscal_marcar_cancelado` e `fiscal_marcar_emitido`, cujo `EXECUTE` é só `service_role`. Essas duas entram no lote `20261007*`, com zero caixas `ABERTO`, não neste change.

## 5. Validação local isolada

Já executado nesta sprint, sem rede:

```bash
npm run test:fiscal-rpc-authz
```

no diretório `backend/`. O script `backend/scripts/fiscal-rpc-loja-authz.test.mjs` sobe pglite, carrega os corpos históricos e o arquivo `20261009220000`. Resultado registrado: **PASS**. Antes, operador da loja A reprocessa, enfileira e grava evento da loja B, e gerente da loja A cancela documento da loja B. Depois, outra loja e usuário inativo são negados.

Repetir esse comando no commit que for autorizado, imediatamente antes da janela. O mesmo roteiro em `postgres:17-alpine` não rodou em 2026-10-10: o daemon Docker estava parado. Isso não substitui o PASS do PGlite e não autoriza pular o dump do dia. Não usar staging `tarxrbxddcwvjkimkbnr`: o ledger de lá não é o de produção.

## 6. Aplicação e rollback

Pré-condição de execução, todas obrigatórias:

1. Autorização explícita desta janela.
2. Backup lógico da produção restaurado com sucesso num Postgres descartável. O ensaio pglite desta sprint não conta. O plano Free não tem PITR e o backup diário não está garantido (`docs/runbooks/BACKUP_RESTORE_CANONICO.md`).
3. `npm run test:fiscal-rpc-authz` PASS no SHA que será aplicado.
4. Repetir as leituras da seção 1. Se `fiscal_sessao_privilegiada` já existir, parar.

Aplicar numa transação só, pelo runner de migration, usando o bundle de `backend/scripts/fiscal-p0-janela.mjs` (`bundleFiscalP0`). Esse bundle tira o `BEGIN`/`COMMIT` de `20261007163200` e envolve os dois arquivos num único `BEGIN`/`COMMIT`. Não colar os `CREATE` um a um no SQL editor.

1. Rodar o pré-check de objetos (`auth.uid`, `auth.role`, fila, eventos, DLQ, `usuarios.ativo`, `caixas.loja_id`). Se falhar, não aplicar. O `CREATE FUNCTION` em plpgsql não recusa tabela ausente.
2. Aplicar o bundle. O `DO $verify$` aborta a transação inteira se o predicado morto permanecer.
3. Não registrar par em `migration-human-gates.json` antes das duas linhas existirem no ledger.

Recuperação segura, ensaiada no Postgres local:

- Falha no meio do bundle: a transação faz rollback. As funções anteriores continuam. Nada é restaurado à mão.
- Função segura perdida depois de um apply já commitado: reaplicar somente `20261009220000_fiscal_rpc_isola_loja.sql`. O teste local recusa qualquer outro SQL, inclusive `20261007161220`, com `RECOVERY_RECUSA_SQL_NAO_CANONICO`.
- Dados já alterados por uma chamada feita depois do apply não voltam com reaplicação de função. A recuperação de dados é o restore do backup lógico da janela num Postgres novo, não a troca de corpo de função.
- Reaplicar o `pg_get_functiondef` anterior, ou o corpo sem `FISCAL_CANCELAR_LOJA`, não é rollback. Reabre o bypass.

O checklist operacional está em `docs/auditorias/GO-LIVE-01-CHECKLIST-FISCAL.md`.

## 7. Testes antes e depois

Antes, no SHA autorizado:

| Comando | Exigência |
|---|---|
| `npm run test:fiscal-rpc-authz` em `backend/` | PASS |
| Leituras da seção 1 | iguais a este plano. Se divergirem, parar. |

Durante o apply: o `DO $verify$` e a prova do `20261007163200` têm de concluir sem `RAISE`.

Depois, só catálogo. Não chamar as RPCs contra os 42 documentos reais.

| Leitura | Exigência |
|---|---|
| `to_regprocedure('internal.fiscal_sessao_privilegiada()')` | não nulo |
| `to_regprocedure('public.fiscal_cancelar_documento(uuid, text)')` | não nulo |
| `position('fiscal_sessao_privilegiada' in pg_get_functiondef(...))` nas três RPCs que já existiam | maior que zero |
| `position('current_user <> ''postgres''' in ...)` nessas três | zero |
| `position('FISCAL_CANCELAR_LOJA' in fiscal_cancelar_documento)` | maior que zero |
| `has_function_privilege('anon', ..., 'EXECUTE')` nas quatro | falso |
| `INSERT` de `authenticated` em `documentos_fiscais_pendentes` | ausente |
| `count(*)` da tabela | 42, salvo uso real entre o snapshot e a leitura |

Fora desta janela: typecheck, lint, build Next, `supabase db reset`, k6 e o ensaio de 12 horas. Não são gate deste P0 e não foram executados aqui.

## Opções

Opção A — só `20261009220000`. Menor diff. Deixa `INSERT` de `authenticated` e deixa `fiscal_marcar_emitido` sem a trava `CANCELADO`.

Opção B — `20261009220000` e, na mesma janela, `20261007163200`. É a recomendada. Fecha o bypass das RPCs, cria o cancelamento com loja e tira o insert direto. Não mexe em financeiro nem em caixa.

Opção C — lote `20261007*` na ordem do runbook de 08/10, com zero caixas `ABERTO`, e `20261009220000` por último entre os escritores das RPCs fiscais. `20261006120000` não entra. Outra autorização, distinta da janela fiscal.

## Checklist antes de qualquer execução

O checklist operacional, com snapshot, validação e critérios de interrupção, está em `docs/auditorias/GO-LIVE-01-CHECKLIST-FISCAL.md`. A recuperação versionada reaplica só `20261009220000`. Não guarda corpo vulnerável como rollback.
