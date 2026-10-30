-- ============================================================================
-- Política de quantidade comercial da NF-e (sprint corretiva, 2026-10-30).
--
-- PROBLEMA: qCom com mais de três casas decimais era arredondado silenciosamente para o
-- estoque (numeric(10,3)). Ex.: qCom 1,0004 × 1000,00 gravava 1,000 no estoque, enquanto o
-- valor documental (vProd 1000,40) era usado na conciliação. Diferença sem controle.
--
-- POLÍTICA:
--   1. A quantidade documental (qCom) e a unidade comercial (uCom) são preservadas no item.
--   2. quantidade_estoque = qCom × fator é calculada exata. Se não couber em 3 casas (a precisão
--      de estoque), a importação é RECUSADA com IMPORT_NFE_QTD_PRECISAO, que informa o item, a
--      unidade, qCom, fator e a quantidade resultante. Nada é arredondado.
--   3. A precisão global do ERP não muda (quantidade_atual, movimentos e itens de venda seguem
--      numeric(10,3)).
--
-- Aplicação por substituição textual exata (cada trecho com 1 ocorrência; falha ⇒ aborta a transação).
-- Rollback: backend/supabase/rollback/20261030140000_nfe_qtd_precisao_rollback.sql
-- ============================================================================

BEGIN;

ALTER TABLE public.importacoes_nfe_itens
  ADD COLUMN IF NOT EXISTS quantidade_comercial_documento numeric(18,6),
  ADD COLUMN IF NOT EXISTS unidade_comercial text;

DO $ck$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_nfe_item_qtd_comercial_documento') THEN
    ALTER TABLE public.importacoes_nfe_itens
      ADD CONSTRAINT chk_nfe_item_qtd_comercial_documento CHECK (quantidade_comercial_documento IS NULL OR quantidade_comercial_documento >= 0);
  END IF;
END
$ck$;

COMMENT ON COLUMN public.importacoes_nfe_itens.quantidade_comercial_documento IS
  'qCom da NF-e, preservada como informada (até 6 casas). A quantidade de estoque é qCom × fator_conversao, exata e com no máximo 3 casas.';
COMMENT ON COLUMN public.importacoes_nfe_itens.unidade_comercial IS
  'uCom da NF-e (unidade comercial informada pelo emitente).';

DO $qtd$
DECLARE
  v_def text;
  r record;
  v_n int;
BEGIN
  v_def := pg_get_functiondef('internal.importar_nfe_transacao(text,text,text,text,uuid,jsonb,boolean,jsonb)'::regprocedure);
  FOR r IN
    SELECT * FROM (VALUES
      (
        E'    v_q_entrada := v_q_com * v_fator;\n',
        E'    v_q_entrada := v_q_com * v_fator;\n    -- Política de quantidade (20261030140000): sem arredondamento silencioso.\n    IF v_q_entrada <> round(v_q_entrada, 3) THEN\n      RAISE EXCEPTION ''IMPORT_NFE_QTD_PRECISAO''\n        USING DETAIL = format(''item=%s uCom=%s qCom=%s fator=%s quantidade_estoque=%s: maximo 3 casas na unidade de estoque'', el ->> ''nome_produto'', el ->> ''u_com'', v_q_com, v_fator, v_q_entrada);\n    END IF;\n'
      ),
      (
        E'      valor_unitario_documento, fator_conversao, valor_total_documento\n    ) VALUES (\n      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo,\n      v_v_un, v_fator,\n      CASE WHEN el ->> ''v_prod'' IS NOT NULL THEN (el ->> ''v_prod'')::numeric END\n    );\n',
        E'      valor_unitario_documento, fator_conversao, valor_total_documento,\n      quantidade_comercial_documento, unidade_comercial\n    ) VALUES (\n      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo,\n      v_v_un, v_fator,\n      CASE WHEN el ->> ''v_prod'' IS NOT NULL THEN (el ->> ''v_prod'')::numeric END,\n      v_q_com, el ->> ''u_com''\n    );\n'
      )
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'QTD_PRECISAO (importar): trecho encontrado % vezes (esperado 1)', v_n;
    END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;
  EXECUTE v_def;
END
$qtd$;

DO $prova$
BEGIN
  IF position('IMPORT_NFE_QTD_PRECISAO' IN pg_get_functiondef('internal.importar_nfe_transacao(text,text,text,text,uuid,jsonb,boolean,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'QTD_PRECISAO PROVA FAIL';
  END IF;
END
$prova$;

COMMIT;
