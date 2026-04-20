-- Kardex unificado (read-model): eventos de movimentação de estoque a partir de várias fontes.
-- Origens: movimentos_estoque_log (remessa, transferência, ajuste), estoque_baixas (saída venda),
--          estoque_reposicoes_cancelamento (entrada por cancelamento de venda).
-- Observação: quantidade_delta > 0 = entrada; < 0 = saída. A view usa security_invoker (RLS das tabelas base).

DROP VIEW IF EXISTS public.v_kardex_unificado;

CREATE VIEW public.v_kardex_unificado
WITH (security_invoker = true)
AS
SELECT
  ('mel:' || m.id::text)::text AS evento_id,
  m.created_at AS ocorrido_em,
  m.loja_id,
  m.produto_id,
  m.quantidade_delta,
  'movimentos_estoque_log'::text AS origem,
  m.tipo_codigo,
  m.id AS referencia_id,
  m.usuario_id,
  m.observacao
FROM public.movimentos_estoque_log m

UNION ALL

SELECT
  ('eb:' || eb.venda_id::text || ':' || eb.produto_id::text)::text AS evento_id,
  eb.created_at AS ocorrido_em,
  c.loja_id,
  eb.produto_id,
  (-COALESCE(eb.quantidade, ivsum.qtd, 0::numeric))::numeric(10, 3) AS quantidade_delta,
  'estoque_baixas'::text AS origem,
  'SAIDA_VENDA'::text AS tipo_codigo,
  eb.venda_id AS referencia_id,
  v.operador_id AS usuario_id,
  NULL::text AS observacao
FROM public.estoque_baixas eb
INNER JOIN public.vendas v ON v.id = eb.venda_id
INNER JOIN public.caixas c ON c.id = v.caixa_id
LEFT JOIN LATERAL (
  SELECT SUM(iv.quantidade)::numeric(10, 3) AS qtd
  FROM public.itens_venda iv
  WHERE iv.venda_id = eb.venda_id
    AND iv.produto_id = eb.produto_id
) ivsum ON true

UNION ALL

SELECT
  ('erc:' || erc.venda_id::text || ':' || erc.produto_id::text)::text AS evento_id,
  erc.created_at AS ocorrido_em,
  c.loja_id,
  erc.produto_id,
  erc.quantidade AS quantidade_delta,
  'estoque_reposicoes_cancelamento'::text AS origem,
  'ENTRADA_CANCELAMENTO_VENDA'::text AS tipo_codigo,
  erc.venda_id AS referencia_id,
  vca.operador_id AS usuario_id,
  vca.motivo AS observacao
FROM public.estoque_reposicoes_cancelamento erc
INNER JOIN public.vendas v ON v.id = erc.venda_id
INNER JOIN public.caixas c ON c.id = v.caixa_id
LEFT JOIN public.vendas_canceladas_auditoria vca ON vca.venda_id = erc.venda_id;

COMMENT ON VIEW public.v_kardex_unificado IS
  'Kardex lógico: UNION de movimentos_estoque_log, baixas de venda e reposições por cancelamento. '
  'Não substitui auditoria fiscal; para volume muito alto, avalie MATERIALIZED VIEW + REFRESH.';

GRANT SELECT ON public.v_kardex_unificado TO authenticated;
GRANT SELECT ON public.v_kardex_unificado TO service_role;
