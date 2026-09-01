-- ID 40: RPC `calcular_preco_produto` passa a devolver `quantidade_minima` do
-- tier aplicado — necessário para a UI exibir "Atacado (min N)" sem duplicar
-- a lógica de seleção de faixa em uma segunda query. RPC continua a única
-- autoridade (D0-01); apenas mais um campo no jsonb já retornado.

BEGIN;

CREATE OR REPLACE FUNCTION public.calcular_preco_produto(
  p_produto_id uuid,
  p_quantidade integer,
  p_loja_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_varejo numeric(10, 2);
  r record;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'quantidade_invalida'
    );
  END IF;

  SELECT p.preco_varejo
  INTO v_varejo
  FROM public.produtos p
  WHERE p.id = p_produto_id AND p.ativo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'produto_nao_encontrado'
    );
  END IF;

  SELECT pa.preco_unitario, pa.id, pa.quantidade_minima
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
      'fonte', 'tier',
      'regra_id', r.id,
      'quantidade_minima', r.quantidade_minima
    );
  END IF;

  RETURN jsonb_build_object(
    'preco', v_varejo,
    'tipo', 'VAREJO',
    'fonte', 'varejo',
    'regra_id', NULL,
    'quantidade_minima', NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) IS
  'D0: resolve preço exclusivamente por tiers ativos de precos_atacado; sem tier aplicável retorna varejo. Configuração global e preco_atacado legado não participam do runtime. Retorna quantidade_minima do tier aplicado (ID 40) para exibição na UI.';

REVOKE ALL ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
