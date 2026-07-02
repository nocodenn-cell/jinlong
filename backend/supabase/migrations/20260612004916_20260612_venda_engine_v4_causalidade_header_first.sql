-- BACKPORT (fase R1, 2026-07-02): conteúdo extraído de
-- supabase_migrations.schema_migrations.statements do projeto de produção
-- (jinlong). Esta migration foi aplicada em produção sem arquivo no repo.

-- Correção de CAUSALIDADE transacional na engine v4 (ADITIVA — só altera a própria v4).
-- Ordem correta: valida -> calcula totais -> INSERE header da venda (CONCLUIDA) -> baixa
-- estoque por item -> pagamentos -> desconto gerente -> ledger/fiscal.
-- Resolve VENDA_CAIXA_INVALIDA: decrementar_estoque_seguro exige a linha de vendas existir.
-- Não toca v2/v3/stub. Aritmética idêntica à v2 12-arg real. Flag continua OFF.

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(
  p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid, p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL, p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL, p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]'::jsonb, p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL, p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL, p_terminal_id text DEFAULT NULL
)
RETURNS TABLE (
  venda_id uuid, status text, mensagem text, dados_fiscais jsonb,
  itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_item jsonb;
  v_item_id uuid;
  v_produto_id uuid;
  v_quantidade numeric;
  v_preco_original numeric;
  v_preco_unitario numeric;
  v_desconto_unitario numeric;
  v_tipo_preco text;
  v_q_int integer;
  v_calc jsonb;
  v_preco_esperado numeric;
  v_tipo_esperado text;
  v_rpc_row record;
  v_total_bruto_calc numeric := 0;
  v_total_liquido_base_calc numeric := 0;
  v_total_desconto_base_calc numeric := 0;
  v_total_desconto_final_calc numeric := 0;
  v_total_liquido_final_calc numeric := 0;
  v_desconto_gerente_valor numeric := 0;
  v_max_desconto_gerente numeric := 0;
  v_cfg_gerente_id text := NULL;
  v_has_gerente_desconto boolean := false;
  v_pag jsonb; v_pag_forma text; v_pag_valor numeric; v_pag_total numeric := 0;
  v_eps constant numeric := 0.02;
  v_doc_id uuid; v_payload jsonb; v_row_doc jsonb; v_event_id uuid;
  c_source constant text := 'web_caixa';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_OBRIGATORIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ITENS_INVALIDOS';
  END IF;

  -- Idempotência: venda já concluída -> garante evento e retorna.
  IF EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = p_venda_id AND v.status = 'CONCLUIDA') THEN
    SELECT jsonb_build_object('documento_fiscal_id', d.id, 'status', d.status, 'tipo_doc', d.tipo_doc)
    INTO v_row_doc FROM public.documentos_fiscais_pendentes d
    WHERE d.venda_id = p_venda_id AND d.status <> 'CANCELADO' AND d.deleted_at IS NULL
    ORDER BY d.created_at DESC LIMIT 1;
    v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);
    RETURN QUERY SELECT p_venda_id, 'CONCLUIDA'::text, NULL::text, v_row_doc, NULL::jsonb, NULL::jsonb, v_event_id;
    RETURN;
  END IF;

  -- Validação de desconto gerente (idêntica à v2).
  v_has_gerente_desconto := COALESCE(p_desconto_gerente_percentual, 0) > 0;
  IF p_strict_manager_discount_auth AND v_has_gerente_desconto AND p_desconto_gerente_token IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_TOKEN_OBRIGATORIO';
  END IF;
  IF p_desconto_gerente_token IS NOT NULL AND COALESCE(p_desconto_gerente_percentual, 0) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_PERCENTUAL_INVALIDO';
  END IF;

  SELECT max_desconto_gerente_percentual, gerente_id
  INTO v_max_desconto_gerente, v_cfg_gerente_id FROM public.pdv_config WHERE id = 1;

  IF p_desconto_gerente_token IS NOT NULL THEN
    IF p_desconto_gerente_percentual <= 0 OR p_desconto_gerente_percentual > COALESCE(v_max_desconto_gerente, 0) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_DESCONTO_GERENTE_LIMITE';
    END IF;
    PERFORM 1 FROM public.tokens_desconto_gerente t
    WHERE t.token = p_desconto_gerente_token AND t.usado = false AND t.expira_em > now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO'; END IF;
  ELSIF p_strict_manager_discount_auth AND v_has_gerente_desconto THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_TOKEN_OBRIGATORIO';
  END IF;

  -- PASSO 1: validação de preço autoritativo + cálculo de totais (SEM escrever no banco).
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco := COALESCE(v_item->>'tipo_preco', 'VAREJO');

    IF v_produto_id IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ITEM_INVALIDO';
    END IF;
    IF v_preco_original IS NULL OR v_preco_original < 0 OR v_preco_unitario IS NULL OR v_preco_unitario < 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_INVALIDO';
    END IF;

    IF v_tipo_preco IN ('MANUAL', 'PROMOCAO') THEN
      IF v_preco_unitario > v_preco_original + v_eps THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_ACIMA_REFERENCIA';
      END IF;
    ELSE
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
    END IF;

    v_total_bruto_calc := v_total_bruto_calc + (v_preco_original * v_quantidade);
    v_total_liquido_base_calc := v_total_liquido_base_calc + (v_preco_unitario * v_quantidade);
  END LOOP;

  v_total_bruto_calc := public.round_abnt(v_total_bruto_calc, 2);
  v_total_liquido_base_calc := public.round_abnt(v_total_liquido_base_calc, 2);
  v_total_desconto_base_calc := public.round_abnt(v_total_bruto_calc - v_total_liquido_base_calc, 2);

  IF p_desconto_gerente_token IS NOT NULL THEN
    v_desconto_gerente_valor := public.round_abnt((v_total_liquido_base_calc * p_desconto_gerente_percentual) / 100, 2);
  END IF;
  v_total_desconto_final_calc := public.round_abnt(v_total_desconto_base_calc + v_desconto_gerente_valor, 2);
  v_total_liquido_final_calc := public.round_abnt(v_total_bruto_calc - v_total_desconto_final_calc, 2);

  -- Conferência de pagamentos.
  IF p_pagamentos IS NULL THEN
    v_pag_total := v_total_liquido_final_calc;
  ELSE
    IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INVALIDOS';
    END IF;
    FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
    LOOP
      v_pag_forma := upper(COALESCE(v_pag->>'forma_pagamento', ''));
      v_pag_valor := public.round_abnt(COALESCE((v_pag->>'valor')::numeric, 0), 2);
      IF v_pag_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'FIADO') THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA';
      END IF;
      IF v_pag_valor <= 0 THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_VALOR_PAGAMENTO_INVALIDO';
      END IF;
      v_pag_total := public.round_abnt(v_pag_total + v_pag_valor, 2);
    END LOOP;
  END IF;

  IF ABS(v_pag_total - v_total_liquido_final_calc) > 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_DIVERGENTES';
  END IF;

  IF p_total_bruto IS NOT NULL AND p_total_desconto IS NOT NULL AND p_total_liquido IS NOT NULL
     AND (ABS(v_total_bruto_calc - p_total_bruto) > 0.02
       OR ABS(v_total_desconto_final_calc - p_total_desconto) > 0.02
       OR ABS(v_total_liquido_final_calc - p_total_liquido) > 0.02) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  END IF;

  -- PASSO 2: CAUSALIDADE — header da venda ANTES de qualquer baixa de estoque.
  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status
  ) VALUES (
    p_venda_id, p_caixa_id, v_uid, v_total_bruto_calc, v_total_desconto_final_calc,
    v_total_liquido_final_calc, p_forma_pagamento, 'CONCLUIDA'
  ) ON CONFLICT (id) DO NOTHING;

  -- PASSO 3: itens + baixa de estoque (agora a venda existe -> decrementar_estoque_seguro OK).
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id := COALESCE((v_item->>'item_id')::uuid, gen_random_uuid());
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco := COALESCE(v_item->>'tipo_preco', 'VAREJO');
    v_desconto_unitario := GREATEST(0, v_preco_original - v_preco_unitario);

    INSERT INTO public.itens_venda (
      id, venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco
    ) VALUES (
      v_item_id, p_venda_id, v_produto_id, v_quantidade, v_preco_original, v_preco_unitario, v_desconto_unitario, v_tipo_preco
    ) ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_rpc_row FROM public.decrementar_estoque_seguro(v_produto_id, v_quantidade, p_venda_id) LIMIT 1;
    IF v_rpc_row IS NULL OR v_rpc_row.sucesso IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ESTOQUE:%', COALESCE(v_rpc_row.mensagem, 'DESCONHECIDO');
    END IF;
  END LOOP;

  -- PASSO 4: pagamentos.
  IF p_pagamentos IS NULL THEN
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (p_venda_id, p_forma_pagamento, v_total_liquido_final_calc)
    ON CONFLICT (venda_id, forma_pagamento) DO NOTHING;
  ELSE
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    SELECT p_venda_id, upper(COALESCE(item->>'forma_pagamento', p_forma_pagamento)),
           public.round_abnt(COALESCE((item->>'valor')::numeric, 0), 2)
    FROM jsonb_array_elements(p_pagamentos) AS item
    ON CONFLICT (venda_id, forma_pagamento) DO NOTHING;
  END IF;

  -- PASSO 5: consumo de token + auditoria de desconto gerente.
  IF p_desconto_gerente_token IS NOT NULL THEN
    UPDATE public.tokens_desconto_gerente SET usado = true
    WHERE token = p_desconto_gerente_token AND usado = false;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_JA_USADO'; END IF;
    INSERT INTO public.descontos_venda (venda_id, gerente_id, desconto_percentual, desconto_valor)
    VALUES (p_venda_id, COALESCE(v_cfg_gerente_id, v_uid::text), p_desconto_gerente_percentual, v_desconto_gerente_valor)
    ON CONFLICT (venda_id) DO UPDATE
      SET gerente_id = EXCLUDED.gerente_id, desconto_percentual = EXCLUDED.desconto_percentual, desconto_valor = EXCLUDED.desconto_valor;
  END IF;

  -- PASSO 6: ledger + fiscal.
  v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);

  IF p_fiscal_auto_enqueue THEN
    v_payload := jsonb_build_object(
      'origem', 'caixa_web_rpc_v4', 'venda_id', p_venda_id, 'loja_id', p_loja_id,
      'caixa_id', p_caixa_id, 'operador_id', v_uid, 'forma_pagamento', p_forma_pagamento,
      'pagamentos', COALESCE(p_pagamentos, '[]'::jsonb),
      'totais', jsonb_build_object('bruto', v_total_bruto_calc, 'desconto', v_total_desconto_final_calc, 'liquido', v_total_liquido_final_calc),
      'itens', p_itens,
      'auditoria', jsonb_strip_nulls(jsonb_build_object(
        'ip_address', p_ip_address, 'user_agent', p_user_agent,
        'device_id', p_device_id, 'terminal_id', p_terminal_id))
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
