SELECT json_build_object(
  'table_venda_finance_context', to_regclass('public.venda_finance_context') IS NOT NULL,
  'fn_sincronizar', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sincronizar_finance_context_venda'
  ),
  'fn_trg_pagamento', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_finance_context_via_pagamento'
  ),
  'fn_trg_conta', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_finance_context_via_conta'
  ),
  'trg_pagamento', EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgname = 'trg_finance_context_pagamento'
  ),
  'trg_conta', EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgname = 'trg_finance_context_conta'
  ),
  'policy_select', EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venda_finance_context'
      AND policyname = 'venda_finance_context_select_loja'
  ),
  'idx_loja', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_venda_finance_context_loja'
  ),
  'idx_status', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_venda_finance_context_status'
  ),
  'idx_conta', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_venda_finance_context_conta'
  )
) AS catalog;
