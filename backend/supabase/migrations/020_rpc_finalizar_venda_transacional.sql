-- RPC única para finalizar venda + itens + baixa de estoque em transação única.
-- Em caso de qualquer erro de estoque, toda a operação é revertida.

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_forma_pagamento text,
  p_total_bruto numeric,
  p_total_desconto numeric,
  p_total_liquido numeric,
  p_itens jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_item jsonb;
  v_item_id uuid;
  v_produto_id uuid;
  v_quantidade numeric;
  v_preco_original numeric;
  v_preco_unitario numeric;
  v_desconto_unitario numeric;
  v_tipo_preco text;
  v_rpc_row record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_UNAUTHORIZED';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_ITENS_INVALIDOS';
  END IF;

  INSERT INTO public.vendas (
    id,
    caixa_id,
    operador_id,
    total_bruto,
    total_desconto,
    total_liquido,
    forma_pagamento,
    status
  )
  VALUES (
    p_venda_id,
    p_caixa_id,
    v_uid,
    p_total_bruto,
    p_total_desconto,
    p_total_liquido,
    p_forma_pagamento,
    'CONCLUIDA'
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id := COALESCE((v_item->>'item_id')::uuid, gen_random_uuid());
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco := COALESCE(v_item->>'tipo_preco', 'VAREJO');
    v_desconto_unitario := GREATEST(0, v_preco_original - v_preco_unitario);

    IF v_produto_id IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_ITEM_INVALIDO';
    END IF;

    INSERT INTO public.itens_venda (
      id,
      venda_id,
      produto_id,
      quantidade,
      preco_unitario_original,
      preco_unitario,
      desconto_unitario,
      tipo_preco
    )
    VALUES (
      v_item_id,
      p_venda_id,
      v_produto_id,
      v_quantidade,
      v_preco_original,
      v_preco_unitario,
      v_desconto_unitario,
      v_tipo_preco
    );

    SELECT * INTO v_rpc_row
    FROM public.decrementar_estoque_seguro(v_produto_id, v_quantidade, p_venda_id)
    LIMIT 1;

    IF v_rpc_row IS NULL OR v_rpc_row.sucesso IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_ESTOQUE:%', COALESCE(v_rpc_row.mensagem, 'DESCONHECIDO');
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional(
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional(
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  jsonb
) TO authenticated;
