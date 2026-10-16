# Reconciliação de migrations — repo × homolog × produção (2026-10-16)

Decisão do responsável: reconciliação controlada. Primeiro homologação; produção só depois de validar
e com autorização específica. **Nenhuma alteração foi feita em produção** (`kbabmewnahysfvlybiak`): só
leituras (`list_migrations` e `SELECT` em catálogo).

## 1. Causa exata da falha do `migration-remote-drift` (PR #572)

- O secret `SUPABASE_MIGRATION_CHECK_PROJECT_REF` foi gravado em 2026-07-02, quando o único projeto da
  conta era `jinlong`, a **produção**. O jinlong-staging (`tarxrbxddcwvjkimkbnr`) só existe desde 2026-10-09
  e está INACTIVE; o jinlong-homolog-palm (`yvdilcmxyjafnnsfdtam`) existe desde 2026-10-12. As versões
  "só no remoto" que aparecem no log batem 1:1 com `list_migrations` da produção (a última é
  20261009140739). Conclusão: o gate compara o repo com a produção.
- O drift bloqueante do log da #572 são 13 versões `remote_ausente`: as 11 da main listadas abaixo
  e as 2 da própria #572. As 37 versões "só no remoto" não bloqueiam. São aplicações via MCP
  `apply_migration`, que grava o timestamp da execução como versão, e já estão pareadas em
  `backend/supabase/migration-human-gates.json`.
