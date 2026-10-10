-- Corpo histórico de fiscal_cancelar_documento, anterior ao isolamento por loja.
-- NÃO é migration. Não aplicar em produção, staging ou restore.
-- O teste de autorização usa este texto só para provar o bypass que existia
-- antes de 20261009220000. O arquivo 20261007161220 no repositório já não
-- instala este corpo.

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
