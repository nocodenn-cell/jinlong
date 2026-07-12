-- Endurecimento: RPCs SECURITY DEFINER não devem ser invocáveis por qualquer JWT `authenticated`.
--
-- 1) registrar_venda_com_itens: apenas service_role (Edge sync-outbox). O app web não chama esta RPC.
-- 2) decrementar_estoque_idempotente: service_role (Edge) OU operador dono da venda (caixa web).

CREATE OR REPLACE FUNCTION public.decrementar_estoque_idempotente(
  p_produto_id uuid,
  p_quantidade numeric,
  p_venda_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'decrementar_estoque: sessão inválida';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = p_venda_id
        AND v.operador_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'decrementar_estoque: venda inexistente ou não pertence ao operador';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.estoque_baixas
    WHERE venda_id = p_venda_id AND produto_id = p_produto_id
  ) THEN
    RETURN;
  END IF;

  UPDATE public.estoque
  SET
    quantidade_atual = quantidade_atual - p_quantidade,
    updated_at = now()
  WHERE produto_id = p_produto_id;

  INSERT INTO public.estoque_baixas (venda_id, produto_id)
  VALUES (p_venda_id, p_produto_id);
END;
$$;

COMMENT ON FUNCTION public.decrementar_estoque_idempotente IS
  'Decrementa estoque uma vez por par (venda_id, produto_id). Chamável por service_role (Edge) ou pelo operador dono da venda.';

REVOKE ALL ON FUNCTION public.decrementar_estoque_idempotente(uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrementar_estoque_idempotente(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrementar_estoque_idempotente(uuid, numeric, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.registrar_venda_com_itens(
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
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_venda_com_itens(
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
) FROM authenticated;
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
) TO service_role;
