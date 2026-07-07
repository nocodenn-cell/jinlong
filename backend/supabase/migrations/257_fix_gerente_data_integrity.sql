-- ============================================================
-- Migration 257: hardening de integridade gerente (recovery bb9e)
-- Port curado de 4bf46bd5 — seções 2 e 5b apenas.
-- Sem alterações em OC, vendas v3, auth ou RLS.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Contas a pagar: lock pessimista e teto de saldo antes do INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_pagamento_contas_pagar(
  p_conta_id   uuid,
  p_valor      numeric,
  p_forma      text,
  p_data       timestamptz DEFAULT now(),
  p_observacao text        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_conta        record;
  v_novo_pago    numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PAGAMENTO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'PAGAMENTO_PERFIL';
  END IF;

  SELECT id, loja_id, valor_total, valor_pago, status
    INTO v_conta
    FROM public.contas_pagar
   WHERE id = p_conta_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_conta.loja_id THEN
    RAISE EXCEPTION 'PAGAMENTO_LOJA';
  END IF;

  IF v_conta.status IN ('PAGO','CANCELADO') THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_ENCERRADA';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'PAGAMENTO_VALOR_INVALIDO';
  END IF;

  IF p_forma IS NULL OR p_forma NOT IN ('DINHEIRO','PIX','CARTAO','BOLETO','TRANSF') THEN
    RAISE EXCEPTION 'PAGAMENTO_FORMA_INVALIDA';
  END IF;

  v_novo_pago := v_conta.valor_pago + p_valor;

  IF v_novo_pago > v_conta.valor_total THEN
    RAISE EXCEPTION 'PAGAMENTO_VALOR_EXCEDE_SALDO';
  END IF;

  INSERT INTO public.contas_pagar_pagamentos (
    conta_id, valor, forma_pagamento, data_pagamento, observacao, usuario_id
  ) VALUES (
    p_conta_id, p_valor, p_forma, COALESCE(p_data, now()), p_observacao, v_uid
  );

  UPDATE public.contas_pagar
     SET valor_pago = v_novo_pago,
         status = CASE
                    WHEN v_novo_pago >= valor_total THEN 'PAGO'
                    ELSE 'PARCIAL'
                  END
   WHERE id = p_conta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Fiscal enqueue: escopo de loja via caixas + bloqueio SEM_NF (mantém p_loja_id da 114)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id  uuid,
  p_tipo_doc  text    DEFAULT 'NFC_E_STUB',
  p_payload   jsonb   DEFAULT '{}'::jsonb,
  p_loja_id   uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_profiles text[] := ARRAY['GERENTE', 'DONO', 'ADMIN'];
  v_uid            uuid := auth.uid();
  v_tipo           text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id   uuid;
  v_loja_venda     uuid;
  v_tipo_venda     text;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_OBRIGATORIA';
  END IF;

  IF v_tipo NOT IN ('NFC_E_STUB', 'NFCE', 'NFE') THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_TIPO_DOC_INVALIDO';
  END IF;

  IF p_loja_id IS NOT NULL THEN
    SELECT cx.loja_id INTO v_loja_venda
    FROM   public.vendas v
    INNER  JOIN public.caixas cx ON cx.id = v.caixa_id
    WHERE  v.id = p_venda_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_NAO_ENCONTRADA';
    END IF;

    IF v_loja_venda IS DISTINCT FROM p_loja_id THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_LOJA_DIVERGENTE';
    END IF;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_AUTH';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM   public.vendas v
      INNER  JOIN public.caixas c ON c.id = v.caixa_id
      WHERE  v.id = p_venda_id
        AND  (
               v.operador_id = v_uid
               OR EXISTS (
                 SELECT 1
                 FROM   public.usuarios u
                 WHERE  u.id = v_uid
                   AND  u.perfil = ANY(v_admin_profiles)
                   AND  (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = c.loja_id)
               )
             )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

  SELECT v.tipo_venda INTO v_tipo_venda
  FROM   public.vendas v
  WHERE  v.id = p_venda_id
  LIMIT  1;

  IF v_tipo_venda IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_NAO_ENCONTRADA';
  END IF;

  IF v_tipo_venda = 'SEM_NF' THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_SEM_NF';
  END IF;

  INSERT INTO public.documentos_fiscais_pendentes (
    venda_id, tipo_doc, status, payload
  )
  VALUES (
    p_venda_id, v_tipo, 'PENDENTE', COALESCE(p_payload, '{}'::jsonb)
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

  SELECT d.id INTO v_documento_id
  FROM   public.documentos_fiscais_pendentes d
  WHERE  d.venda_id = p_venda_id
    AND  d.tipo_doc = v_tipo
    AND  d.deleted_at IS NULL
  ORDER  BY d.created_at DESC
  LIMIT  1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
  END IF;

  RETURN v_documento_id;
END;
$$;

COMMENT ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) IS
  'Enfileira documento fiscal. p_loja_id valida loja (service_role). '
  'Gerente autenticado exige mesma loja do caixa. Bloqueia vendas SEM_NF. '
  'V3 — recovery bb9e sobre base da migration 114.';

REVOKE ALL ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) TO service_role;
