-- BACKPORT (fase R1, 2026-07-02): conteúdo extraído de
-- supabase_migrations.schema_migrations.statements do projeto de produção
-- (jinlong). Esta migration foi aplicada em produção sem arquivo no repo.

-- Estratégia de substituição segura da engine de venda (NÃO-DESTRUTIVA / ADITIVA).
-- Nenhum DROP/REPLACE de v2(stub)/v3. Cria: v4 (reusa a v2 12-arg real), tabela de
-- shadow runs, validador dry-run de consistência e feature flag (default OFF) p/ rollout.

------------------------------------------------------------------------
-- 1) Feature flag de rollout (default desligada = mantém v3 atual).
------------------------------------------------------------------------
INSERT INTO public.feature_flags (name, enabled, description)
VALUES (
  'venda_engine_v4', false,
  'Roteia a finalização de venda do PDV web para a engine v4 (reusa a v2 12-arg real). Rollout progressivo; OFF mantém v3.'
)
ON CONFLICT (name) DO NOTHING;

------------------------------------------------------------------------
-- 2) Log de execuções shadow / dry-run (aditivo).
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venda_engine_shadow_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  engine        text NOT NULL DEFAULT 'v4_dryrun',
  shadow_venda_id uuid,
  ok            boolean NOT NULL,
  erro          text,
  consistencia  jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado     jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.venda_engine_shadow_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.venda_engine_shadow_runs FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.venda_engine_shadow_runs TO service_role;

------------------------------------------------------------------------
-- 3) Engine v4: idêntica em contrato à v3, mas delega à v2 12-arg REAL
--    (em vez do stub 13-arg). Aditiva — novo nome, sem tocar v2/v3.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(
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
  venda_id uuid, status text, mensagem text, dados_fiscais jsonb,
  itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Delega à v2 12-arg REAL (engine completa: itens, estoque, pagamentos, desconto gerente).
  PERFORM public.finalizar_venda_transacional_canonica_v2(
    p_venda_id, p_caixa_id, p_operador_id, p_forma_pagamento,
    p_total_bruto, p_total_desconto, p_total_liquido, p_pagamentos, p_itens,
    p_desconto_gerente_token, p_desconto_gerente_percentual, p_strict_manager_discount_auth
  );

  v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);

  IF p_fiscal_auto_enqueue THEN
    v_payload := jsonb_build_object(
      'origem', 'caixa_web_rpc_v4', 'venda_id', p_venda_id, 'loja_id', p_loja_id,
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

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) TO service_role;

