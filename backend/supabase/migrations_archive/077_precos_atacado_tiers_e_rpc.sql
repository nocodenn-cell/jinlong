-- Faixas de preço atacado por produto (múltiplas por SKU) + RPC para o caixa web.

CREATE TABLE IF NOT EXISTS public.precos_atacado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos (id) ON DELETE CASCADE,
  loja_id uuid REFERENCES public.lojas (id) ON DELETE CASCADE,
  quantidade_minima integer NOT NULL CHECK (quantidade_minima >= 1),
  preco_unitario numeric(10, 2) NOT NULL CHECK (preco_unitario >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.precos_atacado IS
  'Faixas de preço atacado por quantidade; loja_id NULL = regra global.';

CREATE INDEX IF NOT EXISTS idx_precos_atacado_produto_ativo
  ON public.precos_atacado (produto_id, quantidade_minima DESC)
  WHERE ativo = true;

CREATE UNIQUE INDEX IF NOT EXISTS precos_atacado_global_prod_min
  ON public.precos_atacado (produto_id, quantidade_minima)
  WHERE loja_id IS NULL AND ativo = true;

CREATE UNIQUE INDEX IF NOT EXISTS precos_atacado_loja_prod_min
  ON public.precos_atacado (produto_id, loja_id, quantidade_minima)
  WHERE loja_id IS NOT NULL AND ativo = true;

ALTER TABLE public.precos_atacado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precos_atacado_leitura" ON public.precos_atacado;
CREATE POLICY "precos_atacado_leitura"
  ON public.precos_atacado FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "precos_atacado_escrita" ON public.precos_atacado;
CREATE POLICY "precos_atacado_escrita"
  ON public.precos_atacado FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

-- Retorna { preco, tipo } com tipo em 'VAREJO' | 'ATACADO'.
-- Prioridade: melhor faixa em precos_atacado (maior quantidade_minima aplicável);
-- senão catálogo produtos.preco_atacado + pdv_config.quantidade_minima_atacado_padrao;
-- senão preco_varejo.
CREATE OR REPLACE FUNCTION public.calcular_preco_produto(
  p_produto_id uuid,
  p_quantidade integer,
  p_loja_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_varejo numeric(10, 2);
  v_atacado_cat numeric(10, 2);
  v_min_padrao numeric(10, 3);
  r record;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'quantidade_invalida'
    );
  END IF;

  SELECT p.preco_varejo, p.preco_atacado
  INTO v_varejo, v_atacado_cat
  FROM public.produtos p
  WHERE p.id = p_produto_id AND p.ativo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'produto_nao_encontrado'
    );
  END IF;

  SELECT pa.preco_unitario, pa.id
  INTO r
  FROM public.precos_atacado pa
  WHERE pa.produto_id = p_produto_id
    AND pa.ativo = true
    AND pa.quantidade_minima <= p_quantidade
    AND (pa.loja_id IS NULL OR pa.loja_id = p_loja_id)
  ORDER BY pa.quantidade_minima DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'preco', r.preco_unitario,
      'tipo', 'ATACADO',
      'regra_id', r.id
    );
  END IF;

  SELECT c.quantidade_minima_atacado_padrao
  INTO v_min_padrao
  FROM public.pdv_config c
  WHERE c.id = 1
  LIMIT 1;

  IF v_atacado_cat IS NOT NULL
     AND v_min_padrao IS NOT NULL
     AND p_quantidade::numeric >= v_min_padrao THEN
    RETURN jsonb_build_object(
      'preco', v_atacado_cat,
      'tipo', 'ATACADO',
      'fonte', 'catalogo'
    );
  END IF;

  RETURN jsonb_build_object(
    'preco', v_varejo,
    'tipo', 'VAREJO',
    'fonte', 'varejo'
  );
END;
$$;

COMMENT ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) IS
  'Preço unitário efetivo para quantidade no carrinho (faixas precos_atacado ou catálogo atacado).';

REVOKE ALL ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO authenticated;
