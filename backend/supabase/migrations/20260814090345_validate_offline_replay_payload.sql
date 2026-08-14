-- P1-1: o retry offline passa a comparar a identidade do carrinho, não só os totais.
--
-- Problema comprovado: `registrar_venda_com_itens` declarava replay comparando
-- apenas `total_bruto`, `total_desconto` e `total_liquido` do cabeçalho já
-- persistido. Executado:
--
--   Payload A: Produto X x1 @100  -> gravado
--   Payload B: Produto Y x2 @50   -> RETORNOU SUCESSO, nada persistido
--   itens_venda final: Produto X x1 @100
--
-- O chamador recebe sucesso e o sync-outbox marca o evento como sincronizado.
-- Pior: em `sync-outbox/index.ts` a baixa de estoque roda DEPOIS da RPC
-- (linha 653 -> 689) e usa o payload B, de modo que o estoque do produto Y é
-- decrementado enquanto `itens_venda` guarda o produto X.
--
-- Correção mínima: a identidade lógica do comando passa a ser
-- (venda_id, conjunto canônico de itens). A comparação é feita contra as linhas
-- realmente persistidas em `itens_venda` — sem coluna nova e sem hash guardado,
-- de modo que o teste é sempre contra o fato, não contra um resumo que poderia
-- divergir dele.
--
-- Ordem não é semântica: os dois lados são ordenados pela mesma chave canônica
-- (produto, quantidade, preço original, preço unitário), então reenviar o mesmo
-- carrinho em outra ordem continua sendo replay.
--
-- Precisão: quantidade em 3 casas e preços em 2, iguais às invariantes já
-- validadas por `internal.calcular_totais_venda`.
--
-- ROLLBACK: restaurar o corpo de 20260814014205_offline_resolve_tipo_preco.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_venda_com_itens(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_forma_pagamento text,
  p_total_bruto numeric,
  p_total_desconto numeric,
  p_total_liquido numeric,
  p_itens jsonb,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_desconto_gerente_valor numeric DEFAULT NULL,
  p_gerente_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item_count integer;
  v_totais record;
  v_existente record;
  v_loja_id uuid;
  v_assinatura_persistida text;
  v_assinatura_payload text;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ID_OBRIGATORIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  SELECT * INTO v_totais
  FROM internal.calcular_totais_venda(p_itens, p_desconto_gerente_percentual);

  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = p_caixa_id;
  PERFORM internal.validar_precos_venda(p_itens, v_loja_id);

  IF p_total_bruto IS NULL OR p_total_desconto IS NULL OR p_total_liquido IS NULL
     OR p_total_bruto <> public.round_abnt(p_total_bruto, 2)
     OR p_total_desconto <> public.round_abnt(p_total_desconto, 2)
     OR p_total_liquido <> public.round_abnt(p_total_liquido, 2)
     OR p_total_bruto <> v_totais.total_bruto
     OR p_total_desconto <> v_totais.total_desconto
     OR p_total_liquido <> v_totais.total_liquido THEN
    RAISE EXCEPTION 'ERRO_RPC_TOTAIS_DIVERGENTES';
  END IF;

  IF (p_desconto_gerente_percentual IS NULL) <> (p_desconto_gerente_valor IS NULL)
     OR COALESCE(p_desconto_gerente_valor, 0) <> v_totais.desconto_global_valor THEN
    RAISE EXCEPTION 'ERRO_RPC_DESCONTO_GERENTE_DIVERGENTE';
  END IF;

  SELECT v.total_bruto, v.total_desconto, v.total_liquido
  INTO v_existente
  FROM public.vendas v
  WHERE v.id = p_venda_id;

  IF FOUND THEN
    IF v_existente.total_bruto <> v_totais.total_bruto
       OR v_existente.total_desconto <> v_totais.total_desconto
       OR v_existente.total_liquido <> v_totais.total_liquido THEN
      RAISE EXCEPTION 'ERRO_RPC_RETRY_PAYLOAD_DIVERGENTE';
    END IF;

    -- P1-1: totais iguais não provam o mesmo carrinho. Compara o conjunto
    -- canônico de itens contra o que está de fato persistido.
    SELECT string_agg(assinatura, '|' ORDER BY assinatura) INTO v_assinatura_persistida
    FROM (
      SELECT iv.produto_id::text || ';' || round(iv.quantidade, 3)::text || ';'
             || round(iv.preco_unitario_original, 2)::text || ';'
             || round(iv.preco_unitario, 2)::text AS assinatura
      FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
    ) AS persistido;

    SELECT string_agg(assinatura, '|' ORDER BY assinatura) INTO v_assinatura_payload
    FROM (
      SELECT (item->>'produto_id') || ';' || round((item->>'quantidade')::numeric, 3)::text || ';'
             || round((item->>'preco_original')::numeric, 2)::text || ';'
             || round((item->>'preco_unitario')::numeric, 2)::text AS assinatura
      FROM jsonb_array_elements(p_itens) AS item
    ) AS enviado;

    IF v_assinatura_persistida IS DISTINCT FROM v_assinatura_payload THEN
      RAISE EXCEPTION 'ERRO_RPC_RETRY_PAYLOAD_DIVERGENTE';
    END IF;

    RETURN;
  END IF;

  v_item_count := jsonb_array_length(p_itens);

  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status
  ) VALUES (
    p_venda_id, p_caixa_id, p_operador_id, v_totais.total_bruto,
    v_totais.total_desconto, v_totais.total_liquido, p_forma_pagamento, 'CONCLUIDA'
  );

  INSERT INTO public.itens_venda (
    id, venda_id, produto_id, quantidade, preco_unitario_original,
    preco_unitario, desconto_unitario, tipo_preco
  )
  SELECT
    (item->>'item_id')::uuid,
    p_venda_id,
    (item->>'produto_id')::uuid,
    (item->>'quantidade')::numeric,
    (item->>'preco_original')::numeric,
    (item->>'preco_unitario')::numeric,
    GREATEST(0, (item->>'preco_original')::numeric - (item->>'preco_unitario')::numeric),
    CASE
      WHEN calc.tipo = 'ATACADO'
       AND abs((item->>'preco_unitario')::numeric - calc.preco) <= 0.02 THEN 'ATACADO'
      WHEN (item->>'preco_unitario')::numeric < (item->>'preco_original')::numeric THEN 'MANUAL'
      ELSE 'VAREJO'
    END
  FROM jsonb_array_elements(p_itens) AS item
  LEFT JOIN LATERAL (
    SELECT resolvido->>'tipo' AS tipo, (resolvido->>'preco')::numeric AS preco
    FROM public.calcular_preco_produto(
      (item->>'produto_id')::uuid,
      GREATEST(1, FLOOR((item->>'quantidade')::numeric))::integer,
      v_loja_id
    ) AS resolvido
    WHERE v_loja_id IS NOT NULL
  ) AS calc ON true;

  IF (SELECT count(*) FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id) <> v_item_count THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ITENS_PERSISTIDOS_DIVERGENTES';
  END IF;

  IF v_totais.total_liquido > 0 THEN
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (p_venda_id, p_forma_pagamento, v_totais.total_liquido)
    ON CONFLICT (venda_id, forma_pagamento) DO NOTHING;
  END IF;

  IF p_desconto_gerente_percentual IS NOT NULL THEN
    INSERT INTO public.descontos_venda (
      venda_id, gerente_id, desconto_percentual, desconto_valor
    ) VALUES (
      p_venda_id, p_gerente_id, p_desconto_gerente_percentual, v_totais.desconto_global_valor
    )
    ON CONFLICT (venda_id) DO NOTHING;
  END IF;
END;
$function$;

COMMIT;
