-- 220 — Fixa search_path nos overloads de finalizar_venda_transacional_canonica_v2 sem config.
--
-- Advisor function_search_path_mutable: 2 dos 3 overloads (SECURITY DEFINER) estão sem search_path
-- fixo → vetor de sequestro de search_path. A canônica corrente é a v3 (089), MAS a v2 AINDA é
-- chamada em runtime pela Edge Function sync-outbox (USE_UNIFIED_SALES_FLOW), então NÃO é removida.
-- Apenas fixamos search_path nos overloads que faltam — sem alterar comportamento.
--
-- NOTA: consolidar os 3 overloads da v2 (há duplicação) fica para uma rodada posterior, após
-- confirmar qual assinatura o sync-outbox resolve com os parâmetros nomeados.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'finalizar_venda_transacional_canonica_v2'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog', r.sig);
  END LOOP;
END $$;
