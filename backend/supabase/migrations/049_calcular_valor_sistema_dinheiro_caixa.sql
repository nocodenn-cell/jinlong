-- Fonte única (SQL) para o valor esperado em dinheiro no caixa, alinhada a:
-- pdv-importados/app/caixa/actions.ts (legado) + subtração de devoluções em DINHEIRO (048).
--
-- SECURITY DEFINER: agrega também public.movimentos_caixa, que só tem SELECT amplo para perfis
-- gerenciais em RLS — por isso a função valida se o chamador pode ver o caixa (operador do caixa
-- ou GERENTE/DONO/ADMIN da mesma loja). Chamadas com service_role (auth.uid() nulo) não validam.

CREATE OR REPLACE FUNCTION public.calcular_valor_sistema_dinheiro_caixa(p_caixa_id uuid)
RETURNS numeric(10,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result numeric(10,2);
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = p_caixa_id
        AND c.loja_id = u.loja_id
        AND (
          c.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    ) THEN
      RAISE EXCEPTION 'Acesso negado ao caixa informado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH vendas_din AS (
    SELECT COALESCE(SUM(v.total_liquido), 0)::numeric(10,2) AS t
    FROM public.vendas v
    WHERE v.caixa_id = p_caixa_id
      AND v.forma_pagamento = 'DINHEIRO'
      AND v.status = 'CONCLUIDA'
  ),
  mov_legado AS (
    SELECT
      COALESCE(SUM(CASE WHEN m.tipo = 'SUPRIMENTO' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sup,
      COALESCE(SUM(CASE WHEN m.tipo = 'SANGRIA' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sang
    FROM public.movimentos_caixa m
    WHERE m.caixa_id = p_caixa_id
      AND m.tipo IN ('SUPRIMENTO', 'SANGRIA')
  ),
  mov_tx AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN m.tipo = 'suprimento' AND m.forma_pagamento = 'dinheiro' THEN m.valor
        WHEN m.tipo = 'sangria' THEN -m.valor
        WHEN m.tipo = 'estorno' AND orig.tipo = 'sangria' THEN m.valor
        WHEN m.tipo = 'estorno'
          AND orig.tipo = 'suprimento'
          AND orig.forma_pagamento = 'dinheiro' THEN -m.valor
        ELSE 0::numeric(10,2)
      END
    ), 0)::numeric(10,2) AS t
    FROM public.movimentacoes_caixa m
    LEFT JOIN public.movimentacoes_caixa orig ON orig.id = m.movimentacao_origem_id
    WHERE m.caixa_id = p_caixa_id
      AND m.status = 'aprovado'
      AND m.deleted_at IS NULL
  ),
  dev_din AS (
    SELECT COALESCE(SUM(d.valor), 0)::numeric(10,2) AS t
    FROM public.devolucoes d
    INNER JOIN public.vendas v ON v.id = d.venda_id
    WHERE v.caixa_id = p_caixa_id
      AND d.forma_pagamento = 'DINHEIRO'
  ),
  abertura AS (
    SELECT COALESCE(c.valor_inicial, 0)::numeric(10,2) AS t
    FROM public.caixas c
    WHERE c.id = p_caixa_id
  )
  SELECT
    ROUND(
      COALESCE((SELECT t FROM abertura), 0)
      + (SELECT t FROM vendas_din)
      + (SELECT sup FROM mov_legado)
      - (SELECT sang FROM mov_legado)
      + (SELECT t FROM mov_tx)
      - (SELECT t FROM dev_din),
      2
    )::numeric(10,2)
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calcular_valor_sistema_dinheiro_caixa(uuid) IS
  'Valor esperado em dinheiro no caixa: valor_inicial + vendas DINHEIRO CONCLUIDA + suprimentos legado - sangrias legado + movimentacoes_caixa aprovadas (regra de estorno) - devolucoes em DINHEIRO. Exige permissão no caixa quando auth.uid() está definido.';

REVOKE ALL ON FUNCTION public.calcular_valor_sistema_dinheiro_caixa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_valor_sistema_dinheiro_caixa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_valor_sistema_dinheiro_caixa(uuid) TO service_role;
