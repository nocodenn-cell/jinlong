-- Harden Ordens de Compra RLS and make item replacement atomic.

ALTER TABLE public.ordens_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_compra_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oc_auth ON public.ordens_compra;
DROP POLICY IF EXISTS oci_auth ON public.ordens_compra_itens;
DROP POLICY IF EXISTS ordens_compra_gerencial ON public.ordens_compra;
DROP POLICY IF EXISTS ordens_compra_itens_gerencial ON public.ordens_compra_itens;

CREATE POLICY ordens_compra_gerencial
  ON public.ordens_compra
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = ordens_compra.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = ordens_compra.loja_id)
    )
  );

CREATE POLICY ordens_compra_itens_gerencial
  ON public.ordens_compra_itens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ordens_compra oc
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = oc.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ordens_compra oc
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = oc.loja_id)
    )
  );

CREATE OR REPLACE FUNCTION public.atualizar_ordem_compra_transacional(
  p_ordem_id uuid,
  p_fornecedor_id uuid,
  p_fornecedor_nome text,
  p_data_emissao date,
  p_data_prevista_chegada date,
  p_observacao text,
  p_itens jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH_REQUIRED';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'OC_ITENS_OBRIGATORIOS';
  END IF;

  SELECT oc.status
    INTO v_status
  FROM public.ordens_compra oc
  WHERE oc.id = p_ordem_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_status NOT IN ('RASCUNHO', 'CONFIRMADA') THEN
    RAISE EXCEPTION 'OC_STATUS_NAO_EDITAVEL';
  END IF;

  UPDATE public.ordens_compra
  SET
    fornecedor_id = p_fornecedor_id,
    fornecedor_nome = NULLIF(BTRIM(p_fornecedor_nome), ''),
    data_emissao = COALESCE(p_data_emissao, CURRENT_DATE),
    data_prevista_chegada = p_data_prevista_chegada,
    observacao = NULLIF(BTRIM(p_observacao), '')
  WHERE id = p_ordem_id;

  DELETE FROM public.ordens_compra_itens
  WHERE ordem_id = p_ordem_id;

  INSERT INTO public.ordens_compra_itens (
    ordem_id,
    produto_id,
    descricao,
    quantidade,
    preco_unitario,
    unidade_medida
  )
  SELECT
    p_ordem_id,
    NULLIF(item->>'produto_id', '')::uuid,
    NULLIF(BTRIM(item->>'descricao'), ''),
    (item->>'quantidade')::numeric,
    COALESCE((item->>'preco_unitario')::numeric, 0),
    COALESCE(NULLIF(BTRIM(item->>'unidade_medida'), ''), 'UN')
  FROM jsonb_array_elements(p_itens) item;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_ordem_compra_transacional(
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_ordem_compra_transacional(
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  jsonb
) TO authenticated;
