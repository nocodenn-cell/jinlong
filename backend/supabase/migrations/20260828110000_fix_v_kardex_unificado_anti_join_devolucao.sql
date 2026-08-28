-- Fix: v_kardex_unificado duplicava ENTRADA_DEVOLUCAO_CLIENTE depois da
-- 20260821110000 (#313). devolver_ou_trocar_venda grava o delta em
-- movimentos_estoque_log E em estoque_reposicoes_devolucao; a view (291)
-- fazia UNION ALL dos dois ramos sem anti-join no erd.
--
-- Gatilho: GERENTE devolve 2 un. em /admin/vendas → estoque += 2 (correto) e
-- /admin/estoque kardex (InventoryMovementReader) mostra +2 (mel) e +2 (erd).
-- Saldo físico não corrompe; o SSOT de auditoria infla a entrada e pode
-- induzir ajuste manual errado.
--
-- Mesmo critério do backfill da 20260821110000: o log físico traz
-- operacao=<uuid> em observacao. Devoluções só-erd (pré-SSOT-04) continuam
-- no fallback. CREATE OR REPLACE preserva grants (incl. o SELECT de anon
-- herdado da 291 — não reabrir esse cheiro neste PR).
--
-- Fora de escopo: ramo estoque_reposicoes_cancelamento ainda sem anti-join
-- (cancelar_venda grava ENTRADA_DEVOLUCAO_CLIENTE no log, não
-- ENTRADA_CANCELAMENTO_VENDA — matcher distinto, dívida pré-janela).

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
  'Kardex: movimentos_estoque_log + baixas legadas (anti-join SAIDA_VENDA) + cancelamento + devolução parcial só-erd (anti-join SSOT-04 por operacao_id na observação, 20260828110000). DAT-01 (291): NULLIF(eb.quantidade,0).';

DO $verify_kardex_erd_antijoin_20260828$
DECLARE
  v_def text;
  v_erd_tipo int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_kardex_unificado'
  ) THEN
    RAISE EXCEPTION 'MIG20260828_KARDEX_VIEW_AUSENTE';
  END IF;

  v_def := pg_get_viewdef('public.v_kardex_unificado'::regclass, true);

  IF position('NULLIF(eb.quantidade' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260828_KARDEX_NULLIF_AUSENTE';
  END IF;

  IF position('estoque_reposicoes_devolucao' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260828_KARDEX_ERD_AUSENTE';
  END IF;

  SELECT count(*) INTO v_erd_tipo
  FROM regexp_matches(v_def, 'ENTRADA_DEVOLUCAO_CLIENTE', 'g');
  IF v_erd_tipo < 2 THEN
    RAISE EXCEPTION 'MIG20260828_KARDEX_ERD_SEM_ANTI_JOIN';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.v_kardex_unificado', 'SELECT') THEN
    RAISE EXCEPTION 'MIG20260828_KARDEX_GRANT_AUTH_PERDIDO';
  END IF;
END
$verify_kardex_erd_antijoin_20260828$;

COMMIT;
