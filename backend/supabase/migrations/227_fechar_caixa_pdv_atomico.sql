-- RPC fechar_caixa_pdv_atomico: fechamento atômico para sync-outbox (PDV local).
-- Diferente de fechar_caixa_atomico (207): não exige auth.uid(); recebe p_caixa_id explícito.
-- FOR UPDATE + calcular_valor_sistema_dinheiro_caixa + UPDATE na mesma transação.

CREATE OR REPLACE FUNCTION public.fechar_caixa_pdv_atomico(
  p_caixa_id         uuid,
  p_valor_contado    numeric,
  p_observacao       text DEFAULT NULL,
  p_data_fechamento  timestamptz DEFAULT NULL
)
RETURNS TABLE (
  o_caixa_id      uuid,
  o_valor_sistema numeric(10,2),
  o_valor_contado numeric(10,2),
  o_diferenca     numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caixa_id       uuid;
  v_valor_sistema  numeric(10,2);
  v_diferenca      numeric(10,2);
  v_motivo         text;
  v_data_fech      timestamptz;
BEGIN
  IF p_caixa_id IS NULL THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_PDV_ID_OBRIGATORIO';
  END IF;

  SELECT c.id
  INTO   v_caixa_id
  FROM   public.caixas c
  WHERE  c.id     = p_caixa_id
    AND  c.status = 'ABERTO'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_PDV_NAO_ENCONTRADO';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM   public.movimentacoes_caixa m
    WHERE  m.caixa_id   = v_caixa_id
      AND  m.status     = 'pendente'
      AND  m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_PDV_MOVIMENTACOES_PENDENTES';
  END IF;

  v_valor_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  v_diferenca     := ROUND(p_valor_contado - v_valor_sistema, 2);
  v_motivo        := TRIM(COALESCE(p_observacao, ''));
  v_data_fech     := COALESCE(p_data_fechamento, now());

  UPDATE public.caixas
  SET
    status                = 'FECHADO',
    data_fechamento       = v_data_fech,
    valor_fechamento      = ROUND(p_valor_contado, 2),
    fechamento_diferenca  = v_diferenca,
    fechamento_observacao = NULLIF(v_motivo, '')
  WHERE id = v_caixa_id;

  RETURN QUERY
  SELECT
    v_caixa_id,
    v_valor_sistema,
    ROUND(p_valor_contado, 2)::numeric(10,2),
    v_diferenca;
END;
$$;

REVOKE ALL ON FUNCTION public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz) IS
  'Fecha caixa do PDV/sync: FOR UPDATE + cálculo + UPDATE em transação única. Sem auth.uid().';
