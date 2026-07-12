-- Baixa de estoque idempotente por (venda_id, produto_id) — chamada pela Edge sync-outbox após venda.

CREATE TABLE IF NOT EXISTS public.estoque_baixas (
  venda_id uuid NOT NULL,
  produto_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venda_id, produto_id)
);

ALTER TABLE public.estoque_baixas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.estoque_baixas IS
  'Registro de baixas já aplicadas por venda+produto (idempotência). Edge Function usa service role.';

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
  'Decrementa estoque uma vez por par (venda_id, produto_id). Reprocessar sync não duplica baixa.';
