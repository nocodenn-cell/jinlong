-- Rollback de 20261030140000_nfe_qtd_precisao.sql.
-- Remove a validação de precisão e as gravações de quantidade comercial da função de importação,
-- restaurando o comportamento anterior (arredondamento silencioso). As colunas são mantidas
-- (nullable; removê-las apagaria o dado documental já gravado) — remoção, se necessária, é manual.

BEGIN;

DO $rb$
DECLARE
  v_def text;
  r record;
  v_n int;
BEGIN
  v_def := pg_get_functiondef('internal.importar_nfe_transacao(text,text,text,text,uuid,jsonb,boolean,jsonb)'::regprocedure);
  FOR r IN
    SELECT * FROM (VALUES
      (
        E'    v_q_entrada := v_q_com * v_fator;\n    -- Política de quantidade (20261030140000): sem arredondamento silencioso.\n    IF v_q_entrada <> round(v_q_entrada, 3) THEN\n      RAISE EXCEPTION ''IMPORT_NFE_QTD_PRECISAO''\n        USING DETAIL = format(''item=%s uCom=%s qCom=%s fator=%s quantidade_estoque=%s: maximo 3 casas na unidade de estoque'', el ->> ''nome_produto'', el ->> ''u_com'', v_q_com, v_fator, v_q_entrada);\n    END IF;\n',
        E'    v_q_entrada := v_q_com * v_fator;\n'
      ),
      (
        E'      valor_unitario_documento, fator_conversao, valor_total_documento,\n      quantidade_comercial_documento, unidade_comercial\n    ) VALUES (\n      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo,\n      v_v_un, v_fator,\n      CASE WHEN el ->> ''v_prod'' IS NOT NULL THEN (el ->> ''v_prod'')::numeric END,\n      v_q_com, el ->> ''u_com''\n    );\n',
        E'      valor_unitario_documento, fator_conversao, valor_total_documento\n    ) VALUES (\n      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo,\n      v_v_un, v_fator,\n      CASE WHEN el ->> ''v_prod'' IS NOT NULL THEN (el ->> ''v_prod'')::numeric END\n    );\n'
      )
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'QTD_PRECISAO_ROLLBACK: trecho encontrado % vezes (esperado 1)', v_n;
    END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;
  EXECUTE v_def;
END
$rb$;

COMMIT;
