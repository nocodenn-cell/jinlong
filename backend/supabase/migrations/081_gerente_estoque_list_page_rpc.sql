-- Lista paginada de estoque do gerente (produtos ativos + estoque da loja).
-- SECURITY INVOKER: respeita RLS em `produtos` e `estoque`.
-- `p_visao`: `geral` (LEFT JOIN estoque — inclui produto sem linha) ou `critico` (só qtd <= mínimo, com linha).

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

COMMENT ON FUNCTION public.gerente_estoque_list_page(uuid, text, text, uuid, text, text, boolean, integer, integer) IS
  'Lista paginada produto+estoque por loja (visao geral ou critico). SECURITY INVOKER; RLS aplica nas tabelas base.';

REVOKE ALL ON FUNCTION public.gerente_estoque_list_page(uuid, text, text, uuid, text, text, boolean, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.gerente_estoque_list_page(uuid, text, text, uuid, text, text, boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerente_estoque_list_page(uuid, text, text, uuid, text, text, boolean, integer, integer) TO service_role;
