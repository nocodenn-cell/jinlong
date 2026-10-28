# Auditoria de integração INT-01 — módulos JINLONG

Data: 2026-10-28 · Branch: `claude/jinlong-integration-audit-808a95` (worktree `open-sprints-analysis-2f4e6e`)
Escopo: 12 integrações listadas no sprint. Nenhum código de produção alterado; nenhum módulo criado.

## Método e limites

- **Banco de teste:** PGlite em memória com **todas as 439 migrations** do repositório aplicadas (`backend/scripts/lib/pglite-full-schema.mjs`). Resultado: 0 migrations com falha.
- **Suítes executadas:** `node --test` nos `.test.mjs` com PGlite, e um runner próprio (fora do repo) que aplica as migrations e executa os `.test.sql`, expandindo `\i` e removendo meta-comandos `\set`/`\echo`.
- **Não executado aqui:** `npm run test:financial` (exige `psql`, ausente neste host), suítes `.sh`, `deno test` (Deno ausente). O Supabase local `supabase_db_fastproduct` está em **412 de 439 migrations**; não foi migrado para não alterar o banco local. Não foi tocado nenhum banco de produção.
- **Limitações do PGlite** (documentadas abaixo): não expõe `pg_locks` de advisory lock, não interpreta `\gset`, e não tem os privilégios padrão do `service_role` do Supabase.

## Resultado por integração

| # | Integração | Resultado | Evidência principal |
|---|---|---|---|
| 1 | Venda → Estoque (baixa exata e idempotente) | **PASSOU** (com ressalva) | `gate-a01-venda-retry-payload-divergente` PASS, `pr1c-estoque-quantidade-protecao` PASS, `pr1b-kardex-imutavel` PASS. Ressalva: `multiempresa-fase5` vermelho por teste desatualizado (ver item P1-1). |
| 2 | Venda → Comissões (beneficiário e cálculo) | **PASSOU** (parcial) | `comissao/p0_vendedor_base_falhas`, `p1_regras_fechamento`, `p2_metas_parcelas_divisao`, `regressao_cenarios` PASS. `p3_correcoes_revisao` interrompido em asserção de `pg_locks` (limitação PGlite). |
| 3 | Funcionários → Vendas (identidade e permissões) | **FALHOU** | `multiempresa-fase2` aponta `funcionario_dados`, `usuario_pin`, `pdv_operador_eventos` sem `tenant_guard`. `test-funcionario-dados-rls.sh` não executado. |
| 4 | Venda → Caixa (pagamentos reconciliados) | **PASSOU** | `caixa-reconciliacao-contrato`, blocos A e S10–S13 conformes. O S7 inicialmente reportado como defeito era falha do próprio teste (ver correção abaixo). |
| 5 | Caixa → Financeiro (movimentos e saldos) | **FALHOU** | Fluxo PDV↔financeiro PASS (`test-pdv-caixa-financeiro-fluxo`, `test-financeiro-loja` 16/16, `financeiro-contas-operacionais` 4/4). Divergem do contrato: S9a, S9b (cancelamento de venda de caixa fechado) e S12 (cancelamento com 2 caixas abertos aceito sem `caixa_id`). O teste declara estes como esperados até o PR-2. |
| 6 | Compra → Estoque (recebimento conferido) | **PASSOU** | `ux04-oc-recebimento-parcial` PASS, `entrada-documento-posterior` PASS, `pr1b-kardex-imutavel` PASS. Concorrência (`ux04-oc-recebimento-concorrencia.sh`) não executada. |
| 7 | Compra → Financeiro (obrigação coerente) | **NÃO TESTADA** | `ap-payments-reconciliation.test.sql` usa `\gset` (requer psql). |
| 8 | Cancelamento → Estoque (reposição sem duplicidade) | **NÃO TESTADA** | Não há suíte PGlite para reposição. `verify-cancelar-venda-equivalencia.mjs` e `test-estoque-decremento-concurrency.mjs` exigem banco vivo. `gate-a05` cobre só o lado do caixa. |
| 9 | Cancelamento → Comissões (compensação rastreável) | **PASSOU** | `comissao/p1_regras_fechamento` PASS: cancelamento gera ajuste no período seguinte. |
| 10 | Vendas → Fiscal (documento e status) | **PASSOU** | `fiscal-cancelamento-categoria`, `fiscal-p0-pre-req`, `fiscal-rpc-loja-authz` PASS. Testes Deno de `fiscal-worker` e `sync-outbox` não executados. |
| 11 | Operações → Auditoria (autor, data, alterações) | **NÃO TESTADA** | Não há teste ponta a ponta. Só a imutabilidade do kardex foi testada (`pr1b`). |
| 12 | Multiempresa → Todos | **FALHOU** | `multiempresa-fase2`: 18 testes ok, falhas em enumeração de guardas, envelopes de RPC e rollback (65 vs 55). `multiempresa-fase5`: falha de rota. Fases 1, 3, 4, `go-live-01` e `cobranca` PASS. |

