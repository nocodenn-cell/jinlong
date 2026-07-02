-- BACKPORT (fase R1, 2026-07-02): conteúdo extraído de
-- supabase_migrations.schema_migrations.statements do projeto de produção
-- (jinlong). Esta migration foi aplicada em produção sem arquivo no repo.

-- 234 — Serializa finalizações concorrentes com o mesmo p_venda_id (idempotência real).
-- Mitiga corrida I1/C2: dois requests paralelos não executam o loop v2 antes do EXISTS CONCLUIDA.

DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v3(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]'::jsonb,
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL
)
RETURNS TABLE (
  venda_id uuid,
  status text,
  mensagem text,
  dados_fiscais jsonb,
  itens_atualizados jsonb,
  estoque_baixado jsonb,
  event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_doc_id uuid;
  v_payload jsonb;
  v_row_doc jsonb;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric;
  v_q_int integer;
  v_preco_original numeric;
  v_preco_unitario numeric;
  v_tipo_preco text;
  v_calc jsonb;
  v_preco_esperado numeric;
  v_tipo_esperado text;
  v_eps constant numeric := 0.02;
  v_event_id uuid;
  c_source constant text := 'web_caixa';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_OBRIGATORIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  IF EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = p_venda_id AND v.status = 'CONCLUIDA') THEN
    SELECT jsonb_build_object('documento_fiscal_id', d.id, 'status', d.status, 'tipo_doc', d.tipo_doc)
    INTO v_row_doc
    FROM public.documentos_fiscais_pendentes d
    WHERE d.venda_id = p_venda_id AND d.status <> 'CANCELADO' AND d.deleted_at IS NULL
    ORDER BY d.created_at DESC LIMIT 1;

    v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);

    RETURN QUERY SELECT p_venda_id, 'CONCLUIDA'::text, NULL::text, v_row_doc, NULL::jsonb, NULL::jsonb, v_event_id;
    RETURN;
  END IF;

  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
    LOOP
      v_produto_id := (v_item->>'produto_id')::uuid;
      v_quantidade := (v_item->>'quantidade')::numeric;
      v_preco_original := (v_item->>'preco_original')::numeric;
      v_preco_unitario := (v_item->>'preco_unitario')::numeric;
      v_tipo_preco := COALESCE(v_item->>'tipo_preco', 'VAREJO');

      IF v_tipo_preco IN ('MANUAL', 'PROMOCAO') THEN
        IF v_preco_unitario IS NOT NULL AND v_preco_original IS NOT NULL
           AND v_preco_unitario > v_preco_original + v_eps THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_ACIMA_REFERENCIA';
        END IF;
        CONTINUE;
      END IF;

      v_q_int := GREATEST(1, FLOOR(COALESCE(v_quantidade, 0)))::integer;
      v_calc := public.calcular_preco_produto(v_produto_id, v_q_int, p_loja_id);

      IF v_calc IS NULL OR v_calc->>'erro' IS NOT NULL OR v_calc->>'preco' IS NULL THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_NAO_VALIDADO:%', v_produto_id;
      END IF;

      v_preco_esperado := (v_calc->>'preco')::numeric;
      v_tipo_esperado := COALESCE(v_calc->>'tipo', 'VAREJO');

      IF v_tipo_esperado IS DISTINCT FROM v_tipo_preco THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TIPO_PRECO_DIVERGENTE:%', v_produto_id;
      END IF;

      IF ABS(v_preco_esperado - v_preco_unitario) > v_eps THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE:%', v_produto_id;
      END IF;
    END LOOP;
  END IF;

  PERFORM public.finalizar_venda_transacional_canonica_v2(
    p_venda_id, p_caixa_id, p_operador_id, p_forma_pagamento,
    p_total_bruto, p_total_desconto, p_total_liquido, p_pagamentos, p_itens,
    p_desconto_gerente_token, p_desconto_gerente_percentual, p_strict_manager_discount_auth,
    c_source
  );

  v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);

  IF p_fiscal_auto_enqueue THEN
    v_payload := jsonb_build_object(
      'origem', 'caixa_web_rpc_v3', 'venda_id', p_venda_id, 'loja_id', p_loja_id,
      'caixa_id', p_caixa_id, 'operador_id', v_uid, 'forma_pagamento', p_forma_pagamento,
      'pagamentos', COALESCE(p_pagamentos, '[]'::jsonb),
      'totais', jsonb_build_object('bruto', p_total_bruto, 'desconto', p_total_desconto, 'liquido', p_total_liquido),
      'itens', p_itens,
      'auditoria', jsonb_strip_nulls(jsonb_build_object(
        'ip_address', p_ip_address, 'user_agent', p_user_agent,
        'device_id', p_device_id, 'terminal_id', p_terminal_id
      ))
    );
    v_doc_id := public.fiscal_enfileirar_documento_venda(p_venda_id, 'NFC_E_STUB', v_payload);
    RETURN QUERY SELECT p_venda_id, 'CONCLUIDA'::text, NULL::text,
      jsonb_build_object('documento_fiscal_id', v_doc_id, 'tipo_doc', 'NFC_E_STUB'),
      NULL::jsonb, NULL::jsonb, v_event_id;
  ELSE
    RETURN QUERY SELECT p_venda_id, 'CONCLUIDA'::text, NULL::text,
      NULL::jsonb, NULL::jsonb, NULL::jsonb, v_event_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) IS
  'Finalização v3: pg_advisory_xact_lock por p_venda_id + delega à v2 + ledger web_caixa.';

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.caixa_integridade_gate_check()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'trigger_206', EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'vendas'
        AND t.tgname = 'trg_vendas_caixa_aberto_bi'
        AND NOT t.tgisinternal
    ),
    'advisory_lock_v3', EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'finalizar_venda_transacional_canonica_v3'
        AND pg_get_functiondef(p.oid) LIKE '%pg_advisory_xact_lock%'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.caixa_integridade_gate_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caixa_integridade_gate_check() TO service_role;
