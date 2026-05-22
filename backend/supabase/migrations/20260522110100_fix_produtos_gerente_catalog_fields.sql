-- Preserve catalog edit fields in gerente product listings.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS quantidade_gatilho_atacado integer
    CHECK (quantidade_gatilho_atacado IS NULL OR quantidade_gatilho_atacado >= 1);

COMMENT ON COLUMN public.produtos.quantidade_gatilho_atacado IS
  'Quantidade mínima específica do produto para ativar preco_atacado; NULL usa o padrão global.';

DROP FUNCTION IF EXISTS public.list_produtos_gerente_filtrados(
  uuid, text, text, text, text, text, text[], uuid, uuid, uuid, text, int, int
);

CREATE FUNCTION public.list_produtos_gerente_filtrados(
  p_loja_id uuid,
  p_situacao text,
  p_origem_filtro text,
  p_nf_filtro text,
  p_estoque_filtro text,
  p_imagens_filtro text,
  p_tags_filtro text[],
  p_categoria_id uuid,
  p_marca_id uuid,
  p_fornecedor_id uuid,
  p_busca text,
  p_page int,
  p_page_size int
)
RETURNS TABLE (
  id uuid,
  nome text,
  codigo_barras text,
  preco_varejo numeric,
  preco_atacado numeric,
  quantidade_gatilho_atacado integer,
  origem text,
  tem_nf boolean,
  ativo boolean,
  categoria_id uuid,
  fornecedor_id uuid,
  marca_id uuid,
  unidade_medida text,
  observacao text,
  imagem_url text,
  tags text[],
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      pr.id,
      pr.nome,
      pr.codigo_barras,
      pr.preco_varejo,
      pr.preco_atacado,
      pr.quantidade_gatilho_atacado,
      pr.origem::text AS origem,
      pr.tem_nf,
      pr.ativo,
      pr.categoria_id,
      pr.fornecedor_id,
      pr.marca_id,
      pr.unidade_medida,
      pr.observacao,
      pr.imagem_url,
      pr.tags
    FROM public.produtos pr
    WHERE
      (p_situacao = 'todos' OR (p_situacao = 'ativos' AND pr.ativo) OR (p_situacao = 'inativos' AND NOT pr.ativo))
      AND (p_origem_filtro = 'all' OR pr.origem::text = p_origem_filtro)
      AND (
        p_nf_filtro = 'all'
        OR (p_nf_filtro = 'sim' AND pr.tem_nf)
        OR (p_nf_filtro = 'nao' AND NOT pr.tem_nf)
      )
      AND (
        p_estoque_filtro = 'todos'
        OR (
          p_estoque_filtro = 'abaixo_minimo'
          AND EXISTS (
            SELECT 1
            FROM public.estoque e
            WHERE e.produto_id = pr.id
              AND e.loja_id = p_loja_id
              AND e.quantidade_atual <= e.estoque_minimo
          )
        )
        OR (
          p_estoque_filtro = 'em_falta'
          AND EXISTS (
            SELECT 1
            FROM public.estoque e
            WHERE e.produto_id = pr.id
              AND e.loja_id = p_loja_id
              AND e.quantidade_atual <= 0::numeric
          )
        )
      )
      AND (
        p_imagens_filtro = 'todos'
        OR (
          p_imagens_filtro = 'com_imagem'
          AND pr.imagem_url IS NOT NULL
          AND btrim(pr.imagem_url) <> ''
        )
        OR (
          p_imagens_filtro = 'sem_imagem'
          AND (pr.imagem_url IS NULL OR btrim(pr.imagem_url) = '')
        )
      )
      AND (
        p_tags_filtro IS NULL
        OR cardinality(p_tags_filtro) = 0
        OR (COALESCE(pr.tags, '{}'::text[]) && p_tags_filtro)
      )
      AND (p_categoria_id IS NULL OR pr.categoria_id = p_categoria_id)
      AND (p_marca_id IS NULL OR pr.marca_id = p_marca_id)
      AND (p_fornecedor_id IS NULL OR pr.fornecedor_id = p_fornecedor_id)
      AND (
        p_busca IS NULL
        OR length(trim(p_busca)) = 0
        OR pr.nome ILIKE '%' || trim(p_busca) || '%'
        OR (pr.codigo_barras IS NOT NULL AND pr.codigo_barras ILIKE '%' || trim(p_busca) || '%')
        OR pr.id::text ILIKE '%' || trim(p_busca) || '%'
      )
  ),
  numbered AS (
    SELECT
      b.*,
      count(*) OVER () AS total_count
    FROM base b
  )
  SELECT
    n.id,
    n.nome,
    n.codigo_barras,
    n.preco_varejo,
    n.preco_atacado,
    n.quantidade_gatilho_atacado,
    n.origem,
    n.tem_nf,
    n.ativo,
    n.categoria_id,
    n.fornecedor_id,
    n.marca_id,
    n.unidade_medida,
    n.observacao,
    n.imagem_url,
    n.tags,
    n.total_count
  FROM numbered n
  ORDER BY n.nome ASC
  LIMIT greatest(coalesce(nullif(p_page_size, 0), 10), 1)
  OFFSET (greatest(coalesce(nullif(p_page, 0), 1), 1) - 1) * greatest(coalesce(nullif(p_page_size, 0), 10), 1);
$$;

COMMENT ON FUNCTION public.list_produtos_gerente_filtrados IS
  'Listagem paginada de produtos com filtros; inclui campos usados pela edição do catálogo.';

GRANT EXECUTE ON FUNCTION public.list_produtos_gerente_filtrados(
  uuid, text, text, text, text, text, text[], uuid, uuid, uuid, text, int, int
) TO authenticated;

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
  v_gatilho_produto numeric(10, 3);
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

  SELECT p.preco_varejo, p.preco_atacado, p.quantidade_gatilho_atacado
  INTO v_varejo, v_atacado_cat, v_gatilho_produto
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
     AND COALESCE(v_gatilho_produto, v_min_padrao) IS NOT NULL
     AND p_quantidade::numeric >= COALESCE(v_gatilho_produto, v_min_padrao) THEN
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
  'Preço unitário efetivo para quantidade no carrinho (faixas, gatilho do catálogo ou padrão global).';

REVOKE ALL ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO authenticated;
