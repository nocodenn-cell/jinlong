-- P1 S4 rollback — recria os 8 overloads legados exatamente como capturados em
-- produção em 2026-07-16 (snapshot pré-DROP), caso 03_security_drop_legacy_overloads.sql
-- precise ser revertido. Usar apenas se o DROP causar regressão inesperada.

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional(p_venda_id uuid, p_caixa_id uuid, p_forma_pagamento text, p_total_bruto numeric, p_total_desconto numeric, p_total_liquido numeric, p_itens jsonb)
 RETURNS void LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional(p_venda_id uuid, p_caixa_id uuid, p_forma_pagamento text, p_total_bruto numeric, p_total_desconto numeric, p_total_liquido numeric, p_itens jsonb, p_desconto_gerente_token text DEFAULT NULL::text, p_desconto_gerente_percentual numeric DEFAULT NULL::numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid                       uuid;
  v_item                      jsonb;
  v_item_id                   uuid;
  v_produto_id                uuid;
  v_quantidade                numeric;
  v_preco_original            numeric;
  v_preco_unitario            numeric;
  v_desconto_unitario         numeric;
  v_tipo_preco                text;
  v_rpc_row                   record;
  v_total_bruto_calc          numeric := 0;
  v_total_liquido_base_calc   numeric := 0;
  v_total_desconto_base_calc  numeric := 0;
  v_total_desconto_final_calc numeric := 0;
  v_total_liquido_final_calc  numeric := 0;
  v_desconto_gerente_valor    numeric := 0;
  v_max_desconto_gerente      numeric := 0;
  v_cfg_gerente_id            text   := NULL;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_UNAUTHORIZED';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_ITENS_INVALIDOS';
  END IF;

  IF (p_desconto_gerente_token IS NULL) <> (p_desconto_gerente_percentual IS NULL) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_DESCONTO_GERENTE_PARAMS_INVALIDOS';
  END IF;

  SELECT max_desconto_gerente_percentual, gerente_id
  INTO   v_max_desconto_gerente, v_cfg_gerente_id
  FROM   public.pdv_config
  WHERE  id = 1;

  IF p_desconto_gerente_token IS NOT NULL THEN
    IF p_desconto_gerente_percentual <= 0 OR p_desconto_gerente_percentual > COALESCE(v_max_desconto_gerente, 0) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_DESCONTO_GERENTE_LIMITE';
    END IF;

    PERFORM 1
    FROM public.tokens_desconto_gerente t
    WHERE t.token = p_desconto_gerente_token
      AND t.usado = false
      AND t.expira_em > now()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_TOKEN_GERENTE_INVALIDO';
    END IF;

    PERFORM set_config('session.gerente_token_validado', 'true', true);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id        := COALESCE((v_item->>'item_id')::uuid, gen_random_uuid());
    v_produto_id     := (v_item->>'produto_id')::uuid;
    v_quantidade     := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco     := COALESCE(v_item->>'tipo_preco', 'VAREJO');
    v_desconto_unitario := GREATEST(0, v_preco_original - v_preco_unitario);

    IF v_produto_id IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_ITEM_INVALIDO';
    END IF;
    IF v_preco_original IS NULL OR v_preco_original < 0 OR v_preco_unitario IS NULL OR v_preco_unitario < 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_PRECO_INVALIDO';
    END IF;

    v_total_bruto_calc          := v_total_bruto_calc          + (v_preco_original * v_quantidade);
    v_total_liquido_base_calc   := v_total_liquido_base_calc   + (v_preco_unitario * v_quantidade);

    INSERT INTO public.itens_venda (
      id, venda_id, produto_id, quantidade,
      preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco
    ) VALUES (
      v_item_id, p_venda_id, v_produto_id, v_quantidade,
      v_preco_original, v_preco_unitario, v_desconto_unitario, v_tipo_preco
    );

    SELECT * INTO v_rpc_row
    FROM public.decrementar_estoque_seguro(v_produto_id, v_quantidade, p_venda_id)
    LIMIT 1;

    IF v_rpc_row IS NULL OR v_rpc_row.sucesso IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_ESTOQUE:%', COALESCE(v_rpc_row.mensagem, 'DESCONHECIDO');
    END IF;
  END LOOP;

  v_total_bruto_calc          := ROUND(v_total_bruto_calc, 2);
  v_total_liquido_base_calc   := ROUND(v_total_liquido_base_calc, 2);
  v_total_desconto_base_calc  := ROUND(v_total_bruto_calc - v_total_liquido_base_calc, 2);

  IF p_desconto_gerente_token IS NOT NULL THEN
    v_desconto_gerente_valor := ROUND(
      (v_total_liquido_base_calc * p_desconto_gerente_percentual) / 100, 2
    );
  END IF;

  v_total_desconto_final_calc := ROUND(v_total_desconto_base_calc + v_desconto_gerente_valor, 2);
  v_total_liquido_final_calc  := ROUND(v_total_bruto_calc - v_total_desconto_final_calc, 2);

  IF ABS(v_total_bruto_calc      - p_total_bruto)     > 0.02
  OR ABS(v_total_desconto_final_calc - p_total_desconto) > 0.02
  OR ABS(v_total_liquido_final_calc  - p_total_liquido)  > 0.02 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_TOTAIS_DIVERGENTES';
  END IF;

  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status
  ) VALUES (
    p_venda_id, p_caixa_id, v_uid, v_total_bruto_calc,
    v_total_desconto_final_calc, v_total_liquido_final_calc,
    p_forma_pagamento, 'CONCLUIDA'
  );

  IF p_desconto_gerente_token IS NOT NULL THEN
    UPDATE public.tokens_desconto_gerente
    SET    usado = true
    WHERE  token = p_desconto_gerente_token AND usado = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_TOKEN_GERENTE_JA_USADO';
    END IF;

    INSERT INTO public.descontos_venda (
      venda_id, gerente_id, desconto_percentual, desconto_valor, operador_id, aplicado_em
    ) VALUES (
      p_venda_id, COALESCE(v_cfg_gerente_id, v_uid::text), p_desconto_gerente_percentual,
      v_desconto_gerente_valor, v_uid, now()
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2()
 RETURNS void LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2(p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid, p_forma_pagamento text, p_total_bruto numeric, p_total_desconto numeric, p_total_liquido numeric, p_pagamentos jsonb, p_itens jsonb, p_desconto_gerente_token text, p_desconto_gerente_percentual numeric, p_strict_manager_discount_auth boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2(p_loja_id uuid, p_caixa_id uuid, p_operador_id uuid, p_itens jsonb, p_pagamentos jsonb, p_total_bruto numeric, p_total_desconto numeric, p_total_liquido numeric, p_desconto_gerente_token text DEFAULT NULL::text, p_desconto_gerente_percentual numeric DEFAULT NULL::numeric, p_tipo_venda text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2(p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid DEFAULT NULL::uuid, p_forma_pagamento text DEFAULT 'DINHEIRO'::text, p_total_bruto numeric DEFAULT NULL::numeric, p_total_desconto numeric DEFAULT NULL::numeric, p_total_liquido numeric DEFAULT NULL::numeric, p_pagamentos jsonb DEFAULT NULL::jsonb, p_itens jsonb DEFAULT '[]'::jsonb, p_desconto_gerente_token text DEFAULT NULL::text, p_desconto_gerente_percentual numeric DEFAULT NULL::numeric, p_strict_manager_discount_auth boolean DEFAULT false, p_event_source text DEFAULT 'sync_outbox'::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v3()
 RETURNS void LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v3(p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid, p_loja_id uuid, p_forma_pagamento text DEFAULT 'DINHEIRO'::text, p_total_bruto numeric DEFAULT NULL::numeric, p_total_desconto numeric DEFAULT NULL::numeric, p_total_liquido numeric DEFAULT NULL::numeric, p_pagamentos jsonb DEFAULT NULL::jsonb, p_itens jsonb DEFAULT '[]'::jsonb, p_desconto_gerente_token text DEFAULT NULL::text, p_desconto_gerente_percentual numeric DEFAULT NULL::numeric, p_strict_manager_discount_auth boolean DEFAULT false, p_fiscal_auto_enqueue boolean DEFAULT false, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_terminal_id text DEFAULT NULL::text)
 RETURNS TABLE(venda_id uuid, status text, mensagem text, dados_fiscais jsonb, itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$function$;