Totais: **6 PASSOU**, **3 FALHOU**, **3 NÃO TESTADA**.

**Correção (2026-10-28, após a auditoria):** o S7 foi reportado como defeito, mas era falha do teste. A loja tinha 7 caixas abertos (blocos anteriores não os fecham), então a devolução sem `caixa_id` é rejeitada por `DEVOLVER_VENDA_CAIXA_OBRIGATORIO`, como manda a regra D-3. Com `caixa_id` explícito a devolução de 50 é aceita e a gaveta vai a 50,00. O teste foi corrigido para passar o caixa (`backend/scripts/caixa-reconciliacao-contrato.test.sql`, bloco A). Nenhum código de produção foi alterado.

## Evidências detalhadas

### Multiempresa (12) — FALHOU
- Tabelas em `public` sem `tenant_guard`, sem isenção: `comissoes_config`, `comissoes_divisoes`, `comissoes_falhas`, `comissoes_metas`, `comissoes_periodo_vendedores`, `comissoes_periodos`, `comissoes_regras`, `comissoes_regras_log`, `commercial_*`, `empresa_modulos`, `empresa_modulos_historico`, `empresa_parametros_importacao`, `empresa_tributos_override`, `funcionario_dados`, `import_*` (17 tabelas), `modulos_catalogo`, `pdv_operador_eventos`, `tributos_catalogo_uf`, `usuario_pin`.
- RPCs `SECURITY DEFINER` expostas a `authenticated` sem envelope nem pendência: `definir_vendedor_venda`, `comissao_*`, `minhas_comissoes`, `definir_meu_pin_pdv`, `resetar_pin_operador_pdv`, `status_pin_equipe_pdv`, `reprocessar_comissao_venda`, `produtos_custos_autorizados`, `listar_vendedores_loja`, `import_*`. Algumas podem ter guarda interna; isso precisa ser verificado corpo a corpo.
- Fase 2: o teste de rollback espera 55 RPCs e encontra 65.
- Ressalva: o log de `multiempresa-fase2` mostra só a assertiva que falhou; não foi verificado se a falta de guarda gera vazamento real, porque não há teste de exploração cruzada para essas tabelas.

### Venda → Caixa (4) — PASSOU
- Antes da correção, S7 aparecia como `AMBOS DIVERGEM` (100 em vez de 50). A causa era a chamada sem `caixa_id` com 7 caixas abertos: `DEVOLVER_VENDA_CAIXA_OBRIGATORIO`, comportamento correto.
- Com `caixa_id` explícito, S7 dá `50.00 | 50.00 | 50.00 | OK`.

### Caixa → Financeiro (5) — FALHOU
- S9a: cancelamento de venda de caixa fechado; `sistema 0.00`, esperado `100.00` (caixa fechado deveria ser imutável).
- S9b: cancelamento de venda de caixa fechado com caixa aberto pagante; `sistema 100.00`, esperado `0.00`.
- S12: cancelamento com 2 caixas abertos e sem `caixa_id` é aceito. Deveria ser rejeitado (`DEVOLVER_VENDA_CAIXA_OBRIGATORIO` vale só para devolução).
- PDV↔financeiro PASS: `test-pdv-caixa-financeiro-fluxo` e `test-financeiro-loja` (16/16) cobrem sangria, vínculo de caixa e liquidação.