------------------------------------------------------------------------
-- 4) Validador SHADOW / dry-run: executa a v4 em subtransação, mede
--    consistência (estoque, itens, pagamento, evento) e FAZ ROLLBACK.
--    Nada é persistido além do log. Não compromete dados de produção.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shadow_validar_venda_engine_v4(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caixa_id uuid := (p_payload->>'caixa_id')::uuid;
  v_operador_id uuid := (p_payload->>'operador_id')::uuid;
  v_loja_id uuid := (p_payload->>'loja_id')::uuid;
  v_forma text := COALESCE(p_payload->>'forma_pagamento', 'DINHEIRO');
  v_itens jsonb := COALESCE(p_payload->'itens', '[]'::jsonb);
  v_pagamentos jsonb := p_payload->'pagamentos';
  v_tb numeric := NULLIF(p_payload->>'total_bruto','')::numeric;
  v_td numeric := NULLIF(p_payload->>'total_desconto','')::numeric;
  v_tl numeric := NULLIF(p_payload->>'total_liquido','')::numeric;
  v_token text := NULLIF(p_payload->>'desconto_gerente_token','');
  v_pct numeric := NULLIF(p_payload->>'desconto_gerente_percentual','')::numeric;

  v_shadow_venda uuid := gen_random_uuid();
  v_qty_esperada numeric := 0;
  v_estoque_antes numeric := 0;
  v_estoque_depois numeric := 0;
  v_itens_count integer := 0;
  v_pag_sum numeric := 0;
  v_venda_total_liq numeric := 0;
  v_evento_ok boolean := false;

  v_ok boolean := false;
  v_erro text := NULL;
  v_chk jsonb;
  v_res jsonb;
BEGIN
  -- Soma de quantidades esperadas a baixar.
  SELECT COALESCE(SUM((it->>'quantidade')::numeric),0) INTO v_qty_esperada
  FROM jsonb_array_elements(v_itens) it;

  -- Baseline de estoque dos produtos da venda nesta loja.
  SELECT COALESCE(SUM(e.quantidade_atual),0) INTO v_estoque_antes
  FROM public.estoque e
  WHERE e.loja_id = v_loja_id
    AND e.produto_id IN (SELECT (it->>'produto_id')::uuid FROM jsonb_array_elements(v_itens) it);

  BEGIN
    -- Executa a engine real (sem fiscal) num escopo que será revertido.
    PERFORM public.finalizar_venda_transacional_canonica_v4(
      v_shadow_venda, v_caixa_id, v_operador_id, v_loja_id, v_forma,
      v_tb, v_td, v_tl, v_pagamentos, v_itens, v_token, v_pct, false, false,
      NULL, NULL, NULL, 'shadow'
    );

    -- Captura de estado DENTRO da subtransação (variáveis sobrevivem ao rollback).
    SELECT COALESCE(SUM(e.quantidade_atual),0) INTO v_estoque_depois
    FROM public.estoque e
    WHERE e.loja_id = v_loja_id
      AND e.produto_id IN (SELECT (it->>'produto_id')::uuid FROM jsonb_array_elements(v_itens) it);

    SELECT COUNT(*) INTO v_itens_count FROM public.itens_venda WHERE venda_id = v_shadow_venda;
    SELECT COALESCE(SUM(valor),0) INTO v_pag_sum FROM public.vendas_pagamentos WHERE venda_id = v_shadow_venda;
    SELECT COALESCE(total_liquido,0) INTO v_venda_total_liq FROM public.vendas WHERE id = v_shadow_venda;
    SELECT EXISTS(SELECT 1 FROM public.venda_eventos WHERE sale_id = v_shadow_venda AND event_type='SALE_REGISTERED') INTO v_evento_ok;

    v_ok := true;
    -- Força rollback da subtransação: dry-run não persiste a venda.
    RAISE EXCEPTION 'SHADOW_ROLLBACK_OK';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'SHADOW_ROLLBACK_OK' THEN
        v_ok := true;  -- engine executou; estado capturado.
      ELSE
        v_ok := false;
        v_erro := SQLERRM;
      END IF;
  END;

  v_chk := jsonb_build_object(
    'itens_ok', (v_ok AND v_itens_count = jsonb_array_length(v_itens)),
    'itens_esperados', jsonb_array_length(v_itens),
    'itens_gravados', v_itens_count,
    'estoque_ok', (v_ok AND ABS((v_estoque_antes - v_estoque_depois) - v_qty_esperada) <= 0.0001),
    'estoque_baixa_esperada', v_qty_esperada,
    'estoque_baixa_real', (v_estoque_antes - v_estoque_depois),
    'pagamento_ok', (v_ok AND ABS(v_pag_sum - v_venda_total_liq) <= 0.01),
    'pagamento_soma', v_pag_sum,
    'venda_total_liquido', v_venda_total_liq,
    'evento_ledger_ok', v_evento_ok
  );

  v_res := jsonb_build_object(
    'ok', v_ok,
    'erro', v_erro,
    'engine', 'v4',
    'shadow_venda_id', v_shadow_venda,
    'consistencia', v_chk,
    'persistido', false
  );

  INSERT INTO public.venda_engine_shadow_runs (engine, shadow_venda_id, ok, erro, consistencia, resultado)
  VALUES ('v4_dryrun', v_shadow_venda, v_ok, v_erro, v_chk, v_res);

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.shadow_validar_venda_engine_v4(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shadow_validar_venda_engine_v4(jsonb) TO service_role;
