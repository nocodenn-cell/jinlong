-- Substitui o corpo legado de `decrementar_estoque_idempotente` (007/015) por delegação
-- a `decrementar_estoque_seguro` (016/038): mesmo contrato (uuid, numeric, uuid) -> void,
-- mas com SELECT FOR UPDATE + version + loja derivada da venda.
--
-- Motivo: a implementação antiga fazia UPDATE só por produto_id (sem loja) e sem lock —
-- risco em multi-loja e em concorrência. Nenhum fluxo versionado (web / sync-outbox) chama
-- esta RPC; mantém-se a assinatura para scripts legados ou smoke que ainda invocam o nome.

CREATE OR REPLACE FUNCTION public.decrementar_estoque_idempotente(
  p_produto_id uuid,
  p_quantidade numeric,
  p_venda_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_msg text;
BEGIN
  SELECT s.sucesso, s.mensagem
  INTO v_ok, v_msg
  FROM public.decrementar_estoque_seguro(
    p_produto_id,
    p_quantidade,
    p_venda_id
  ) AS s
  LIMIT 1;

  IF v_ok IS NULL THEN
    RAISE EXCEPTION 'decrementar_estoque_idempotente: resposta vazia de decrementar_estoque_seguro'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'decrementar_estoque_idempotente: %', COALESCE(v_msg, 'erro desconhecido')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.decrementar_estoque_idempotente(uuid, numeric, uuid) IS
  'Legado: delega a decrementar_estoque_seguro (lock + loja + idempotência). Preferir chamar decrementar_estoque_seguro diretamente em código novo.';
