-- ============================================================================
-- v_kardex_unificado: cancelamento de venda aparecia DUPLICADO no kardex
-- ============================================================================
-- Achado (browser audit): ao cancelar uma venda com reposicao de estoque, o
-- kardex mostrava DOIS movimentos para o mesmo evento fisico -- um rotulado
-- "devolucao cliente" e outro "cancelamento venda" -- com a mesma
-- quantidade, mesmo venda_id, mesmo produto_id.
--
-- Causa raiz: NAO sao dois mecanismos concorrentes gravando estoque. E um
-- unico INSERT real em `movimentos_estoque_log` (tipo_codigo =
-- 'ENTRADA_DEVOLUCAO_CLIENTE', feito por `cancelar_venda_transacional`) mais
-- um INSERT em `estoque_reposicoes_cancelamento` (tabela de bookkeeping para
-- impedir repor a mesma quantidade duas vezes se a funcao rodar de novo
-- apos uma devolucao parcial previa -- nao e um segundo movimento fisico).
-- O saldo de `estoque.quantidade_atual` so e incrementado UMA vez.
--
-- O bug esta na VIEW de leitura: a migration 20260828110000 adicionou
-- anti-join contra `movimentos_estoque_log` no ramo irmao `erd`
-- (estoque_reposicoes_devolucao, devolucao parcial) mas deixou o ramo `erc`
-- (estoque_reposicoes_cancelamento) sem o mesmo anti-join -- a propria
-- migration documentava isso como "fora de escopo" na epoca (comentario
-- linhas 16-18 daquele arquivo).
--
-- Diferente do erd (que casa por `operacao_id` na observacao, pois pode
-- haver varias devolucoes parciais por produto/venda), `erc` tem UNIQUE
-- (venda_id, produto_id) -- casa 1:1 com o INSERT real feito pela mesma
-- funcao, que usa exatamente essa chave. O anti-join aqui e mais simples que
-- o do erd.
-- ============================================================================

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
  SELECT 1 FROM movimentos_estoque_log mel
  WHERE mel.venda_id = erc.venda_id
    AND mel.produto_id = erc.produto_id
    AND mel.tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'
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
  'Kardex: movimentos_estoque_log + baixas legadas (anti-join SAIDA_VENDA) + cancelamento (anti-join ENTRADA_DEVOLUCAO_CLIENTE por venda_id+produto_id, 20260928) + devolução parcial só-erd (anti-join SSOT-04 por operacao_id na observação, 20260828110000). DAT-01 (291): NULLIF(eb.quantidade,0).';

DO $verify_kardex_erc_antijoin_20260928$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_kardex_unificado'
  ) THEN
    RAISE EXCEPTION 'MIG20260928_KARDEX_VIEW_AUSENTE';
  END IF;

  v_def := pg_get_viewdef('public.v_kardex_unificado'::regclass, true);

  IF position('estoque_reposicoes_cancelamento' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260928_KARDEX_ERC_AUSENTE';
  END IF;

  -- erc precisa do seu proprio NOT EXISTS logo apos o FROM/JOINs do ramo erc
  -- (entre "vca.venda_id = erc.venda_id" e o proximo "UNION ALL").
  IF position('NOT EXISTS' IN substring(
    v_def FROM position('estoque_reposicoes_cancelamento' IN v_def)
    FOR position('estoque_reposicoes_devolucao' IN v_def) - position('estoque_reposicoes_cancelamento' IN v_def)
  )) = 0 THEN
    RAISE EXCEPTION 'MIG20260928_KARDEX_ERC_SEM_ANTI_JOIN';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.v_kardex_unificado', 'SELECT') THEN
    RAISE EXCEPTION 'MIG20260928_KARDEX_GRANT_AUTH_PERDIDO';
  END IF;
END
$verify_kardex_erc_antijoin_20260928$;

NOTIFY pgrst, 'reload schema';

COMMIT;
