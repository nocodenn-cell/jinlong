-- Migration 250: simetriza o contrato de saída de calcular_preco_produto.
--
-- Motivação:
--   Os três ramos de retorno eram assimétricos:
--     * tier      → { preco, tipo, regra_id }            (sem 'fonte')
--     * catálogo  → { preco, tipo, fonte:'catalogo' }    (sem 'regra_id')
--     * varejo    → { preco, tipo, fonte:'varejo' }      (sem 'regra_id')
--   Consumidores precisavam inferir 'fonte' pela presença de 'regra_id'
--   (ver normalizePriceRpcResponse em shared-core/src/pricing/resolution.ts).
--
-- Mudança (estritamente aditiva, NÃO-interpretativa):
--   Todo retorno passa a expor { preco, tipo, fonte, regra_id }.
--   'fonte' e 'regra_id' já SÃO saída do engine — apenas estavam omitidos em
--   alguns ramos. Nenhuma lógica de preço é alterada.
--
-- Garantias de compatibilidade:
--   * 'preco' e 'tipo' permanecem idênticos em todos os ramos → comportamento
--     de cálculo e as asserções de finalização (parseCalcularPrecoProdutoRpc)
--     ficam inalterados.
--   * Chaves adicionadas são lidas por nome pelos parsers; chaves desconhecidas
--     já eram ignoradas → compatibilidade total no frontend.
--   * A RPC permanece APENAS motor de preço: não retorna threshold, quantidade
--     nem estado de decisão (explicabilidade fica fora da RPC, por desenho).
--
-- Ramos de erro (quantidade_invalida, produto_nao_encontrado) ficam intocados.

CREATE OR REPLACE FUNCTION public.calcular_preco_produto(
  p_produto_id uuid,
  p_quantidade integer,
  p_loja_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
      'fonte', 'tier',
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
      'fonte', 'catalogo',
      'regra_id', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'preco', v_varejo,
    'tipo', 'VAREJO',
    'fonte', 'varejo',
    'regra_id', NULL
  );
END;
$$;

COMMENT ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) IS
$$
Preço unitário efetivo para quantidade no carrinho.
SECURITY DEFINER: necessário para acessar pdv_config (revogado de authenticated na migration 058).

CONTRATO DE SAÍDA (migration 250 — simétrico em todos os ramos de sucesso):
  { preco, tipo, fonte, regra_id }
    * fonte: 'tier' | 'catalogo' | 'varejo'
    * regra_id: id da faixa precos_atacado quando fonte='tier'; caso contrário NULL
  Ramos de erro: { preco: NULL, tipo, erro }
  A RPC é APENAS motor de preço — não expõe threshold, quantidade ou estado.

REGRA DE PRECEDÊNCIA (ordem decrescente de prioridade):

  1. precos_atacado (tiers por produto/loja)
     Condição: ativo=true AND quantidade_minima <= p_quantidade
     Desempate: maior quantidade_minima vence (tier mais específico)
     Resultado: { preco: tier.preco_unitario, tipo: ATACADO, fonte: tier, regra_id: tier.id }

  2. produtos.preco_atacado + pdv_config.quantidade_minima_atacado_padrao
     Condição: preco_atacado IS NOT NULL
              AND pdv_config.quantidade_minima_atacado_padrao IS NOT NULL
              AND p_quantidade >= quantidade_minima_atacado_padrao
     Resultado: { preco: produto.preco_atacado, tipo: ATACADO, fonte: catalogo, regra_id: NULL }

  3. produtos.preco_varejo (fallback incondicional)
     Resultado: { preco: produto.preco_varejo, tipo: VAREJO, fonte: varejo, regra_id: NULL }
$$;

-- Manter grants idênticos à migration 077/234 (idempotente).
REVOKE ALL ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO service_role;
