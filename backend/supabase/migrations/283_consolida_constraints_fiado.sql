-- Migration 283: DB-14 — remove 'FIADO' das listas-enum de forma_pagamento
-- Data: 2026-07-29
--
-- PROBLEMA
-- --------
-- A migration 246 (`remover_venda_fiado`) descontinuou a venda fiado, mas o
-- fez acrescentando constraints NOVAS de bloqueio em vez de corrigir as listas
-- existentes. Resultado: cada tabela ficou com duas constraints em desacordo.
--
--   vendas:
--     vendas_forma_pagamento_check      → lista INCLUI 'FIADO'
--     vendas_forma_pagamento_nao_fiado  → proíbe 'FIADO'
--   vendas_pagamentos:
--     vendas_pagamentos_forma_pagamento_check → lista INCLUI 'FIADO'
--     vendas_pagamentos_forma_nao_fiado       → proíbe 'FIADO'
--
-- O efeito líquido sempre foi o correto (FIADO bloqueado), mas um leitor do
-- schema — humano ou o baseline gerado pelo `db pull` — vê 'FIADO' listado como
-- forma de pagamento aceita. É ruído que atrapalha auditoria e induz erro.
--
-- VERIFICAÇÃO PRÉVIA
-- ------------------
--   vendas com forma_pagamento = 'FIADO' ............... 0
--   vendas_pagamentos com forma_pagamento = 'FIADO' .... 0
--   → nenhuma linha afetada; constraints entram VALIDADAS.
--
-- DECISÃO: MANTER as constraints `*_nao_fiado`
-- -------------------------------------------
-- Poderia consolidar tudo em uma constraint só, mas as `nao_fiado` ficam como
-- defesa em profundidade: se algum dia alguém reintroduzir 'FIADO' na lista-enum
-- por engano, o bloqueio permanece. Elas também comparam com upper(), cobrindo
-- variações de caixa que a lista literal não cobre.
--
-- Delta de comportamento: ZERO. 'FIADO' já era rejeitado antes e continua sendo.
-- Esta migration apenas remove a contradição interna do schema.
--
-- ROLLBACK
-- --------
--   ALTER TABLE public.vendas DROP CONSTRAINT vendas_forma_pagamento_check;
--   ALTER TABLE public.vendas ADD CONSTRAINT vendas_forma_pagamento_check
--     CHECK (forma_pagamento = ANY (ARRAY['DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO','FIADO']));
--   ALTER TABLE public.vendas_pagamentos DROP CONSTRAINT vendas_pagamentos_forma_pagamento_check;
--   ALTER TABLE public.vendas_pagamentos ADD CONSTRAINT vendas_pagamentos_forma_pagamento_check
--     CHECK (forma_pagamento = ANY (ARRAY['DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO','FIADO']));

BEGIN;

ALTER TABLE public.vendas DROP CONSTRAINT vendas_forma_pagamento_check;
ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_forma_pagamento_check
  CHECK (forma_pagamento = ANY (ARRAY['DINHEIRO'::text, 'PIX'::text, 'CARTAO_DEBITO'::text, 'CARTAO_CREDITO'::text]));

ALTER TABLE public.vendas_pagamentos DROP CONSTRAINT vendas_pagamentos_forma_pagamento_check;
ALTER TABLE public.vendas_pagamentos
  ADD CONSTRAINT vendas_pagamentos_forma_pagamento_check
  CHECK (forma_pagamento = ANY (ARRAY['DINHEIRO'::text, 'PIX'::text, 'CARTAO_DEBITO'::text, 'CARTAO_CREDITO'::text]));

COMMIT;
