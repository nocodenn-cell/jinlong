-- Subsistema de Comissões: RPC para marcar comissões como pagas.
-- Retorna o número de linhas atualizadas.

CREATE OR REPLACE FUNCTION public.marcar_comissoes_pagas(
  p_loja_id      UUID,
  p_vendedor_id  UUID,
  p_data_inicio  DATE,
  p_data_fim     DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.comissoes_vendedores cv
     SET status   = 'pago',
         pago_em  = now()
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id
   WHERE cv.venda_id      = v.id
     AND cv.loja_id       = p_loja_id
     AND c.loja_id        = p_loja_id
     AND cv.vendedor_id   = p_vendedor_id
     AND cv.status        = 'pendente'
     AND v.data::DATE BETWEEN p_data_inicio AND p_data_fim;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_comissoes_pagas(UUID, UUID, DATE, DATE)
  TO authenticated;
