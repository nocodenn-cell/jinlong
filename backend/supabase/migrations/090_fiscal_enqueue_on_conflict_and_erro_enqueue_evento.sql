-- Alinha ON CONFLICT de fiscal_enfileirar_documento_venda com o índice único parcial (037):
--   idx_doc_fiscal_unique_venda_tipo ON (venda_id, tipo_doc) WHERE status <> 'CANCELADO'
-- Evita erro em runtime por predicado incompatível com deleted_at.

ALTER TABLE public.documentos_fiscais_eventos
  DROP CONSTRAINT IF EXISTS documentos_fiscais_eventos_tipo_check;

ALTER TABLE public.documentos_fiscais_eventos
  ADD CONSTRAINT documentos_fiscais_eventos_tipo_check
  CHECK (
    evento_tipo IN (
      'ENFILEIRADO',
      'REENFILEIRADO',
      'CLAIM',
      'ERRO',
      'ERRO_ENQUEUE',
      'EMITIDO',
      'REPROCESSO_MANUAL',
      'CANCELADO'
    )
  );

CREATE OR REPLACE FUNCTION public.fiscal_registrar_evento_enqueue_erro(
  p_venda_id uuid,
  p_tipo_doc text,
  p_erro_mensagem text,
  p_detalhe jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id uuid;
  v_status text;
  v_tipo text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
BEGIN
  IF p_venda_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_ERRO_EVENTO_AUTH';
  END IF;

  SELECT d.id, d.status
  INTO v_doc_id, v_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
    AND d.status <> 'CANCELADO'
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RETURN;
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
  )
  VALUES (
    v_doc_id,
    'ERRO_ENQUEUE',
    v_status,
    v_status,
    auth.uid(),
    current_setting('request.jwt.claim.role', true),
    'caixa_web_enqueue',
    jsonb_build_object(
      'erro', LEFT(COALESCE(p_erro_mensagem, ''), 2000)
    ) || COALESCE(p_detalhe, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id uuid,
  p_tipo_doc text DEFAULT 'NFC_E_STUB',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_profiles TEXT[] := ARRAY['GERENTE', 'DONO', 'ADMIN'];
  v_uid uuid := auth.uid();
  v_tipo text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id uuid;
  v_prev_status text;
  v_new_status text;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_OBRIGATORIA';
  END IF;

  IF v_tipo NOT IN ('NFC_E_STUB', 'NFCE', 'NFE') THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_TIPO_DOC_INVALIDO';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_AUTH';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = p_venda_id
        AND (
          v.operador_id = v_uid
          OR EXISTS (
            SELECT 1
            FROM public.usuarios u
            WHERE u.id = v_uid
              AND u.perfil = ANY(v_admin_profiles)
          )
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

  SELECT d.status
  INTO v_prev_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
  ORDER BY d.created_at DESC
  LIMIT 1;

  INSERT INTO public.documentos_fiscais_pendentes (
    venda_id,
    tipo_doc,
    status,
    payload
  )
  VALUES (
    p_venda_id,
    v_tipo,
    'PENDENTE',
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (venda_id, tipo_doc) WHERE status <> 'CANCELADO'
  DO UPDATE SET
    payload = COALESCE(EXCLUDED.payload, public.documentos_fiscais_pendentes.payload),
    status = CASE
      WHEN public.documentos_fiscais_pendentes.status IN ('ERRO', 'CANCELADO') THEN 'PENDENTE'
      ELSE public.documentos_fiscais_pendentes.status
    END,
    proxima_tentativa_em = CASE
      WHEN public.documentos_fiscais_pendentes.status IN ('ERRO', 'CANCELADO') THEN now()
      ELSE public.documentos_fiscais_pendentes.proxima_tentativa_em
    END,
    updated_at = now();

  SELECT d.id, d.status
  INTO v_documento_id, v_new_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
    AND d.status <> 'CANCELADO'
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
  END IF;

  IF v_prev_status IN ('ERRO', 'CANCELADO') AND v_new_status = 'PENDENTE' THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id,
      evento_tipo,
      status_antes,
      status_depois,
      actor_user_id,
      actor_role,
      origem_acao,
      payload
    )
    VALUES (
      v_documento_id,
      'REENFILEIRADO',
      v_prev_status,
      v_new_status,
      v_uid,
      current_setting('request.jwt.claim.role', true),
      'RPC_FISCAL_ENFILEIRAR_DOCUMENTO_VENDA',
      jsonb_build_object('venda_id', p_venda_id, 'tipo_doc', v_tipo)
    );
  END IF;

  RETURN v_documento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) TO service_role;
