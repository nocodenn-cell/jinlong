-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260807000525
-- name: 313_pdv_config_caixa_web_limite_desconto_manual
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

DROP FUNCTION IF EXISTS public.pdv_config_para_caixa_web();

CREATE OR REPLACE FUNCTION public.pdv_config_para_caixa_web()
RETURNS TABLE (
  quantidade_minima_atacado_padrao numeric,
  blind_closure boolean,
  max_desconto_manual_item_percentual numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.quantidade_minima_atacado_padrao,
    p.blind_closure,
    COALESCE(p.max_desconto_manual_item_percentual, 15.00)
  FROM public.pdv_config p
  WHERE p.id = 1
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pdv_config_para_caixa_web() IS
  'Campos não sensíveis do PDV para o caixa web (sem gerente_senha_sha256 / gerente_id). Inclui max_desconto_manual_item_percentual para que o cliente leia o teto de desconto manual em vez de reimplementá-lo — a autoridade continua sendo o trigger trg_fn_itens_venda_limite_desconto.';

REVOKE ALL ON FUNCTION public.pdv_config_para_caixa_web() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_config_para_caixa_web() FROM anon;
GRANT EXECUTE ON FUNCTION public.pdv_config_para_caixa_web() TO authenticated;

DO $verify_313$
DECLARE
  v_ret text;
  v_val numeric;
BEGIN
  SELECT pg_get_function_result(p.oid) INTO v_ret
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pdv_config_para_caixa_web';

  IF v_ret NOT ILIKE '%max_desconto_manual_item_percentual%' THEN
    RAISE EXCEPTION 'MIGRATION_313: RETURNS TABLE sem max_desconto_manual_item_percentual (%)', v_ret;
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.pdv_config_para_caixa_web()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_313: authenticated perdeu EXECUTE — caixa web quebraria';
  END IF;

  IF has_function_privilege('anon', 'public.pdv_config_para_caixa_web()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_313: anon não pode executar esta RPC';
  END IF;

  SELECT max_desconto_manual_item_percentual INTO v_val FROM public.pdv_config_para_caixa_web();
  IF v_val IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_313: max_desconto_manual_item_percentual saiu NULL';
  END IF;
END;
$verify_313$;

NOTIFY pgrst, 'reload schema';
