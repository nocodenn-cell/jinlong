-- Referência de ROLLBACK — 20260808130200_24704_reapply_venda_finance_context_idempotent.sql
--
-- NÃO É UMA MIGRATION. Arquivo fora de supabase/migrations/ por design: um .sql com prefixo
-- numérico dentro da pasta reivindicaria versão no Supabase CLI e quebraria db reset
-- (ver scripts/migration-sequence-guard.mjs, nota de 2026-07-03).
--
-- Uso: só se o apply de 20260808130200 precisar ser revertido em janela controlada.
-- Executar manualmente, com revisão humana. Nunca automatizar.
--
-- CONTEXTO: a migration é ADITIVA — cria um espelho passivo (venda_finance_context) e os
-- gatilhos que o mantêm. Não altera vendas, caixa, contas_receber nem qualquer RPC do núcleo
-- transacional. Reverter remove o espelho e volta ao estado atual de produção (objetos ausentes),
-- sem perda de dado operacional: o espelho é derivável por backfill a qualquer momento.
--
-- ORDEM: triggers → funções de trigger → função de sync → policy → tabela (índices caem junto).

BEGIN;

-- 1) Triggers
DROP TRIGGER IF EXISTS trg_finance_context_pagamento ON public.vendas_pagamentos;
DROP TRIGGER IF EXISTS trg_finance_context_conta ON public.contas_receber;

-- 2) Funções de trigger
DROP FUNCTION IF EXISTS public.trg_finance_context_via_pagamento();
DROP FUNCTION IF EXISTS public.trg_finance_context_via_conta();

-- 3) Função de sincronização
DROP FUNCTION IF EXISTS public.sincronizar_finance_context_venda(uuid);

-- 4) Policy (redundante com o DROP TABLE, explícito para leitura)
DROP POLICY IF EXISTS "venda_finance_context_select_loja" ON public.venda_finance_context;

-- 5) Tabela + índices (idx_venda_finance_context_{loja,status,conta} caem em cascata)
DROP TABLE IF EXISTS public.venda_finance_context;

COMMIT;

-- VERIFICAÇÃO PÓS-ROLLBACK (deve retornar 0 linhas em todas):
--
-- SELECT to_regclass('public.venda_finance_context') IS NOT NULL AS tabela_existe;
-- SELECT proname FROM pg_proc
--  WHERE proname IN ('sincronizar_finance_context_venda',
--                    'trg_finance_context_via_pagamento',
--                    'trg_finance_context_via_conta');
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_finance_context%';
--
-- NÃO mexer em supabase_migrations.schema_migrations. A linha de 20260808130200 deve
-- permanecer registrada como applied mesmo após rollback dos objetos — o ledger registra o
-- que foi executado, não o estado atual do catálogo. Reverter a linha reintroduziria
-- exatamente o drift tracking × catálogo que esta trilha existe para fechar
-- (ver docs/FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md §2.2).
