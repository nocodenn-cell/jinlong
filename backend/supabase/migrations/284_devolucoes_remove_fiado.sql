-- Migration 284: DB-14 (complemento) — remove 'FIADO' de devolucoes
-- Data: 2026-07-29
--
-- COMO FOI ENCONTRADO
-- -------------------
-- A migration 283 corrigiu `vendas` e `vendas_pagamentos`. A verificação final
-- pós-283 esperava 0 constraints com 'FIADO' em lista-enum e encontrou 1 —
-- `devolucoes_forma_pagamento_check`, que estava fora do escopo que eu havia
-- levantado. O desvio na validação é que expôs a lacuna.
--
-- POR QUE É PIOR QUE O CASO DA 283
-- --------------------------------
-- Em `vendas` e `vendas_pagamentos`, a lista-enum incluía 'FIADO' mas havia uma
-- constraint irmã (`*_nao_fiado`) bloqueando de fato — o efeito líquido já era
-- correto e a correção foi apenas de clareza.
--
-- `devolucoes` NÃO tem constraint irmã. A lista-enum é a única guarda, e ela
-- ACEITA 'FIADO'. Ou seja: o caminho de devolução podia gravar uma forma de
-- pagamento que a migration 246 removeu do sistema e que o caminho de venda
-- rejeita. Não é ruído de schema — é uma lacuna funcional residual da 246,
-- que corrigiu a venda e esqueceu a devolução.
--
-- VERIFICAÇÃO PRÉVIA
-- ------------------
--   devolucoes ................... 5 linhas
--   com forma_pagamento 'FIADO' .. 0
--   formas em uso ................ 'DINHEIRO'
--   → nenhuma linha afetada; constraint entra VALIDADA.
--
-- SIMETRIA COM vendas
-- -------------------
-- Além de remover 'FIADO' da lista, acrescenta `devolucoes_forma_nao_fiado`,
-- espelhando `vendas_forma_pagamento_nao_fiado`. Assim as três tabelas do
-- fluxo financeiro (vendas, vendas_pagamentos, devolucoes) passam a ter a
-- mesma dupla de guardas, e a comparação por upper() cobre variações de caixa
-- que a lista literal não cobre.
--
-- Delta de comportamento: nenhuma devolução existente é afetada. Devoluções
-- futuras com 'FIADO' passam a ser rejeitadas — que é o comportamento
-- pretendido desde a migration 246.
--
-- ROLLBACK
-- --------
--   ALTER TABLE public.devolucoes DROP CONSTRAINT devolucoes_forma_nao_fiado;
--   ALTER TABLE public.devolucoes DROP CONSTRAINT devolucoes_forma_pagamento_check;
--   ALTER TABLE public.devolucoes ADD CONSTRAINT devolucoes_forma_pagamento_check
--     CHECK (forma_pagamento = ANY (ARRAY['DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO','FIADO']));

BEGIN;

ALTER TABLE public.devolucoes DROP CONSTRAINT devolucoes_forma_pagamento_check;
ALTER TABLE public.devolucoes
  ADD CONSTRAINT devolucoes_forma_pagamento_check
  CHECK (forma_pagamento = ANY (ARRAY['DINHEIRO'::text, 'PIX'::text, 'CARTAO_DEBITO'::text, 'CARTAO_CREDITO'::text]));

ALTER TABLE public.devolucoes
  ADD CONSTRAINT devolucoes_forma_nao_fiado
  CHECK (forma_pagamento IS NULL OR upper(forma_pagamento) <> 'FIADO'::text);

COMMIT;
