-- Busca por SKU (`produtos.codigo_interno`) no Catálogo e no Estoque.
--
-- PROBLEMA: a coluna "Produto" do Catálogo exibe o SKU (`codigo_interno`), mas a
-- busca das duas telas só procurava em nome / código de barras / id. O operador
-- via o SKU na tela e não conseguia encontrá-lo pela busca (o PDV, os pickers de
-- recebimento e de NF-e já buscavam por SKU).
--
-- ESCOPO MÍNIMO: só o predicado de busca ganha `OR codigo_interno ILIKE`. Nada
-- mais muda em nenhuma das duas funções.
--   * `list_produtos_gerente_filtrados`: mesma assinatura e mesmo RETURNS TABLE
--     da 20260902150000 -> `CREATE OR REPLACE` é suficiente (sem DROP), e o
--     Postgres preserva owner, GRANT/REVOKE e COMMENT existentes.
--   * `gerente_estoque_list_page`: idem, corpo da 081 + o novo predicado.
--
-- SEM impacto em dados e SEM DROP. Rollback: reaplicar os corpos originais
-- (20260902150000 e 081).

BEGIN;

CREATE OR REPLACE FUNCTION public.list_produtos_gerente_filtrados(
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
  p_page integer,
  p_page_size integer
)
RETURNS TABLE(
  id uuid, nome text, codigo_barras text, preco_varejo numeric,
  preco_atacado numeric, quantidade_gatilho_atacado integer, origem text,
  tem_nf boolean, ativo boolean, categoria_id uuid, fornecedor_id uuid,
  marca_id uuid, unidade_medida text, observacao text, imagem_url text,
  tags text[], total_count bigint,
  -- Hotfix C2.8: campos fiscais, propagados literalmente (sem COALESCE/default).
  ncm text, cfop_produto text, csosn text, cest text, cst_pis text,
  cst_cofins text, icms_origem text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $function$
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
      pr.tags,
      pr.ncm,
      pr.cfop_produto,
      pr.csosn,
      pr.cest,
      pr.cst_pis,
      pr.cst_cofins,
      pr.icms_origem
    FROM public.produtos pr
    WHERE
      -- Escopo de tenant: o produto tem de ser da loja pedida, e a loja pedida
      -- tem de ser a do próprio chamador (ADMIN pode consultar qualquer uma).
      pr.loja_id = p_loja_id
      AND (
        public.auth_usuario_eh_admin()
        OR p_loja_id = public.auth_usuario_loja_id()
      )
      AND (p_situacao = 'todos' OR (p_situacao = 'ativos' AND pr.ativo) OR (p_situacao = 'inativos' AND NOT pr.ativo))
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
        OR (pr.codigo_interno IS NOT NULL AND pr.codigo_interno ILIKE '%' || trim(p_busca) || '%')
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
    n.total_count,
    n.ncm,
    n.cfop_produto,
    n.csosn,
    n.cest,
    n.cst_pis,
    n.cst_cofins,
    n.icms_origem
  FROM numbered n
  ORDER BY n.nome ASC
  LIMIT greatest(coalesce(nullif(p_page_size, 0), 10), 1)
  OFFSET (greatest(coalesce(nullif(p_page, 0), 1), 1) - 1) * greatest(coalesce(nullif(p_page_size, 0), 10), 1);
$function$;

CREATE OR REPLACE FUNCTION public.gerente_estoque_list_page(
  p_loja_id uuid,
  p_visao text DEFAULT 'geral',
  p_busca text DEFAULT '',
  p_categoria_id uuid DEFAULT NULL,
  p_origem text DEFAULT '',
  p_ordem text DEFAULT 'nome',
  p_dir_asc boolean DEFAULT true,
  p_limite integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $func$
DECLARE
  v_ordem text;
  v_limite int;
  v_offset int;
BEGIN
  IF p_loja_id IS NULL THEN
    RAISE EXCEPTION 'p_loja_id obrigatorio';
  END IF;

  IF coalesce(trim(p_visao), '') NOT IN ('geral', 'critico') THEN
    RAISE EXCEPTION 'p_visao invalida';
  END IF;

  v_ordem := CASE trim(coalesce(p_ordem, ''))
    WHEN 'quantidade_atual' THEN 'quantidade_atual'
    WHEN 'estoque_minimo' THEN 'estoque_minimo'
    WHEN 'codigo_barras' THEN 'codigo_barras'
    WHEN 'deficit' THEN 'deficit'
    ELSE 'nome'
  END;

  v_limite := LEAST(GREATEST(coalesce(p_limite, 25), 1), 500);
  v_offset := GREATEST(coalesce(p_offset, 0), 0);

  RETURN (
    WITH base AS (
      SELECT
        p.id AS id,
        p.nome AS nome,
        p.codigo_barras AS codigo_barras,
        p.unidade_medida AS unidade_medida,
        p.origem AS origem,
        p.categoria_id AS categoria_id,
        e.id AS estoque_id,
        e.quantidade_atual AS quantidade_atual,
        e.estoque_minimo AS estoque_minimo,
        CASE
          WHEN e.id IS NULL THEN NULL::numeric
          ELSE GREATEST(e.estoque_minimo - e.quantidade_atual, 0::numeric)
        END AS deficit
      FROM public.produtos p
      LEFT JOIN public.estoque e
        ON e.produto_id = p.id AND e.loja_id = p_loja_id
      WHERE p.ativo = true
        AND (
          trim(coalesce(p_busca, '')) = ''
          OR p.nome ILIKE ('%' || trim(p_busca) || '%')
          OR COALESCE(p.codigo_barras, '') ILIKE ('%' || trim(p_busca) || '%')
          OR COALESCE(p.codigo_interno, '') ILIKE ('%' || trim(p_busca) || '%')
          OR replace(p.id::text, '-', '') ILIKE ('%' || regexp_replace(trim(p_busca), '-', '', 'g') || '%')
        )
        AND (
          p_categoria_id IS NULL OR p.categoria_id = p_categoria_id
        )
        AND (
          trim(coalesce(p_origem, '')) = '' OR p.origem = trim(p_origem)
        )
        AND (
          trim(p_visao) = 'geral'
          OR (
            trim(p_visao) = 'critico'
            AND e.id IS NOT NULL
            AND e.quantidade_atual <= e.estoque_minimo
          )
        )
    )
    SELECT jsonb_build_object(
      'total',
      (SELECT COUNT(*)::bigint FROM base),
      'rows',
      COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(t))
          FROM (
            SELECT
              base.id AS id,
              base.nome AS nome,
              base.codigo_barras AS codigo_barras,
              base.unidade_medida AS unidade_medida,
              base.origem AS origem,
              base.categoria_id AS categoria_id,
              base.estoque_id AS estoque_id,
              base.quantidade_atual AS quantidade_atual,
              base.estoque_minimo AS estoque_minimo,
              base.deficit AS deficit
            FROM base
            ORDER BY
              CASE WHEN v_ordem = 'nome' AND p_dir_asc THEN base.nome END ASC NULLS LAST,
              CASE WHEN v_ordem = 'nome' AND NOT p_dir_asc THEN base.nome END DESC NULLS LAST,
              CASE WHEN v_ordem = 'quantidade_atual' AND p_dir_asc THEN base.quantidade_atual END ASC NULLS LAST,
              CASE WHEN v_ordem = 'quantidade_atual' AND NOT p_dir_asc THEN base.quantidade_atual END DESC NULLS LAST,
              CASE WHEN v_ordem = 'estoque_minimo' AND p_dir_asc THEN base.estoque_minimo END ASC NULLS LAST,
              CASE WHEN v_ordem = 'estoque_minimo' AND NOT p_dir_asc THEN base.estoque_minimo END DESC NULLS LAST,
              CASE WHEN v_ordem = 'codigo_barras' AND p_dir_asc THEN base.codigo_barras END ASC NULLS LAST,
              CASE WHEN v_ordem = 'codigo_barras' AND NOT p_dir_asc THEN base.codigo_barras END DESC NULLS LAST,
              CASE WHEN v_ordem = 'deficit' AND p_dir_asc THEN base.deficit END ASC NULLS LAST,
              CASE WHEN v_ordem = 'deficit' AND NOT p_dir_asc THEN base.deficit END DESC NULLS LAST,
              base.nome ASC
            LIMIT v_limite OFFSET v_offset
          ) t
        ),
        '[]'::jsonb
      )
    )
  );
END;
$func$;

NOTIFY pgrst, 'reload schema';

COMMIT;
