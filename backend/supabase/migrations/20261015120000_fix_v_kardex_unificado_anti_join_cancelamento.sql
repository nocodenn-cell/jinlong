-- Fix: v_kardex_unificado duplicava o estorno de cancelamento de venda.
-- Desde SSOT-04 (303), cancelar_venda grava o delta em movimentos_estoque_log
-- (tipo ENTRADA_DEVOLUCAO_CLIENTE, observacao 'cancelamento de venda | ...')
-- E em estoque_reposicoes_cancelamento; o ramo erc da view não tinha
-- anti-join (dívida registrada na 20260828110000).
--
-- Visto em /admin/estoque/movimentacoes: "Devolução de cliente +3" e
-- "Estorno de venda cancelada +3" no mesmo instante. Confirmado em produção
-- (2026-10-15): 4 pares (venda, produto) duplicados; estoque.quantidade_atual
-- bate com o log físico — saldo não corrompeu, só o kardex exibido.
--
-- Matcher: mesmo (venda_id, produto_id), tipo ENTRADA_DEVOLUCAO_CLIENTE e
-- observacao com prefixo 'cancelamento de venda' (devoluções parciais
-- gravam 'devolucao | operacao=…'/'troca | …' e continuam separadas).
-- Cancelamentos pré-SSOT-04 (só erc) seguem no fallback.

BEGIN;

CREATE OR REPLACE VIEW public.v_kardex_unificado
WITH (security_invoker = true) AS
SELECT
  'mel:' || m.id::text AS evento_id,
  m.created_at AS ocorrido_em,
  m.loja_id,
  m.produto_id,
  m.quantidade_delta,
  'movimentos_estoque_log' AS origem,
  m.tipo_codigo,
  COALESCE(m.venda_id, m.id) AS referencia_id,
  m.usuario_id,
  m.observacao
FROM movimentos_estoque_log m
UNION ALL
SELECT
  'eb:' || eb.venda_id::text || ':' || eb.produto_id::text AS evento_id,
  eb.created_at AS ocorrido_em,
  c.loja_id,
  eb.produto_id,
  (- COALESCE(NULLIF(eb.quantidade, 0), ivsum.qtd, 0::numeric))::numeric(10,3) AS quantidade_delta,
  'estoque_baixas' AS origem,
  'SAIDA_VENDA' AS tipo_codigo,
  eb.venda_id AS referencia_id,
  v.operador_id AS usuario_id,
  NULL::text AS observacao
FROM estoque_baixas eb
JOIN vendas v ON v.id = eb.venda_id
JOIN caixas c ON c.id = v.caixa_id
LEFT JOIN LATERAL (
  SELECT sum(iv.quantidade)::numeric(10,3) AS qtd
  FROM itens_venda iv
  WHERE iv.venda_id = eb.venda_id AND iv.produto_id = eb.produto_id
) ivsum ON true
WHERE NOT EXISTS (
  SELECT 1 FROM movimentos_estoque_log mel
  WHERE mel.venda_id = eb.venda_id AND mel.produto_id = eb.produto_id AND mel.tipo_codigo = 'SAIDA_VENDA'
)
UNION ALL
SELECT
  'erc:' || erc.venda_id::text || ':' || erc.produto_id::text AS evento_id,
  erc.created_at AS ocorrido_em,
  c.loja_id,
  erc.produto_id,
  erc.quantidade AS quantidade_delta,
  'estoque_reposicoes_cancelamento' AS origem,
  'ENTRADA_CANCELAMENTO_VENDA' AS tipo_codigo,
  erc.venda_id AS referencia_id,
  vca.operador_id AS usuario_id,
  vca.motivo AS observacao
FROM estoque_reposicoes_cancelamento erc
JOIN vendas v ON v.id = erc.venda_id
JOIN caixas c ON c.id = v.caixa_id
LEFT JOIN vendas_canceladas_auditoria vca ON vca.venda_id = erc.venda_id
WHERE NOT EXISTS (
  SELECT 1
  FROM movimentos_estoque_log mel
  WHERE mel.venda_id = erc.venda_id
    AND mel.produto_id = erc.produto_id
    AND mel.tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'
    AND COALESCE(mel.observacao, '') LIKE 'cancelamento de venda%'
)
UNION ALL
SELECT
  'erd:' || erd.operacao_id::text || ':' || erd.produto_id::text AS evento_id,
  erd.created_at AS ocorrido_em,
  c.loja_id,
  erd.produto_id,
  erd.quantidade AS quantidade_delta,
  'estoque_reposicoes_devolucao' AS origem,
  'ENTRADA_DEVOLUCAO_CLIENTE' AS tipo_codigo,
  o.venda_id AS referencia_id,
  o.operador_id AS usuario_id,
  o.motivo AS observacao
FROM estoque_reposicoes_devolucao erd
JOIN venda_pos_venda_operacoes o ON o.id = erd.operacao_id
JOIN caixas c ON c.id = o.caixa_id
WHERE NOT EXISTS (
  SELECT 1
  FROM movimentos_estoque_log mel
  WHERE mel.venda_id = o.venda_id
    AND mel.produto_id = erd.produto_id
    AND mel.tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'
    AND position(erd.operacao_id::text IN COALESCE(mel.observacao, '')) > 0
);

COMMENT ON VIEW public.v_kardex_unificado IS
  'Kardex: movimentos_estoque_log + baixas legadas (anti-join SAIDA_VENDA) + cancelamento só-erc (anti-join log ''cancelamento de venda'', 20261015120000) + devolução parcial só-erd (anti-join por operacao_id, 20260828110000). DAT-01 (291): NULLIF(eb.quantidade,0).';

DO $verify_kardex_erc_antijoin_20261015$
DECLARE
  v_def text;
  v_dup int;
BEGIN
  v_def := pg_get_viewdef('public.v_kardex_unificado'::regclass, true);

  IF position('cancelamento de venda' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20261015_KARDEX_ERC_SEM_ANTI_JOIN';
  END IF;

  IF position('NULLIF(eb.quantidade' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20261015_KARDEX_NULLIF_AUSENTE';
  END IF;

  -- Nenhum par (venda, produto) pode ter estorno de cancelamento no erc E no log.
  SELECT count(*) INTO v_dup
  FROM (
    SELECT referencia_id, produto_id
    FROM public.v_kardex_unificado
    WHERE origem IN ('estoque_reposicoes_cancelamento', 'movimentos_estoque_log')
      AND (tipo_codigo = 'ENTRADA_CANCELAMENTO_VENDA'
           OR (tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'
               AND COALESCE(observacao, '') LIKE 'cancelamento de venda%'))
    GROUP BY referencia_id, produto_id
    HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'MIG20261015_KARDEX_CANCELAMENTO_AINDA_DUPLICADO: % pares', v_dup;
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.v_kardex_unificado', 'SELECT') THEN
    RAISE EXCEPTION 'MIG20261015_KARDEX_GRANT_AUTH_PERDIDO';
  END IF;
END
$verify_kardex_erc_antijoin_20261015$;

COMMIT;
