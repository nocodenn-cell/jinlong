-- Rollback de 20261030130000_nfe_precisao_documental.sql.
-- Restaura as duas funções ao estado da 20261030120000 (conciliação com custo gravado).
-- NÃO remove as colunas valor_unitario_documento, fator_conversao e valor_total_documento:
-- são nullable, não alteram nenhum dado existente, e removê-las apagaria o dado documental
-- já gravado. A remoção, se necessária, é um passo manual separado e explícito.

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
        E'    INSERT INTO public.importacoes_nfe_itens (\n      importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo,\n      valor_unitario_documento, fator_conversao, valor_total_documento\n    ) VALUES (\n      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo,\n      v_v_un, v_fator,\n      CASE WHEN el ->> ''v_prod'' IS NOT NULL THEN (el ->> ''v_prod'')::numeric END\n    );\n',
        E'    INSERT INTO public.importacoes_nfe_itens (\n      importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo\n    ) VALUES (\n      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo\n    );\n'
      )
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN RAISE EXCEPTION 'PRECISAO_NFE_ROLLBACK (importar): trecho % vezes', v_n; END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;
  EXECUTE v_def;
END
$rb$;

DO $rb2$
DECLARE
  v_def text;
  r record;
  v_n int;
BEGIN
  v_def := pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure);
  FOR r IN
    SELECT * FROM (VALUES
      (
        E'  SELECT coalesce(sum(\n           CASE\n             WHEN i.valor_total_documento IS NOT NULL AND i.quantidade_conferida = i.quantidade_nfe\n               THEN i.valor_total_documento\n             WHEN i.valor_unitario_documento IS NOT NULL\n               THEN round(i.quantidade_conferida / i.fator_conversao * i.valor_unitario_documento, 2)\n             ELSE round(i.quantidade_conferida * i.custo_unitario, 2)\n           END\n         ), 0) INTO v_exigivel\n',
        E'  SELECT coalesce(sum(i.quantidade_conferida * i.custo_unitario), 0) INTO v_exigivel\n'
      )
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN RAISE EXCEPTION 'PRECISAO_NFE_ROLLBACK (confirmar): trecho % vezes', v_n; END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;
  EXECUTE v_def;
END
$rb2$;

COMMIT;
