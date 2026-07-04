/**
 * Migration 256: RPC criar_produto_com_tier_atomico
 *
 * OBJETIVO: Criar produto + estoque + tier atomicamente em uma única transação.
 *
 * CONTRATO:
 * - Input: 3 parâmetros JSONB (p_product_data, p_tier_data, p_loja_id)
 * - Output: JSON { id: UUID } ou error no exception handler
 * - Assinatura: PERMANECE ESTÁVEL nas Fases 1-4
 *
 * IMPLEMENTAÇÃO INTERNA:
 * - Fase 1-3: Insere NULL em preco_atacado, quantidade_gatilho_atacado
 * - Fase 2+: Pode adicionar novos campos em JSONB (p_product_data)
 * - Fase 4: DROP COLUMN legado (RPC continua funcionando)
 */

-- ============================================================================
-- RPC: criar_produto_com_tier_atomico
-- ============================================================================

CREATE OR REPLACE FUNCTION public.criar_produto_com_tier_atomico(
  p_product_data JSONB,
  p_tier_data JSONB,
  p_loja_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto_id UUID;
  v_tier_id UUID;
BEGIN
  -- ============================================================================
  -- STEP 1: Inserir Produto
  -- ============================================================================
  -- Campos legados (preco_atacado, quantidade_gatilho_atacado) sempre NULL
  -- pois a representação canônica é precos_atacado (tier)

  INSERT INTO public.produtos (
    nome,
    codigo_barras,
    preco_varejo,
    preco_custo,
    categoria_id,
    fornecedor_id,
    marca_id,
    unidade_medida,
    observacao,
    ncm,
    permitir_abaixo_custo,
    origem,
    tem_nf,
    ativo,
    status_publicacao,
    -- Legacy fields: ALWAYS NULL (canonical source is precos_atacado)
    preco_atacado,
    quantidade_gatilho_atacado,
    created_at,
    updated_at
  ) VALUES (
    (p_product_data->>'nome')::VARCHAR,
    (p_product_data->>'codigo_barras')::VARCHAR,
    (p_product_data->>'preco_varejo')::NUMERIC,
    CASE
      WHEN p_product_data->>'preco_custo' IS NOT NULL
      THEN (p_product_data->>'preco_custo')::NUMERIC
      ELSE NULL
    END,
    CASE
      WHEN p_product_data->>'categoria_id' IS NOT NULL
      THEN (p_product_data->>'categoria_id')::UUID
      ELSE NULL
    END,
    CASE
      WHEN p_product_data->>'fornecedor_id' IS NOT NULL
      THEN (p_product_data->>'fornecedor_id')::UUID
      ELSE NULL
    END,
    CASE
      WHEN p_product_data->>'marca_id' IS NOT NULL
      THEN (p_product_data->>'marca_id')::UUID
      ELSE NULL
    END,
    (p_product_data->>'unidade_medida')::VARCHAR,
    (p_product_data->>'observacao')::TEXT,
    (p_product_data->>'ncm')::VARCHAR,
    COALESCE((p_product_data->>'permitir_abaixo_custo')::BOOLEAN, FALSE),
    (p_product_data->>'origem')::VARCHAR,
    COALESCE((p_product_data->>'tem_nf')::BOOLEAN, FALSE),
    COALESCE((p_product_data->>'ativo')::BOOLEAN, TRUE),
    COALESCE((p_product_data->>'status_publicacao')::VARCHAR, 'DRAFT'),
    -- Legacy: ALWAYS NULL
    NULL,
    NULL,
    NOW(),
    NOW()
  ) RETURNING id INTO v_produto_id;

  -- ============================================================================
  -- STEP 2: Inserir Estoque
  -- ============================================================================
  INSERT INTO public.estoque (
    produto_id,
    loja_id,
    quantidade_atual,
    estoque_minimo,
    created_at,
    updated_at
  ) VALUES (
    v_produto_id,
    p_loja_id,
    0,
    0,
    NOW(),
    NOW()
  );

  -- ============================================================================
  -- STEP 3: Inserir Tier (precos_atacado)
  -- ============================================================================
  -- Tier é a representação canônica de todas as políticas comerciais
  INSERT INTO public.precos_atacado (
    produto_id,
    loja_id,
    quantidade_minima,
    preco_unitario,
    ativo,
    permitir_abaixo_custo,
    created_at,
    updated_at
  ) VALUES (
    v_produto_id,
    p_loja_id,
    (p_tier_data->>'quantidade_minima')::INT,
    (p_tier_data->>'preco_unitario')::NUMERIC,
    COALESCE((p_tier_data->>'ativo')::BOOLEAN, TRUE),
    COALESCE((p_tier_data->>'permitir_abaixo_custo')::BOOLEAN, FALSE),
    NOW(),
    NOW()
  ) RETURNING id INTO v_tier_id;

  -- ============================================================================
  -- RETURN: Sucesso
  -- ============================================================================
  RETURN JSON_BUILD_OBJECT(
    'success', TRUE,
    'id', v_produto_id
  );

EXCEPTION WHEN OTHERS THEN
  -- Rollback automático: nenhum INSERT foi efetivado
  RETURN JSON_BUILD_OBJECT(
    'success', FALSE,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

-- ============================================================================
-- Permissions
-- ============================================================================

-- Grant to authenticated users (who have loja context via RLS)
GRANT EXECUTE ON FUNCTION public.criar_produto_com_tier_atomico(JSONB, JSONB, UUID)
  TO authenticated;

-- Grant to service role (for migrations, seeds)
GRANT EXECUTE ON FUNCTION public.criar_produto_com_tier_atomico(JSONB, JSONB, UUID)
  TO service_role;

-- ============================================================================
-- Commentary
-- ============================================================================

COMMENT ON FUNCTION public.criar_produto_com_tier_atomico(JSONB, JSONB, UUID) IS
'Cria produto com tier de forma atômica. Garante que todo produto tem exatamente um tier em precos_atacado. Signature permanece estável (3 JSONB params), implementação interna evolui em Fases 2-4.';
