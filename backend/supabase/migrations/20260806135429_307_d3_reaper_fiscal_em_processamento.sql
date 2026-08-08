-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806135429
-- name: 307_d3_reaper_fiscal_em_processamento
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

BEGIN;

CREATE OR REPLACE FUNCTION public.fiscal_reaper_documentos(
  p_timeout_minutos integer DEFAULT 15,
  p_max_tentativas integer DEFAULT 5
)
RETURNS TABLE (reenfileirados integer, enviados_dlq integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timeout integer := GREATEST(1, LEAST(COALESCE(p_timeout_minutos, 15), 1440));
  v_max integer := GREATEST(1, LEAST(COALESCE(p_max_tentativas, 5), 20));
  v_reenfileirados integer := 0;
  v_dlq integer := 0;
  r record;
  v_tentativas integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_REAPER_FORBIDDEN';
  END IF;

  FOR r IN
    SELECT d.id, d.venda_id, d.tipo_doc, d.payload, d.status, d.tentativas,
           COALESCE(d.ultima_tentativa_em, d.updated_at, d.created_at) AS parado_desde
    FROM public.documentos_fiscais_pendentes d
    WHERE d.status = 'EM_PROCESSAMENTO'
      AND COALESCE(d.ultima_tentativa_em, d.updated_at, d.created_at)
          < now() - make_interval(mins => v_timeout)
    ORDER BY d.created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    v_tentativas := r.tentativas + 1;

    IF v_tentativas >= v_max THEN
      INSERT INTO public.documentos_fiscais_dlq (
        documento_id, venda_id, tipo_doc, payload, motivo,
        original_status, original_tentativas
      )
      SELECT r.id, r.venda_id, r.tipo_doc, r.payload,
             format('FISCAL_REAPER_ORFAO_MAX_TENTATIVAS: parado em EM_PROCESSAMENTO desde %s, %s tentativas (teto %s)',
                    r.parado_desde, v_tentativas, v_max),
             r.status, v_tentativas
      WHERE NOT EXISTS (
        SELECT 1 FROM public.documentos_fiscais_dlq dq WHERE dq.documento_id = r.id
      );

      UPDATE public.documentos_fiscais_pendentes
      SET status = 'ERRO',
          tentativas = v_tentativas,
          ultimo_erro = 'FISCAL_REAPER_ORFAO_MAX_TENTATIVAS',
          fiscal_error_code = 'FISCAL_REAPER_ORFAO_MAX_TENTATIVAS',
          fiscal_error_category = 'DESCONHECIDO',
          fiscal_action_hint = 'Documento preso em processamento e sem tentativas restantes. Revisar manualmente e reprocessar pelo painel.',
          fiscal_retryable = false,
          fiscal_next_step_url = '/gerente/financeiro?tab=fiscal',
          proxima_tentativa_em = NULL,
          updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.documentos_fiscais_eventos (
        documento_id, evento_tipo, status_antes, status_depois,
        actor_user_id, actor_role, origem_acao, payload
      ) VALUES (
        r.id, 'ERRO', r.status, 'ERRO',
        NULL, 'service_role', 'RPC_FISCAL_REAPER_DLQ',
        jsonb_build_object(
          'motivo', 'MAX_TENTATIVAS',
          'parado_desde', r.parado_desde,
          'timeout_minutos', v_timeout,
          'tentativas', v_tentativas,
          'max_tentativas', v_max
        )
      );

      v_dlq := v_dlq + 1;
    ELSE
      UPDATE public.documentos_fiscais_pendentes
      SET status = 'PENDENTE',
          tentativas = v_tentativas,
          ultimo_erro = 'FISCAL_REAPER_ORFAO_REENFILEIRADO',
          proxima_tentativa_em = now() + make_interval(
            secs => LEAST(3600, 60 * CAST(power(2::numeric, LEAST(v_tentativas, 6)) AS integer))
          ),
          updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.documentos_fiscais_eventos (
        documento_id, evento_tipo, status_antes, status_depois,
        actor_user_id, actor_role, origem_acao, payload
      ) VALUES (
        r.id, 'REENFILEIRADO', r.status, 'PENDENTE',
        NULL, 'service_role', 'RPC_FISCAL_REAPER_ORFAOS',
        jsonb_build_object(
          'parado_desde', r.parado_desde,
          'timeout_minutos', v_timeout,
          'tentativas', v_tentativas,
          'max_tentativas', v_max
        )
      );

      v_reenfileirados := v_reenfileirados + 1;
    END IF;
  END LOOP;

  reenfileirados := v_reenfileirados;
  enviados_dlq := v_dlq;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fiscal_reaper_documentos(integer, integer) IS
  'D-3 (2026-08-06). Resgata documentos presos em EM_PROCESSAMENTO apos morte do worker: reenfileira com backoff ou, atingido o teto de tentativas, registra na DLQ e para em ERRO nao-retryable. Apenas service_role/postgres.';

REVOKE ALL ON FUNCTION public.fiscal_reaper_documentos(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_reaper_documentos(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fiscal_claim_documentos(p_limit integer DEFAULT 20)
RETURNS SETOF public.documentos_fiscais_pendentes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CLAIM_FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.documentos_fiscais_pendentes d
    SET
      status = 'EM_PROCESSAMENTO',
      ultima_tentativa_em = now(),
      updated_at = now()
    WHERE d.id IN (
      SELECT q.id
      FROM public.documentos_fiscais_pendentes q
      WHERE q.status IN ('PENDENTE', 'ERRO')
        AND (
          q.proxima_tentativa_em IS NULL OR q.proxima_tentativa_em <= now()
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.documentos_fiscais_dlq dq WHERE dq.documento_id = q.id
        )
      ORDER BY q.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT v_limit
    )
    RETURNING d.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_claim_documentos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fiscal_reprocessar_documento(p_documento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_status text;
  v_prev_ultimo text;
  v_prev_fiscal_code text;
  v_prev_fiscal_cat text;
  v_estava_na_dlq boolean := false;
BEGIN
  IF current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_AUTH';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = v_uid
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    ) THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_PERFIL';
    END IF;
  END IF;

  SELECT d.status, d.ultimo_erro, d.fiscal_error_code, d.fiscal_error_category
  INTO v_old_status, v_prev_ultimo, v_prev_fiscal_code, v_prev_fiscal_cat
  FROM public.documentos_fiscais_pendentes d
  WHERE d.id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  DELETE FROM public.documentos_fiscais_dlq WHERE documento_id = p_documento_id;
  v_estava_na_dlq := FOUND;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'PENDENTE',
    tentativas = CASE WHEN v_estava_na_dlq THEN 0 ELSE tentativas END,
    proxima_tentativa_em = now(),
    ultimo_erro = NULL,
    fiscal_error_code = NULL,
    fiscal_error_category = NULL,
    fiscal_action_hint = NULL,
    fiscal_retryable = NULL,
    fiscal_next_step_url = NULL,
    fiscal_error_payload = NULL,
    updated_at = now()
  WHERE id = p_documento_id
    AND status IN ('ERRO', 'PENDENTE');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_REPROCESSO_STATUS_INVALIDO';
  END IF;

  INSERT INTO public.documentos_fiscais_eventos (
    documento_id,
    evento_tipo,
    status_antes,
    status_depois,
    actor_user_id,
    actor_role,
    origem_acao,
    payload
  ) VALUES (
    p_documento_id,
    'REPROCESSO_MANUAL',
    v_old_status,
    'PENDENTE',
    v_uid,
    current_setting('request.jwt.claim.role', true),
    'RPC_FISCAL_REPROCESSAR_DOCUMENTO',
    jsonb_build_object(
      'ultimo_erro_prev', v_prev_ultimo,
      'fiscal_error_code_prev', v_prev_fiscal_code,
      'fiscal_error_category_prev', v_prev_fiscal_cat,
      'resgatado_da_dlq', v_estava_na_dlq
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_reprocessar_documento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated, service_role;

DO $verify$
DECLARE
  v_venda_id uuid;
  v_doc_id uuid;
  v_res record;
  v_status text;
  v_tentativas integer;
  v_claim_pegou boolean;
BEGIN
  IF NOT has_function_privilege('service_role', 'public.fiscal_reaper_documentos(integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG307_REAPER_SEM_GRANT_SERVICE_ROLE';
  END IF;
  IF has_function_privilege('authenticated', 'public.fiscal_reaper_documentos(integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG307_REAPER_EXPOSTO_A_AUTHENTICATED';
  END IF;

  SELECT v.id INTO v_venda_id
  FROM public.vendas v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.documentos_fiscais_pendentes d WHERE d.venda_id = v.id
  )
  LIMIT 1;

  IF v_venda_id IS NULL THEN
    RAISE NOTICE '307 - sem vendas livres para prova viva; verificacao estrutural OK';
    RETURN;
  END IF;

  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (v_venda_id, 'NFE', 'PENDENTE', '{"probe":"mig307"}'::jsonb)
  RETURNING id INTO v_doc_id;

  UPDATE public.documentos_fiscais_pendentes
  SET status = 'EM_PROCESSAMENTO', tentativas = 4, ultima_tentativa_em = now() - interval '60 minutes'
  WHERE id = v_doc_id;

  SELECT * INTO v_res FROM public.fiscal_reaper_documentos(15, 5);

  IF v_res.enviados_dlq < 1 THEN
    RAISE EXCEPTION 'MIG307_REAPER_NAO_MOVEU_PARA_DLQ (reenfileirados=%, dlq=%)', v_res.reenfileirados, v_res.enviados_dlq;
  END IF;

  SELECT status INTO v_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
  IF v_status <> 'ERRO' THEN
    RAISE EXCEPTION 'MIG307_STATUS_POS_DLQ_INESPERADO: %', v_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id) THEN
    RAISE EXCEPTION 'MIG307_LINHA_DLQ_AUSENTE';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_claim_documentos(100) c WHERE c.id = v_doc_id
  ) INTO v_claim_pegou;

  IF v_claim_pegou THEN
    RAISE EXCEPTION 'MIG307_CLAIM_RESSUSCITOU_DOCUMENTO_DA_DLQ';
  END IF;

  PERFORM public.fiscal_reprocessar_documento(v_doc_id);

  SELECT status, tentativas INTO v_status, v_tentativas
  FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;

  IF v_status <> 'PENDENTE' OR v_tentativas <> 0 THEN
    RAISE EXCEPTION 'MIG307_RESGATE_MANUAL_FALHOU: status=% tentativas=%', v_status, v_tentativas;
  END IF;

  IF EXISTS (SELECT 1 FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id) THEN
    RAISE EXCEPTION 'MIG307_LINHA_DLQ_NAO_LIMPA';
  END IF;

  DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
  DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;

  RAISE NOTICE '307 OK - D-3 fechado';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;