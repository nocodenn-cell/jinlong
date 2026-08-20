\set ON_ERROR_STOP on

\ir venda-finance-context-retirement-smoke-stubs.sql

-- Cenário A: objetos já ausentes; deve ser no-op seguro.
\ir ../migrations/20260810222702_retire_obsolete_venda_finance_context.sql

-- Cenário B: 252 criou os objetos; a tombstone deve remover tudo.
\ir ../migrations/20260621005000_252_venda_finance_context_mirror.sql
\ir ../migrations/20260810222702_retire_obsolete_venda_finance_context.sql

-- Cenário C: repetição defensiva.
\ir ../migrations/20260810222702_retire_obsolete_venda_finance_context.sql

DO $$
BEGIN
  IF to_regclass('public.venda_finance_context') IS NOT NULL THEN
    RAISE EXCEPTION 'RETIREMENT_FAILED: table remains';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'sincronizar_finance_context_venda',
        'trg_finance_context_via_pagamento',
        'trg_finance_context_via_conta'
      )
  ) THEN
    RAISE EXCEPTION 'RETIREMENT_FAILED: function remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN ('trg_finance_context_pagamento', 'trg_finance_context_conta')
  ) THEN
    RAISE EXCEPTION 'RETIREMENT_FAILED: trigger remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venda_finance_context'
  ) THEN
    RAISE EXCEPTION 'RETIREMENT_FAILED: policy remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname LIKE 'idx_venda_finance_context_%'
  ) THEN
    RAISE EXCEPTION 'RETIREMENT_FAILED: index remains';
  END IF;
END
$$;

SELECT 'PASS: absent -> present -> retired -> repeated' AS retirement_smoke;
