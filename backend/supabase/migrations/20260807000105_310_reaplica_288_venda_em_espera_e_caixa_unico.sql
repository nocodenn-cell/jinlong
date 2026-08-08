-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260807000105
-- name: 310_reaplica_288_venda_em_espera_e_caixa_unico
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

DO $guarda_caixas_310$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(d.operador_id::text, ', ')
  INTO v_dups
  FROM (
    SELECT operador_id
    FROM public.caixas
    WHERE status = 'ABERTO'
    GROUP BY operador_id
    HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      'MIGRATION_310_CAIXAS_ABERTOS_DUPLICADOS: %. Feche ou reconcilie os turnos antigos antes de aplicar esta migration.',
      v_dups;
  END IF;
END;
$guarda_caixas_310$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_caixas_operador_aberto
  ON public.caixas (operador_id)
  WHERE status = 'ABERTO';

COMMENT ON INDEX public.uq_caixas_operador_aberto IS
  'Um único caixa ABERTO por operador. Sem isso o INSERT de abertura (check-then-insert na aplicação) permite dois turnos simultâneos e o mais antigo fica órfão, já que status e fechamento só enxergam o mais recente (ORDER BY data_abertura DESC LIMIT 1).';

CREATE OR REPLACE FUNCTION public.retomar_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id AND status = 'EM_ESPERA'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendas_em_espera
  SET atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'numero_local', v_row.numero_local,
    'rotulo', v_row.rotulo,
    'itens', v_row.itens,
    'totais', v_row.totais,
    'cliente_id', v_row.cliente_id,
    'desconto_gerente_percentual', v_row.desconto_gerente_percentual,
    'desconto_gerente_token', v_row.desconto_gerente_token
  );
END;
$$;

COMMENT ON FUNCTION public.retomar_venda_em_espera(uuid) IS
  'Retoma um pedido em espera SEM consumi-lo (migration 288, reaplicada pela 310). O pedido continua EM_ESPERA até converter_venda_em_espera ou descartar_venda_em_espera, para que desistir da retomada não apague o cupom.';

CREATE OR REPLACE FUNCTION public.converter_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'CONVERTIDA' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'CONVERTIDA', atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
END;
$$;

COMMENT ON FUNCTION public.converter_venda_em_espera(uuid) IS
  'Marca o pedido em espera como CONVERTIDA após a venda ser finalizada de fato (migration 288, reaplicada pela 310). Idempotente para tolerar reenvio do PDV.';

REVOKE ALL ON FUNCTION public.converter_venda_em_espera(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.converter_venda_em_espera(uuid) TO authenticated;

DO $verify_310$
DECLARE
  v_idx      int;
  v_conv     int;
  v_retoma   text;
BEGIN
  SELECT count(*) INTO v_idx FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'uq_caixas_operador_aberto';
  IF v_idx <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_310: uq_caixas_operador_aberto não criado';
  END IF;

  IF to_regprocedure('public.converter_venda_em_espera(uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_310: converter_venda_em_espera(uuid) não criada';
  END IF;

  SELECT count(*) INTO v_conv
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'converter_venda_em_espera';
  IF v_conv <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_310: esperada 1 assinatura de converter_venda_em_espera, encontradas %', v_conv;
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.converter_venda_em_espera(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_310: authenticated sem EXECUTE em converter_venda_em_espera';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_retoma
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'retomar_venda_em_espera';
  IF v_retoma ILIKE '%RETOMADA%' THEN
    RAISE EXCEPTION 'MIGRATION_310: retomar_venda_em_espera ainda consome o pedido (status RETOMADA)';
  END IF;
END;
$verify_310$;

NOTIFY pgrst, 'reload schema';