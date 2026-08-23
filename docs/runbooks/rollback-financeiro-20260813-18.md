# Runbook de rollback financeiro - migrations 20260813 a 20260818

Este documento preserva as orientações de rollback que estavam em alterações
locais de migrations já aplicadas. As migrations históricas permanecem
imutáveis; este runbook é a fonte operacional para rollback.

## Princípio

Rollback financeiro compensa fatos; nunca apaga pagamentos, liquidações,
movimentações ou chaves de correlação já gravadas. Não executar estes passos em
produção sem janela, backup verificado, responsável definido e aprovação
explícita.

## `20260813231034_financial_idempotency_correlation_expand.sql`

A reversão preferencial é não remover as colunas: são nullable e preservam
idempotência/correlação. Reversão literal só é aceitável se nenhuma migration
posterior do bloco estiver aplicada.

Se essa condição for comprovada, remover primeiro os índices de correlação e
idempotência de `contas_pagar_pagamentos` e `liquidacoes_receber`; depois remover
as constraints `*_operacao_origem_distinta`, `*_operacao_tipo_check`,
`*_origem_not_blank` e `*_idempotency_key_not_blank`; por último remover as
colunas de movimentação, origem, operação, caixa, loja e idempotência.

Esses `DROP COLUMN` destroem rastreabilidade. Não usá-los quando já existirem
fatos financeiros correlacionados.

## `20260813232133_sale_totals_invariant.sql`

É rollback de código, não de dados, mas não é reversível isoladamente porque
migrations posteriores redefinem os mesmos objetos. Reverter o bloco em ordem
decrescente e só então restaurar:

- `registrar_venda_com_itens` a partir de `015_security_rpc_hardening.sql`;
- `finalizar_venda_transacional_canonica_v4` a partir de
  `20260809120837_finalize_v4_scope_guard_22args.sql`;
- `verificar_consistencia_venda(uuid)` a partir de
  `20260718181600_fix_verificar_consistencia_venda_total_liquido.sql`.

Restaurar também os GRANT/REVOKE das versões de origem. Remover
`internal.calcular_totais_venda(jsonb, numeric)` somente depois de provar que
nenhuma função remanescente a referencia. A reversão reabre a possibilidade de
divergência de centavos entre writers.

## `20260813234233_ar_receipts_reconciliation.sql`

Não apagar liquidações. Corrigir recebimento indevido por estorno compensatório
com `operacao_tipo='ESTORNO'` e `operacao_origem_id` apontando para o fato
original.

A migration não é reversível isoladamente: migrations posteriores redefinem a
liquidação e acrescentam estorno auditável. Após reverter o bloco em ordem
decrescente, a versão anterior de `registrar_liquidacao_receber` vem de
`112_clientes_contas_receber_loja_isolamento.sql`, e o cálculo anterior do caixa
vem de `20260718184800_adr_caixa_002_modelo_alpha_e_cancel.sql`, sempre com suas
ACLs originais.

O rollback faz recebimentos deixarem de produzir efeito no caixa e exige
conferência manual antes de reabrir a loja.

## `20260814000154_ap_payments_reconciliation.sql`

Não apagar pagamentos nem sangrias. Pagamento indevido é corrigido por estorno
compensatório correlacionado e pela movimentação de caixa autorizada.

A migration não é reversível isoladamente: migrations posteriores redefinem o
pagamento e o estorno. Após reverter o bloco em ordem decrescente, a versão
anterior de `registrar_pagamento_contas_pagar` vem de
`20260806002925_299_tb07_pagamento_contas_pagar_limite_saldo.sql`, com seus
GRANT/REVOKE.

O rollback faz pagamento de AP deixar de gerar saída física de caixa. Conferir
sangrias sem pagamento correlacionado antes de reabrir a loja.

## `20260818000001_revoke_relatorio_consistencia_vendas.sql`

Esta migration alinha o banco/CI ao revoke manual previamente registrado:
`relatorio_consistencia_vendas` e `verificar_consistencia_venda` não devem ser
executáveis por `authenticated`. Reverter esse revoke reabre exposição de
diagnósticos `SECURITY DEFINER` e não é recomendado.

## Validação antes de qualquer rollback

1. Confirmar versões aplicadas com `supabase migration list` no ambiente certo.
2. Identificar todas as redefinições posteriores dos objetos.
3. Verificar backup/restore e registrar RPO/RTO.
4. Executar o plano primeiro em ambiente descartável.
5. Rodar gates financeiros, RLS, typecheck e build no mesmo SHA candidato.
6. Registrar efeitos compensatórios e responsáveis; nunca editar migration
   histórica para documentar a execução.
