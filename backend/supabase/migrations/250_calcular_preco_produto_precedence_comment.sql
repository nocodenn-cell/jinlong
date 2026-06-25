-- Migration 250: documenta formalmente a regra de precedência de preço na RPC.
--
-- Problema anterior:
--   Três fontes de preço coexistiam (precos_atacado, produtos.preco_atacado,
--   pdv_config) sem documentação sobre qual domina em caso de conflito.
--   A regra estava implícita no código PL/pgSQL — invisível para quem
--   adiciona novas fontes ou modifica a lógica de cálculo.
--
-- Esta migration não altera lógica — apenas torna a regra explícita e
-- localizável via `\df+ calcular_preco_produto` ou através de
--   SELECT pg_catalog.obj_description('public.calcular_preco_produto(uuid,integer,uuid)'::regprocedure);

COMMENT ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) IS
$$
Preço unitário efetivo para quantidade no carrinho.
SECURITY DEFINER: necessário para acessar pdv_config (revogado de authenticated na migration 058).

REGRA DE PRECEDÊNCIA (ordem decrescente de prioridade):

  1. precos_atacado (tiers por produto/loja)
     Condição: ativo=true AND quantidade_minima <= p_quantidade
     Desempate: maior quantidade_minima vence (tier mais específico)
     Resultado: { preco: tier.preco_unitario, tipo: ATACADO, regra_id: tier.id }

  2. produtos.preco_atacado + pdv_config.quantidade_minima_atacado_padrao
     Condição: preco_atacado IS NOT NULL
              AND pdv_config.quantidade_minima_atacado_padrao IS NOT NULL
              AND p_quantidade >= quantidade_minima_atacado_padrao
     Resultado: { preco: produto.preco_atacado, tipo: ATACADO, fonte: catalogo }

  3. produtos.preco_varejo (fallback incondicional)
     Resultado: { preco: produto.preco_varejo, tipo: VAREJO, fonte: varejo }

REGRA DE CONFLITO:
  Quando precos_atacado tem entrada para o produto, ela SEMPRE vence sobre
  produtos.preco_atacado, independente de qual valor é menor.
  A precedência é por fonte, não por valor.

ADICIONANDO UMA NOVA FONTE:
  - Insira a lógica ANTES do fallback preco_varejo (item 3)
  - Atribua prioridade explícita (não dependa de ordem de IF)
  - Atualize shared-core/src/pricing/resolution.ts (PRICE_RESOLUTION_CHAIN)
  - Crie nova migration ≥ 246
$$;
