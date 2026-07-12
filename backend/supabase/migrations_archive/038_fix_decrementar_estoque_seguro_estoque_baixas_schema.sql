-- Compatibilidade: `estoque_baixas` pode não ter coluna `quantidade`.
-- Ajusta `decrementar_estoque_seguro` para registrar idempotência apenas por
-- (venda_id, produto_id), sem depender de colunas opcionais.

CREATE OR REPLACE FUNCTION public.decrementar_estoque_seguro(
  p_produto_id UUID,
  p_quantidade NUMERIC,
  p_venda_id UUID
)
RETURNS TABLE(
  sucesso BOOLEAN,
  mensagem TEXT,
  estoque_atual NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quantidade_atual NUMERIC;
  v_version INTEGER;
  v_baixa_existente BOOLEAN;
  v_loja_id uuid;
BEGIN
  SELECT c.loja_id INTO v_loja_id
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.id = p_venda_id
  LIMIT 1;

  IF v_loja_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'VENDA_CAIXA_INVALIDA'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = p_venda_id
        AND v.operador_id = auth.uid()
    ) THEN
      RETURN QUERY SELECT FALSE, 'VENDA_NAO_AUTORIZADA'::TEXT, NULL::NUMERIC;
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.estoque_baixas eb
    WHERE eb.venda_id = p_venda_id
      AND eb.produto_id = p_produto_id
  ) INTO v_baixa_existente;

  IF v_baixa_existente THEN
    SELECT e.quantidade_atual INTO v_quantidade_atual
    FROM public.estoque e
    WHERE e.produto_id = p_produto_id
      AND e.loja_id = v_loja_id;

    RETURN QUERY SELECT TRUE, 'BAIXA_JA_EXISTE'::TEXT, v_quantidade_atual;
    RETURN;
  END IF;

  SELECT e.quantidade_atual, e.version
  INTO v_quantidade_atual, v_version
  FROM public.estoque e
  WHERE e.produto_id = p_produto_id
    AND e.loja_id = v_loja_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'PRODUTO_NAO_ENCONTRADO_NO_ESTOQUE'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  IF v_quantidade_atual < p_quantidade THEN
    RETURN QUERY SELECT FALSE, 'ESTOQUE_INSUFICIENTE'::TEXT, v_quantidade_atual;
    RETURN;
  END IF;

  UPDATE public.estoque e
  SET
    quantidade_atual = e.quantidade_atual - p_quantidade,
    version = e.version + 1,
    updated_at = NOW()
  WHERE e.produto_id = p_produto_id
    AND e.loja_id = v_loja_id
    AND e.version = v_version;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'CONCORRENCIA_DETECTADA'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  INSERT INTO public.estoque_baixas (venda_id, produto_id)
  VALUES (p_venda_id, p_produto_id)
  ON CONFLICT (venda_id, produto_id) DO NOTHING;

  RETURN QUERY SELECT TRUE, 'SUCESSO'::TEXT, (v_quantidade_atual - p_quantidade);
END;
$$;

COMMENT ON FUNCTION public.decrementar_estoque_seguro IS
  'Decrementa estoque por loja do caixa da venda; idempotente por (venda_id, produto_id), sem dependência de coluna quantidade em estoque_baixas.';
