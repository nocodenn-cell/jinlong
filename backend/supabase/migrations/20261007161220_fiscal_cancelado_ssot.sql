-- Sprint GO CONDICIONAL P0 — cancelamento fiscal como estado canônico.
--
-- 1) fiscal_marcar_cancelado: worker/reconciliação quando Focus status=cancelado
-- 2) fiscal_marcar_emitido: fail-closed se documento já CANCELADO (nunca cancelado→emitido)
-- 3) fiscal_cancelar_documento: comando explícito (gerente+), ciclo de vida do DOC
--    independente de cancelar_venda_transacional
-- 4) REVOKE INSERT authenticated em documentos_fiscais_pendentes (só RPC enqueue)
--
-- Não altera cancelar_venda_transacional.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Marcar cancelado (service_role / worker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_marcar_cancelado(
  p_documento_id uuid,
  p_motivo text DEFAULT NULL,
  p_provider_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_updated integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CANCELADO_FORBIDDEN';
  END IF;

  SELECT status INTO v_status
  FROM public.documentos_fiscais_pendentes
  WHERE id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  IF v_status = 'CANCELADO' THEN
    RETURN; -- idempotente
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'CANCELADO',
    ultimo_erro = NULLIF(trim(COALESCE(p_motivo, 'FOCUS_CANCELADO')), ''),
    fiscal_error_code = 'FOCUS_CANCELADO',
    fiscal_error_category = 'CANCELAMENTO',
    fiscal_action_hint = 'Documento cancelado no provedor ou por comando fiscal explícito.',
    fiscal_retryable = false,
    fiscal_next_step_url = '/admin/financeiro?tab=fiscal',
    fiscal_error_payload = COALESCE(p_provider_payload, fiscal_error_payload),
    proxima_tentativa_em = NULL,
    updated_at = now()
  WHERE id = p_documento_id
    AND status IS DISTINCT FROM 'CANCELADO';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'FISCAL_CANCELADO_NAO_APLICADO';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fiscal_marcar_cancelado(uuid, text, jsonb) IS
  'SSoT: persiste CANCELADO a partir de FocusRemoteState.cancelado ou comando explícito (service_role). Terminal — não reabre para emissão.';

REVOKE ALL ON FUNCTION public.fiscal_marcar_cancelado(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_cancelado(uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Harden fiscal_marcar_emitido — nunca CANCELADO → EMITIDO
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_marcar_emitido(
  p_documento_id uuid,
  p_chave_fiscal text,
  p_protocolo text,
  p_provider_ref text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_updated integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_EMITIDO_FORBIDDEN';
  END IF;

  SELECT status INTO v_status
  FROM public.documentos_fiscais_pendentes
  WHERE id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  IF v_status = 'CANCELADO' THEN
    RAISE EXCEPTION 'FISCAL_EMITIDO_APOS_CANCELADO'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status = 'EMITIDO' THEN
    RETURN; -- idempotente
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'EMITIDO',
    chave_fiscal = p_chave_fiscal,
    protocolo = p_protocolo,
    provider_ref = p_provider_ref,
    payload = COALESCE(p_payload, payload),
    ultimo_erro = NULL,
    fiscal_error_code = NULL,
    fiscal_error_category = NULL,
    fiscal_action_hint = NULL,
    fiscal_retryable = NULL,
    fiscal_next_step_url = NULL,
    fiscal_error_payload = NULL,
    proxima_tentativa_em = NULL,
    processado_em = now(),
    updated_at = now()
  WHERE id = p_documento_id
    AND status IS DISTINCT FROM 'CANCELADO';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'FISCAL_EMITIDO_APOS_CANCELADO'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_emitido(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_emitido(uuid, text, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Comando explícito de cancelamento fiscal (não acopla a cancelar_venda)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_cancelar_documento(
  p_documento_id uuid,
  p_justificativa text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_just text := trim(COALESCE(p_justificativa, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_just) < 15 THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_JUSTIFICATIVA_CURTA'
      USING HINT = 'Justificativa mínima de 15 caracteres (espelha regra Focus/SEFAZ).';
  END IF;

  SELECT status INTO v_status
  FROM public.documentos_fiscais_pendentes
  WHERE id = p_documento_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  IF v_status = 'CANCELADO' THEN
    RETURN;
  END IF;

  IF v_status NOT IN ('EMITIDO', 'EM_PROCESSAMENTO', 'ERRO', 'PENDENTE') THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_STATUS_INVALIDO:%', v_status;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'CANCELADO',
    ultimo_erro = v_just,
    fiscal_error_code = 'CANCELAMENTO_EXPLICITO',
    fiscal_error_category = 'CANCELAMENTO',
    fiscal_action_hint = 'Cancelamento fiscal explícito (independente do ciclo da venda).',
    fiscal_retryable = false,
    fiscal_next_step_url = '/admin/financeiro?tab=fiscal',
    fiscal_error_payload = jsonb_build_object(
      'origem', 'fiscal_cancelar_documento',
      'ator_id', v_uid,
      'justificativa', v_just,
      'status_anterior', v_status
    ),
    proxima_tentativa_em = NULL,
    updated_at = now()
  WHERE id = p_documento_id;
END;
$$;

COMMENT ON FUNCTION public.fiscal_cancelar_documento(uuid, text) IS
  'Comando explícito de cancelamento do documento fiscal. Não acopla a cancelar_venda_transacional.';

REVOKE ALL ON FUNCTION public.fiscal_cancelar_documento(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_cancelar_documento(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Fechar bypass INSERT app (enqueue só via RPC SECURITY DEFINER)
-- ---------------------------------------------------------------------------
REVOKE INSERT ON public.documentos_fiscais_pendentes FROM authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
