-- T5 (auditoria Jinlong 2026-09-27): v_kardex_unificado duplica o estorno de
-- estoque no cancelamento de venda.
--
-- A própria migration 20260828110000 (que corrigiu a duplicação do ramo de
-- DEVOLUÇÃO) já documentava esta dívida como "fora de escopo":
--   "ramo estoque_reposicoes_cancelamento ainda sem anti-join (cancelar_venda
--    grava ENTRADA_DEVOLUCAO_CLIENTE no log, não ENTRADA_CANCELAMENTO_VENDA
--    — matcher distinto, dívida pré-janela)."
--
-- cancelar_venda_transacional (migration 20260909200000, inalterada aqui)
-- grava, para o MESMO evento físico de reposição de estoque, duas linhas:
--   1) INSERT INTO estoque_reposicoes_cancelamento (idempotência do cancel)
--   2) INSERT INTO movimentos_estoque_log (tipo_codigo='ENTRADA_DEVOLUCAO_CLIENTE')
-- Só o (2) altera estoque.quantidade_atual (via UPDATE separado) — o saldo
-- físico nunca duplica. Mas a view lê as duas tabelas em ramos UNION ALL
-- distintos (mel: e erc:) sem anti-join entre eles, e o ramo erc: relabela o
-- evento como 'ENTRADA_CANCELAMENTO_VENDA' — kardex mostra dois eventos onde
-- só houve um, e a soma do kardex diverge do saldo real (ex.: kardex 11,
-- saldo 9, cancelamento de 2 un.).
--
-- Correção: mesmo padrão já usado para o ramo eb: (SAIDA_VENDA) e erd:
-- (ENTRADA_DEVOLUCAO_CLIENTE) — anti-join no ramo erc: contra
-- movimentos_estoque_log por (venda_id, produto_id, tipo_codigo). Como
-- cancelar_venda_transacional grava os dois INSERTs na mesma transação, para
-- o mesmo (venda_id, produto_id), e uma venda só pode ser cancelada uma vez
-- (`CANCELAR_VENDA_JA_CANCELADA`), a granularidade (venda_id, produto_id) já
-- basta — não precisa do matcher por operacao_id que o ramo erd: usa (aquele
-- existe para devoluções PARCIAIS, que podem repetir).
--
-- Único trecho alterado: a cláusula WHERE NOT EXISTS adicionada ao ramo erc:.
-- Todo o resto da view é cópia verbatim de
-- 20260828110000_fix_v_kardex_unificado_anti_join_devolucao.sql.
--
-- ROLLBACK: reaplicar o CREATE OR REPLACE anterior, disponível em
-- 20260828110000_fix_v_kardex_unificado_anti_join_devolucao.sql.

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
  'Kardex: movimentos_estoque_log + baixas legadas (anti-join SAIDA_VENDA) + cancelamento (anti-join ENTRADA_DEVOLUCAO_CLIENTE, T5 20260927130000) + devolução parcial só-erd (anti-join SSOT-04 por operacao_id na observação, 20260828110000). DAT-01 (291): NULLIF(eb.quantidade,0).';

DO $verify_kardex_erc_antijoin_20260927$
DECLARE
  v_def text;
  v_erd_tipo int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_kardex_unificado'
  ) THEN
    RAISE EXCEPTION 'MIG20260927_KARDEX_VIEW_AUSENTE';
  END IF;

  v_def := pg_get_viewdef('public.v_kardex_unificado'::regclass, true);

  -- Regressões pré-existentes (20260828) continuam presentes.
  IF position('NULLIF(eb.quantidade' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260927_KARDEX_NULLIF_AUSENTE';
  END IF;
  SELECT count(*) INTO v_erd_tipo
  FROM regexp_matches(v_def, 'ENTRADA_DEVOLUCAO_CLIENTE', 'g');
  IF v_erd_tipo < 3 THEN
    -- 2 ocorrências no ramo erd (SELECT + WHERE) + 1 nova no ramo erc (WHERE).
    RAISE EXCEPTION 'MIG20260927_KARDEX_ERC_SEM_ANTI_JOIN';
  END IF;
  IF position('estoque_reposicoes_cancelamento' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260927_KARDEX_ERC_AUSENTE';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.v_kardex_unificado', 'SELECT') THEN
    RAISE EXCEPTION 'MIG20260927_KARDEX_GRANT_AUTH_PERDIDO';
  END IF;
END
$verify_kardex_erc_antijoin_20260927$;

NOTIFY pgrst, 'reload schema';

COMMIT;
