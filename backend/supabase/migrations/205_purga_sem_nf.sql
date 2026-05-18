-- Purge do modo SEM_NF: toda venda nova é gravada como COM_NF.
-- A assinatura das RPCs canônicas é preservada para compatibilidade com chamadas
-- legadas. O histórico de vendas passadas (tipo_venda='SEM_NF') não é alterado.

-- 1. Altera o default da coluna para COM_NF e força a constraint para aceitar
--    apenas COM_NF em novas inserções via default.
ALTER TABLE public.vendas
  ALTER COLUMN tipo_venda SET DEFAULT 'COM_NF';

-- 2. Substitui a RPC v2 para inserir explicitamente COM_NF, ignorando qualquer
--    valor que chamadas legadas possam tentar passar via outros meios.
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]'::jsonb,
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Forçar COM_NF independente de qualquer parâmetro legado
  v_tipo_venda TEXT := 'COM_NF';

  v_uid uuid;
  v_item jsonb;
  v_item_id uuid;
  v_produto_id uuid;
  v_quantidade numeric;
  v_preco_original numeric;
  v_preco_unitario numeric;
  v_total_bruto_calc numeric := 0;
  v_total_desconto_calc numeric := 0;
  v_total_desconto_final_calc numeric := 0;
  v_total_liquido_final_calc numeric := 0;
  v_desconto_item numeric;
  v_desconto_gerente_valor numeric := 0;
  v_gerente_token_valid boolean := false;
  v_max_desconto_gerente numeric := 0;
  v_gerente_id uuid;
  v_loja_id uuid;
  v_caixa_loja_id uuid;
BEGIN
  -- Resolve operador
  IF p_operador_id IS NOT NULL THEN
    v_uid := p_operador_id;
  ELSE
    v_uid := auth.uid();
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_NAO_IDENTIFICADO';
  END IF;

  -- Resolve loja via caixa
  SELECT loja_id INTO v_caixa_loja_id
  FROM public.caixas
  WHERE id = p_caixa_id;

  IF v_caixa_loja_id IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_NAO_ENCONTRADO';
  END IF;

  v_loja_id := v_caixa_loja_id;

  -- Calcula totais dos itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id     := (v_item->>'id')::uuid;
    v_produto_id  := (v_item->>'produto_id')::uuid;
    v_quantidade  := COALESCE((v_item->>'quantidade')::numeric, 0);
    v_preco_original := COALESCE((v_item->>'preco_original')::numeric, 0);
    v_preco_unitario := COALESCE((v_item->>'preco_unitario')::numeric, 0);

    v_total_bruto_calc   := v_total_bruto_calc + ROUND(v_preco_original * v_quantidade, 2);
    v_desconto_item      := ROUND((v_preco_original - v_preco_unitario) * v_quantidade, 2);
    v_total_desconto_calc := v_total_desconto_calc + GREATEST(v_desconto_item, 0);
  END LOOP;

  -- Validação de desconto gerencial
  IF p_desconto_gerente_token IS NOT NULL AND p_desconto_gerente_percentual IS NOT NULL AND p_desconto_gerente_percentual > 0 THEN
    SELECT
      tg.valido AND NOT tg.usado AND tg.expira_em > now(),
      tg.max_desconto_percentual,
      tg.gerente_id
    INTO v_gerente_token_valid, v_max_desconto_gerente, v_gerente_id
    FROM public.tokens_desconto_gerente tg
    WHERE tg.token = p_desconto_gerente_token;

    IF NOT COALESCE(v_gerente_token_valid, false) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO';
    END IF;

    IF p_strict_manager_discount_auth AND p_desconto_gerente_percentual > v_max_desconto_gerente THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_DESCONTO_GERENTE_EXCEDIDO';
    END IF;

    v_desconto_gerente_valor := ROUND(
      (v_total_bruto_calc - v_total_desconto_calc) * (p_desconto_gerente_percentual / 100.0),
      2
    );
  END IF;

  v_total_desconto_final_calc := v_total_desconto_calc + v_desconto_gerente_valor;
  v_total_liquido_final_calc  := ROUND(v_total_bruto_calc - v_total_desconto_final_calc, 2);

  -- Validação de totais (tolerância de 1 centavo)
  IF p_total_bruto IS NOT NULL AND ABS(p_total_bruto - v_total_bruto_calc) > 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  END IF;
  IF p_total_desconto IS NOT NULL AND ABS(p_total_desconto - v_total_desconto_final_calc) > 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  END IF;
  IF p_total_liquido IS NOT NULL AND ABS(p_total_liquido - v_total_liquido_final_calc) > 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  END IF;

  -- Insere venda com tipo_venda forçado como COM_NF
  INSERT INTO public.vendas (
    id,
    caixa_id,
    operador_id,
    total_bruto,
    total_desconto,
    total_liquido,
    forma_pagamento,
    tipo_venda,
    status
  )
  VALUES (
    p_venda_id,
    p_caixa_id,
    v_uid,
    v_total_bruto_calc,
    v_total_desconto_final_calc,
    v_total_liquido_final_calc,
    p_forma_pagamento,
    v_tipo_venda,
    'CONCLUIDA'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Pagamentos
  IF p_pagamentos IS NULL THEN
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (p_venda_id, p_forma_pagamento, v_total_liquido_final_calc);
  ELSE
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    SELECT
      p_venda_id,
      upper(COALESCE(item->>'forma_pagamento', p_forma_pagamento)),
      ROUND(COALESCE((item->>'valor')::numeric, 0), 2)
    FROM jsonb_array_elements(p_pagamentos) AS item;
  END IF;

  -- Desconto gerencial
  IF v_gerente_token_valid AND v_desconto_gerente_valor > 0 THEN
    UPDATE public.tokens_desconto_gerente
    SET usado = true
    WHERE token = p_desconto_gerente_token;

    INSERT INTO public.descontos_venda (
      venda_id, gerente_id, percentual, valor_absoluto
    )
    VALUES (
      p_venda_id, v_gerente_id,
      p_desconto_gerente_percentual, v_desconto_gerente_valor
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Baixa de estoque por item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id    := (v_item->>'id')::uuid;
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := COALESCE((v_item->>'quantidade')::numeric, 0);
    v_preco_unitario := COALESCE((v_item->>'preco_unitario')::numeric, 0);

    INSERT INTO public.itens_venda (
      id, venda_id, produto_id, quantidade, preco_unitario, loja_id
    )
    VALUES (
      v_item_id, p_venda_id, v_produto_id, v_quantidade, v_preco_unitario, v_loja_id
    )
    ON CONFLICT (id) DO NOTHING;

    PERFORM public.decrementar_estoque_seguro(
      v_produto_id, v_loja_id, v_quantidade, v_item_id
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v2 IS
  'RPC canônica v2 — toda venda é gravada como COM_NF (v_tipo_venda forçado). Assinatura preservada para compatibilidade legada.';
