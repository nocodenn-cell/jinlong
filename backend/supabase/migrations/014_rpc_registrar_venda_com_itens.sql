-- RPC transacional para registrar venda + itens + desconto de gerente.
-- Evita inconsistência de "venda sem itens" em reprocessamentos da sync-outbox.

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
AS $$
DECLARE
  v_item_count integer;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ID_OBRIGATORIO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'ERRO_RPC_ITENS_INVALIDOS';
  END IF;

  v_item_count := jsonb_array_length(p_itens);
  IF v_item_count <= 0 THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_SEM_ITENS';
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
    p_operador_id,
    p_total_bruto,
    p_total_desconto,
    p_total_liquido,
    p_forma_pagamento,
    'CONCLUIDA'
  )
  ON CONFLICT (id) DO NOTHING;

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
  SELECT
    (item->>'item_id')::uuid,
    p_venda_id,
    (item->>'produto_id')::uuid,
    (item->>'quantidade')::numeric,
    (item->>'preco_original')::numeric,
    (item->>'preco_unitario')::numeric,
    GREATEST(0, (item->>'preco_original')::numeric - (item->>'preco_unitario')::numeric),
    CASE
      WHEN (item->>'preco_unitario')::numeric < (item->>'preco_original')::numeric THEN 'ATACADO'
      ELSE 'VAREJO'
    END
  FROM jsonb_array_elements(p_itens) AS item
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.itens_venda iv
    WHERE iv.venda_id = p_venda_id
  ) THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_SEM_ITENS_PERSISTIDOS';
  END IF;

  IF p_desconto_gerente_percentual IS NOT NULL
     AND p_desconto_gerente_valor IS NOT NULL THEN
    INSERT INTO public.descontos_venda (
      venda_id,
      gerente_id,
      desconto_percentual,
      desconto_valor
    )
    VALUES (
      p_venda_id,
      p_gerente_id,
      p_desconto_gerente_percentual,
      p_desconto_gerente_valor
    )
    ON CONFLICT (venda_id) DO UPDATE
      SET gerente_id = EXCLUDED.gerente_id,
          desconto_percentual = EXCLUDED.desconto_percentual,
          desconto_valor = EXCLUDED.desconto_valor;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.registrar_venda_com_itens IS
  'Registra venda, itens e desconto de gerente em uma única transação SQL com idempotência por IDs.';

GRANT EXECUTE ON FUNCTION public.registrar_venda_com_itens(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  jsonb,
  numeric,
  numeric,
  text
) TO authenticated;