- Desde 20261006120000 (PR #466) a main tem migration não aplicada em produção. A partir daí,
  **todo** PR que toca `backend/` falha, inclusive os do dependabot.

## 2. Três ambientes, três estados (não são equivalentes)

| Ambiente | Projeto | Estado das migrations | Observação |
|---|---|---|---|
| Repositório (`main`) | — | 407 arquivos; última 20261010120000 | Fonte da sequência |
| PR #572 | — | main + 20261015120000 + 20261015130000 | Não mergeado |
| Homologação | `yvdilcmxyjafnnsfdtam` | 407 aplicadas via `supabase db push` em 2026-10-16 (sem seed) | Greenfield: reflete o repo, **não** a produção |
| Produção | `kbabmewnahysfvlybiak` | Até 20261009140739 (vários registros com versão MCP); faltam as 11 abaixo | Schema com drift próprio (seção 2.1) |
| Stack isolado local | `fastproduct-driftval` (Docker, portas 584xx) | main + #572 + seed, do zero | Usado na validação da seção 4 |

### 2.1 Produção × repositório fora das 11 pendentes

Comparação por catálogo (corpo das funções sem comentários e espaços, atributos, colunas, policies e
ACLs). A referência é o homolog, que é o repo aplicado do zero.

- **Iguais na lógica**: 45 funções diferem só em comentário ou espaçamento. Entre elas está
  `ajustar_estoque_manual_seguro`, o que confirma a premissa da 20261015130000. As views do grupo `v_*`,
  inclusive `v_kardex_unificado`, são idênticas.
- **Lógica diferente em produção** (sem relação com as 11): `dashboard_gerente_resumo`,
  `financeiro_painel`, `fiscal_marcar_erro/3`, `fiscal_marcar_erro_normalizado/9`,
  `pdv_diagnostico_pre_producao`.
- **Atributos diferentes** (search_path/SECURITY DEFINER): `finalizar_venda_transacional_canonica_v2/13`,
  `…_v3/18`, `set_updated_at`.
- **Só em produção**: overloads legados `finalizar_venda_transacional/7`, `…_canonica_v2/12`,
  `fiscal_marcar_erro/6` e `fiscal_marcar_erro_normalizado/6`; também `shadow_validar_venda_engine_v4`,
  `caixa_integridade_gate_check`, `listar_valores_sistema_dinheiro_caixas`, as tabelas `perfis` e
  `venda_engine_shadow_runs`, e as colunas `vendas.idempotency_key` e `movimentacoes_caixa.loja_id`.
- **Policies que existem em produção e não estão em nenhum arquivo do repo**: `itens_venda_select_loja`,
  `itens_venda_write_gerente_loja`, `ordens_compra_gerente_loja`, `ordens_compra_itens_gerente_loja`,
  `pdv_config_select_gerencial`, `pdv_config_update_dono`, `tokens_desconto_select_gerente`,
  `clientes_loja_isolado`, `transferencias_idempotencia_*_gerente`. Em produção, várias policies de
  `clientes`, `estoque` e `vendas` valem para `public`; no repo valem para `authenticated`.
- **Colunas/defaults**: o repo cria `pdv_config.gerente_senha_sha256 NOT NULL`, que não existe em
  produção. No repo, `produtos.loja_id` tem default da loja piloto; em produção, não tem.
  `produtos.tags` e `marcas.created_at` têm nullability diferente.
- **ACL de tabela**: no repo, `pdv_config` e `caixa_scan_telemetry_events` concedem mais que em produção.
  O repo também concede `SELECT` em `documentos_fiscais_dlq` para anon/authenticated, e em
  `sync_request_nonces` a produção está com RLS desligado e o repo com RLS ligado.

**Consequência:** validar no homolog prova que a sequência funciona no schema do **repo**. Isso não prova
que ela funciona no schema **real** de produção. As 11 pendentes não tocam os objetos acima, exceto
`fiscal_marcar_*`, que é redefinida pela 20261007161220 e pela 20261009220000. Mesmo assim, antes de
produção, o ensaio deve rodar sobre uma cópia do schema de produção (seção 6, passo P2).
Ver também `docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md` (rodada anterior desta auditoria).

## 3. Matriz das migrations pendentes

Todas são `CREATE OR REPLACE`, `REVOKE` ou DDL aditiva, dentro de `BEGIN/COMMIT`. Nenhuma reescreve
dados históricos. Situação: **R** = repo (main), **H** = homolog, **L** = stack isolado, **P** = produção.

| Versão | Finalidade | Depende de | R | H | L | P | Risco | Validação | Rollback |
|---|---|---|---|---|---|---|---|---|---|
| 20261006120000 financeiro_contas_formas_e_painel | Vínculo forma→conta (`formas_pagamento.conta_financeira_id`), inativação, `financeiro_comando`, captura de venda com conta padrão | 20261005004647 (P: sim) | ✔ | ✔ | ✔ | ✖ | Médio: altera `financeiro_comando` e o trigger de captura de venda | test:financial 34/34, test-financeiro-loja | Reaplicar `financeiro_comando` e `internal.financeiro_capturar_venda` de 20261005004647; `DROP COLUMN conta_financeira_id` (só se nenhuma forma tiver vínculo) |
| 20261007161220 fiscal_cancelado_ssot | `fiscal_marcar_cancelado`; `fiscal_marcar_emitido` fail-closed para CANCELADO; `REVOKE INSERT` em pendentes | Em runtime, `fiscal_cancelar_documento` usa o mesmo corpo da 20261009220000: aplicar **as duas no mesmo lote** | ✔ | ✔ | ✔ | ✖ | Médio: muda a máquina de estados fiscal; o worker passa a usar `fiscal_marcar_cancelado` | test:fiscal-rpc-authz, gate fiscal | Reaplicar `fiscal_marcar_emitido` de 20260731201500; `DROP FUNCTION fiscal_marcar_cancelado` e `fiscal_cancelar_documento` (novas em P); `GRANT INSERT` (não recomendado) |
| 20261007163000 ssot_001_002_painel_ec_cache | `cancelar_venda` e trigger de crédito em dinheiro passam a usar E(c) e o cache derivado | `internal.valor_sistema_dinheiro` e `internal.sincronizar_saldo_cache` (P: sim) | ✔ | ✔ | ✔ | ✖ | **Alto**: saldo de caixa | gate-a05, devolucao-d13, concorrência PR-2D | Reaplicar os corpos anteriores (20260909200000 / trigger de 20260731200258) |
| 20261007163100 ssot_003_nfe_obrigacao_duplicata | NF-e com valor > 0 exige duplicata (AP) | Corpo de 20261005225856 (P: sim, como 20261006195805) | ✔ | ✔ | ✔ | ✖ | Médio: NF-e sem duplicata passa a ser recusada | nfe-duplicata-invalida-aborta, flx05 | Reaplicar `confirmar_importacao_nfe` de 20261005225856 |
| 20261007163200 ssot_004_revoke_insert_documentos_fiscais | Reafirma `REVOKE INSERT` (idempotente) | — | ✔ | ✔ | ✔ | ✖ | Baixo | c1-secdef | `GRANT INSERT … TO authenticated` (não recomendado) |
| 20261007170000 ssot_002_mov_ar_ec_cache | Sangria, suprimento e AR decidem por E(c), não por `saldo_atual` | Mesmas da 163000 | ✔ | ✔ | ✔ | ✖ | **Alto**: caixa e AR | test:financial (AR/AP), tokens-autorizacao | Reaplicar `registrar_movimentacao` (20260731195704), `aprovar_movimentacao` (20260909180000), `registrar_liquidacao_receber` (20260814013447), `estornar_liquidacao_receber` (20260814095445) |
| 20261007171000 ssot_002_cancel_guard_antes_devolucao | Hotfix: guard de E(c) antes do INSERT em devoluções | 163000 | ✔ | ✔ | ✔ | ✖ | Alto se aplicada sem a 163000 (falso negativo no cancelamento) | gate-a05 | Reaplicar `cancelar_venda_transacional` de 163000 |
| 20261007180000 calcular_valor_sistema_por_forma_caixa | Read model do fechamento por forma (somente leitura) | — | ✔ | ✔ | ✔ | ✖ | Baixo (só leitura); a main já chama a RPC (`app/caixa/server/fechamentoPorForma.impl.ts`) | listar-caixas, vendas-lista-kpis | `DROP FUNCTION` das duas funções |
| 20261007190000 caixas_fechamento_formas_snapshot | Tabela snapshot e `fechar_caixa_atomico` gravando por forma | **180000** | ✔ | ✔ | ✔ | ✖ | Médio: `fechar_caixa_atomico` é caminho crítico | gate-a02 | `DROP TABLE caixas_fechamento_formas`; reaplicar `fechar_caixa_atomico` de 20260902100200 |
| 20261009220000 fiscal_rpc_isola_loja | Fecha bypass de autorização nas RPCs fiscais (`session_user`) e isola por loja | — (cria `internal.fiscal_sessao_privilegiada`) | ✔ | ✔ | ✔ | ✖ | **Alto se NÃO aplicada**: OPERADOR da loja A reprocessa/enfileira documento da loja B | test:fiscal-rpc-authz (ANTES/DEPOIS) | Reaplicar `fiscal_reprocessar_documento` (20260806135429), `fiscal_enfileirar_documento_venda` (20260819220100) e o corpo anterior de `fiscal_registrar_evento_enqueue_erro`; `DROP FUNCTION internal.fiscal_sessao_privilegiada`. Reabre o bypass |
| 20261010120000 caixa_sem_loja_padrao | `caixas.loja_id DROP DEFAULT` | **Edge `sync-outbox` exigindo `loja_id` já em produção** | ✔ | ✔ | ✔ | ✖ (P ainda tem default `a0000001…`) | **Alto**: sem a Edge nova, o sync de caixa falha. O próprio arquivo diz "Não aplicar em produção nesta sprint" | sync-outbox contract smoke | `ALTER … SET DEFAULT 'a0000001-0000-4000-8000-000000000001'::uuid` |
| 20261015120000 (#572) fix_v_kardex_unificado_anti_join_cancelamento | Anti-join no ramo `erc`: o kardex deixa de duplicar o estorno de cancelamento | Mesmas colunas da view atual (P: view idêntica ao repo) | PR | ✖ | ✔ | ✖ | Baixo: só leitura, não altera saldo | pr1b-kardex-imutavel, test:financial | `CREATE OR REPLACE VIEW` de 20260828110000 |
| 20261015130000 (#572) ajuste_estoque_motivo_coerente_com_sinal | Guard: motivo coerente com o sinal do delta no ajuste manual | Corpo de 20261005224553 (P: logicamente idêntico) | PR | ✖ | ✔ | ✖ | Baixo/médio: chamadas antes aceitas (PERDA com +) passam a ser recusadas; o front da #572 trata | ajuste-motivo-sinal.test.sql (#572) | Reaplicar `ajustar_estoque_manual_seguro` de 20261005224553 |

### 3.1 As duas da #572

- **Aditivas e sem dados:** `CREATE OR REPLACE` de view (mesma lista de colunas) e de função (mesma assinatura).
- **Reversíveis:** reaplicar 20260828110000 (view) e 20261005224553 (função).
- **Compatíveis com a sequência:** nenhuma das 11 pendentes toca `v_kardex_unificado` ou
  `ajustar_estoque_manual_seguro`. Em produção, os dois objetos estão logicamente idênticos ao repo, então
  podem ser aplicadas sem depender das 11. A sequência main + #572 foi aplicada do zero no stack isolado sem erro.

## 4. Validação em ambiente isolado (2026-10-16)

O stack local `fastproduct-driftval` foi criado do zero com as 407 migrations da main, as 2 da #572 e
o seed. Ele roda separado do stack `fastproduct` usado no dia a dia. Os passos de teste replicam o job
`supabase-local-gates`:

| Suíte | Resultado |
|---|---|
| smoke_rls_painel_gerente.sql | OK |
| fase2-coalesce-operador-id (anon em RPC com `p_operador_id`) | OK |
| c1-secdef-sem-identidade / c2-suspensao-vendas-trigger | OK |
| devolucao-d13-caixa-desembolso / listar-caixas-elegiveis-desembolso | OK |
| vendas-lista-kpis-por-venda | OK |
| ajuste-motivo-sinal.test.sql (#572) | OK |
| test:rls-scope | 44/44 |
| seed-dev-users + p0-rls-rest-smoke | RLS_REST_SMOKE_OK |
| test:financial (inclui kardex imutável, AR/AP, gates A01–A05, concorrência) | 34/34 |
| test:financeiro-loja / test:fiscal-rpc-authz | OK |
| devolucao-concorrencia.sh (sessões reais) | OK |
| n1-preco-custo-authz-smoke | OK |
| Tipos (`gen types` do stack × `database.types.ts`) | idênticos |
| `p0-migration-status` contra o homolog (main) | ALINHADO 407/407 |

Armadilha encontrada: no Windows, `run-financial-tests.mjs`, os testes de concorrência e `test-rls-scope.mjs`
caem para `docker exec supabase_db_fastproduct` quando não acham um `psql.exe`, **mesmo com `DB_URL` definido**.
A primeira rodada gravou 8 vendas de teste e 2 movimentos de estoque no stack local `fastproduct`
(2026-10-16 10:04–10:05 UTC). Os resultados acima vêm da segunda rodada, com `FINANCIAL_TEST_PSQL` apontando
para o container isolado.

## 5. Gate de CI: não esconder drift real

Mudança da PR #573 (`p0-migration-status.mjs` + workflow):

- **Continua bloqueando:** migration que **já está na base** do PR (main) e não está no remoto; versão
  remote-only fora do registro HUMAN_GATE; local ≠ remoto; registro HUMAN_GATE inválido; falha ao ler o ref
  de base (fail-closed).
- **Deixa de bloquear:** só a migration **nova do próprio PR** (arquivo ausente em `origin/<base>`). Ela
  aparece listada no log como "Migrations novas deste PR". Sem ref de base (workflow_dispatch), o gate segue estrito.
- O drift atual de produção **não fica escondido**, porque o alvo deixa de ser produção. Em produção, as 11
  continuam pendentes, e isso precisa de um detector próprio (abaixo).

### Arquitetura proposta

1. **Gate de PR (bloqueante) → homolog.** Exige trocar o secret do repositório
   `SUPABASE_MIGRATION_CHECK_PROJECT_REF` para `yvdilcmxyjafnnsfdtam`. É mudança de configuração, a cargo do
   responsável; não foi feita. Invariante: `main ⊆ homolog`.
2. **Promoção para homolog após merge:** `supabase db push` no homolog a cada merge com migration.
   Hoje é manual; pode virar job `push: main` com aprovação de environment. Se isso não for feito,
   o próximo PR bloqueia, o que é correto: é drift real da base.
3. **Detector de drift de produção (não bloqueante para PR):** job agendado ou `workflow_dispatch` com
   secret próprio (`SUPABASE_PROD_PROJECT_REF`). Roda `p0-migration-status` estrito contra produção e
   abre ou atualiza um issue ("produção N migrations atrás da main"). Preserva a detecção sem travar PRs.
4. **Drift de schema (seção 2.1):** a contagem de versões não vê policies e corpos alterados fora de migration.
   Proposta: o mesmo job agendado compara uma impressão digital do catálogo (a da seção 2.1) entre produção e homolog.

## 6. Procedimento proposto para produção (NÃO executado; exige autorização específica)

- P1. Fazer backup lógico ou confirmar o PITR de produção (ver o gate de backup do #480 — RPO não garantido).
  Antes de cada lote, salvar o `pg_get_functiondef` de produção dos objetos que o lote redefine. Esse é o
  rollback mais seguro, porque a seção 2.1 mostra que o corpo em produção nem sempre é o do arquivo do repo.
- P2. **Ensaio sobre o schema real:** `supabase db dump --schema-only` de produção (leitura) → restaurar num
  stack isolado → aplicar as 11 (+2) → rodar a bateria da seção 4. Isso cobre o drift da seção 2.1.
  Observação: o CLI cria um login role temporário no projeto ao se conectar. Isso também exige autorização.
- P3. Lotes sugeridos, nesta ordem, um por janela:
  - **A:** 20261009220000 + 20261007161220 + 20261007163200 (segurança fiscal; isolado).
  - **B:** 20261007163000 + 20261007171000 + 20261007170000 (caixa E(c); fora do horário de venda).
  - **C:** 20261007180000 + 20261007190000 (fechamento por forma).
  - **D:** 20261006120000 + 20261007163100 (financeiro e NF-e).
  - **E:** 20261015120000 + 20261015130000 (#572, após o merge).
  - **F:** 20261010120000, só depois do deploy da Edge `sync-outbox` que exige `loja_id`.
- P4. Aplicar com `supabase db push` (versão = nome do arquivo), **não** com MCP `apply_migration`. O MCP grava
  o timestamp da execução e gera mais pares no HUMAN_GATE.
- P5. Depois de cada lote: rodar `p0-migration-status` contra produção, smoke REST/RLS e conferir o kardex e
  o saldo de um caixa.
- Rollback: coluna "Rollback" da matriz. Nenhum lote altera dados existentes, então o rollback é reaplicar os
  corpos anteriores. Exceção: o lote C, se já houver linhas em `caixas_fechamento_formas`.
