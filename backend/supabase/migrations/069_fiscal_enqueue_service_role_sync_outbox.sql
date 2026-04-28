-- Enfileiramento fiscal invocado pela Edge sync-outbox (JWT service_role): sem auth.uid().
-- Mantém checagem de operador/gerente para sessões authenticated.

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
  v_uid uuid := auth.uid();
  v_tipo text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id uuid;
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
              AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
          )
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

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
  ON CONFLICT (venda_id, tipo_doc) WHERE deleted_at IS NULL
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

  SELECT d.id
  INTO v_documento_id
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
  END IF;

  RETURN v_documento_id;
END;
$$;
