-- Fechamento (20261119120000) recusa o caixa com venda EM_ESPERA ou RETOMADA.
-- `listar_vendas_em_espera` só devolvia EM_ESPERA. Depois de retomar, o pedido
-- sai da lista. Se o cupom some da tela (devolver falhou, outro navegador, dados
-- locais apagados), a linha fica RETOMADA: o fechamento é recusado e não há
-- botão para descartar.
--
-- A lista passa a incluir RETOMADA e devolve `status`. O app esconde a linha
-- que é o cupom atual e, nas outras, só oferece descarte — não devolve para
-- EM_ESPERA, senão um segundo terminal retomaria o mesmo pedido (anti double-sell).
-- Assinatura e grants inalterados.

CREATE OR REPLACE FUNCTION public.listar_vendas_em_espera()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'numero_local', v.numero_local,
          'rotulo', v.rotulo,
          'totais', v.totais,
          'qtd_itens', jsonb_array_length(v.itens),
          'criada_em', v.criada_em,
          'atualizada_em', v.atualizada_em,
          'status', v.status
        )
        ORDER BY v.atualizada_em DESC
      )
      FROM public.vendas_em_espera v
      WHERE v.operador_id = v_uid
        AND v.status IN ('EM_ESPERA', 'RETOMADA')
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.listar_vendas_em_espera() IS
  'Pedidos do operador em EM_ESPERA ou RETOMADA. RETOMADA bloqueia o fechamento e precisa aparecer para descarte.';