### Funcionários → Vendas (3) — FALHOU
- `funcionario_dados` tem `empresa_id` e policies `funcionario_dados_gerencial_*`, mas não tem `tenant_guard`.
- `usuario_pin` e `pdv_operador_eventos` (tem `loja_id`) também estão sem guarda.
- `test-funcionario-dados-rls.sh` existe e não foi executado.

### Venda → Estoque (1) — PASSOU com ressalva
- A suíte `multiempresa-fase5-catalogo` falha em `filial baixa estoque ... decrementar_estoque_seguro: permission denied`.
- Causa: a migration `20261023120000_revoga_decrementar_estoque_seguro_authenticated` revogou de propósito o `EXECUTE` de `authenticated`. Os únicos chamadores legítimos são `finalizar_venda_transacional_canonica_v4` (SECURITY DEFINER) e a `sync-outbox` (`service_role`). Logo, o teste está desatualizado, e a produção não está quebrada por isso. O teste precisa ser reescrito para o caminho v4.

## Priorização

### P0 — Quebrado/travado
- **P0-2 · Tabelas sem `tenant_guard` (Multiempresa / Funcionários).** Verificar, tabela a tabela, se há exposição cruzada entre empresas (começar por `funcionario_dados`, `usuario_pin`, `pdv_operador_eventos`, `comissoes_*`, `import_*`). Adicionar guarda ou isenção com motivo.
- **P0-3 · RPCs `SECURITY DEFINER` sem envelope (Multiempresa).** Confirmar guarda interna em `definir_vendedor_venda`, `minhas_comissoes`, `produtos_custos_autorizados`, `definir_meu_pin_pdv` e no grupo `import_*`.

### P1 — Falta para lançar (MVP)
- **P1-1 · Suíte `multiempresa-fase5` vermelha por teste desatualizado.** Reescrever a asserção de filial/operador para o caminho `finalizar_venda_transacional_canonica_v4`.
- **P1-2 · Suíte `multiempresa-fase2` vermelha no rollback (65 vs 55).** Atualizar a contagem ou o rollback.
- **P1-3 · Caixa: cancelamento de venda de caixa fechado não reflete no caixa aberto (S9b) e cancelamento multi-caixa sem `caixa_id` é aceito (S12).** Fechar no PR-2 já planejado.
- **P1-4 · Rodar as suítes que precisam de psql.** `ap-payments-reconciliation`, `ar-receipts-reconciliation`, `sale-totals-invariant`, `financeiro-hardening-full-schema`, `financial-adversarial-gates`, `ux04` concorrência, `funcionario-dados-rls.sh`, `test-estoque-decremento-concurrency.mjs`, `verify-cancelar-venda-equivalencia.mjs`. Usar `npm run test:financial` com `FINANCIAL_TEST_PSQL` apontando para um banco de homologação migrado.
- **P1-5 · Alinhar o Supabase local.** `supabase_db_fastproduct` está em 412/439 migrations. Migrar antes de rodar testes contra ele.
- **P1-6 · Cobrir Cancelamento → Estoque (reposição) e Operações → Auditoria** com teste próprio.

### P2 — Melhoria
- **P2-1 · `vendas-lista-kpis-por-venda` falha por privilégio de `service_role` no PGlite.** O stub não replica os default privileges do Supabase. Adicionar essa replicação ao `pglite-full-schema.mjs`.
- **P2-2 · `p3_correcoes_revisao` (comissão) depende de `pg_locks` do PGlite.** Trocar a asserção por checagem funcional ou rodar no Postgres real.

## Como reproduzir
```bash
cd backend
node --test scripts/multiempresa-fase2-cobertura.test.mjs
node --test scripts/test-pdv-caixa-financeiro-fluxo.mjs
```
Os `.test.sql` com `\i` e `\gset` precisam de psql (`npm run test:financial`).
