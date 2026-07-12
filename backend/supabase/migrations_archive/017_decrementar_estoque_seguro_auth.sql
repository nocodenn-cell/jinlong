-- Endurecimento: decrementar_estoque_seguro (016) era SECURITY DEFINER sem validar o chamador.
-- Mesma regra da 015 em decrementar_estoque_idempotente: service_role (Edge) livre;
-- authenticated só se a venda pertencer ao operador (auth.uid()).

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
    v_baixa_existente UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RETURN QUERY SELECT FALSE, 'SESSAO_INVALIDA'::TEXT, NULL::NUMERIC;
      RETURN;
    END IF;
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

    SELECT eb.id INTO v_baixa_existente
    FROM estoque_baixas eb
    WHERE eb.venda_id = p_venda_id
      AND eb.produto_id = p_produto_id
    LIMIT 1;

    IF v_baixa_existente IS NOT NULL THEN
        SELECT e.quantidade_atual INTO v_quantidade_atual
        FROM estoque e
        WHERE e.produto_id = p_produto_id;

        RETURN QUERY SELECT TRUE, 'BAIXA_JA_EXISTE'::TEXT, v_quantidade_atual;
        RETURN;
    END IF;

    SELECT e.quantidade_atual, e.version
    INTO v_quantidade_atual, v_version
    FROM estoque e
    WHERE e.produto_id = p_produto_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'PRODUTO_NAO_ENCONTRADO_NO_ESTOQUE'::TEXT, NULL::NUMERIC;
        RETURN;
    END IF;

    IF v_quantidade_atual < p_quantidade THEN
        RETURN QUERY SELECT FALSE, 'ESTOQUE_INSUFICIENTE'::TEXT, v_quantidade_atual;
        RETURN;
    END IF;

    UPDATE estoque e
    SET
        quantidade_atual = e.quantidade_atual - p_quantidade,
        version = e.version + 1,
        updated_at = NOW()
    WHERE e.produto_id = p_produto_id
      AND e.version = v_version;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'CONCORRENCIA_DETECTADA'::TEXT, NULL::NUMERIC;
        RETURN;
    END IF;

    INSERT INTO estoque_baixas (venda_id, produto_id, quantidade)
    VALUES (p_venda_id, p_produto_id, p_quantidade);

    v_quantidade_atual := v_quantidade_atual - p_quantidade;

    RETURN QUERY SELECT TRUE, 'SUCESSO'::TEXT, v_quantidade_atual;
END;
$$;

COMMENT ON FUNCTION public.decrementar_estoque_seguro IS
'Decrementa estoque de forma atômica. Edge (service_role) sem checagem de venda; authenticated exige venda do operador.';
