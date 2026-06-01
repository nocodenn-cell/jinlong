-- Backfill único de comissões para vendas já CONCLUIDA antes da 214 entrar.
--
-- DEPENDÊNCIA: aplicar DEPOIS de 213 (configuracoes_gerais) e 214 (comissoes_vendedores
--   + colunas produtos.comissao_*). Reproduz EXATAMENTE a lógica de fn_registrar_comissao:
--     - loja resolvida por vendas.caixa_id -> caixas.loja_id (vendas NÃO tem loja_id)
--     - por item: override produto (percentual/fixo) senão taxa global comissao_padrao_percentual
--     - ROUND por item, depois SUM; valor_comissao = GREATEST(0, soma)
--
-- Idempotente e seguro de re-rodar:
--     - só processa status='CONCLUIDA' com operador e loja resolvíveis
--     - NOT EXISTS + ON CONFLICT (venda_id, operador_id) DO NOTHING => não duplica nem
--       sobrescreve comissões já registradas pelo trigger
--     - vendas sem itens não geram linha (comissão seria 0); ficam de fora por design
--
-- Em build do zero (db reset) não há histórico => no-op.

WITH taxa AS (
  SELECT COALESCE(
    (SELECT valor::numeric FROM public.configuracoes_gerais
      WHERE chave = 'comissao_padrao_percentual' LIMIT 1),
    0
  ) AS global_pct
),
elegiveis AS (
  SELECT v.id AS venda_id, v.operador_id, c.loja_id
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.status = 'CONCLUIDA'
    AND v.operador_id IS NOT NULL
    AND c.loja_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes_vendedores cv
      WHERE cv.venda_id = v.id AND cv.operador_id = v.operador_id
    )
),
itens AS (
  SELECT
    e.venda_id,
    e.operador_id,
    e.loja_id,
    (iv.quantidade * iv.preco_unitario)::numeric(14,2) AS base_item,
    CASE
      WHEN p.comissao_tipo = 'percentual' AND p.comissao_valor IS NOT NULL
        THEN ROUND(iv.quantidade * iv.preco_unitario * p.comissao_valor / 100.0, 2)
      WHEN p.comissao_tipo = 'fixo' AND p.comissao_valor IS NOT NULL
        THEN ROUND(p.comissao_valor * iv.quantidade, 2)
      ELSE ROUND(iv.quantidade * iv.preco_unitario * t.global_pct / 100.0, 2)
    END AS com_item
  FROM elegiveis e
  JOIN public.itens_venda iv ON iv.venda_id = e.venda_id
  JOIN public.produtos p     ON p.id = iv.produto_id
  CROSS JOIN taxa t
),
agg AS (
  SELECT
    venda_id,
    operador_id,
    loja_id,
    ROUND(SUM(base_item), 2)::numeric(14,2)             AS base_calculo,
    GREATEST(0, ROUND(SUM(com_item), 2))::numeric(14,2) AS valor_comissao
  FROM itens
  GROUP BY venda_id, operador_id, loja_id
)
INSERT INTO public.comissoes_vendedores (
  venda_id, operador_id, loja_id, valor_comissao, base_calculo, status
)
SELECT venda_id, operador_id, loja_id, valor_comissao, base_calculo, 'pendente'
FROM agg
ON CONFLICT (venda_id, operador_id) DO NOTHING;
