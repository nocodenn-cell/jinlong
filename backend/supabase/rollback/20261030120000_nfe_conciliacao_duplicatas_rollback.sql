-- Rollback de 20261030120000_nfe_conciliacao_duplicatas.sql.
-- Remove a conciliação de duplicatas da confirmação, restaurando o comportamento anterior.
-- Usa o mesmo padrão de substituição textual exata: falha se o trecho não existir uma vez.

BEGIN;

DO $rb$
DECLARE
  v_def text;
  r record;
  v_n int;
BEGIN
  v_def := pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure);

  FOR r IN
    SELECT * FROM (VALUES
      (
        E'  v_econ         numeric(14,2);\n  v_exigivel     numeric;\n  v_dup_total    numeric;\n',
        E'  v_econ         numeric(14,2);\n'
      ),
      (
        E'  -- Conciliação: duplicatas devem somar o valor exigível (exato, tolerância R$ 0,01).\n  SELECT coalesce(sum(i.quantidade_conferida * i.custo_unitario), 0) INTO v_exigivel\n    FROM public.importacoes_nfe_itens i\n   WHERE i.importacao_nfe_id = p_importacao_id;\n  SELECT coalesce(sum(d.valor), 0) INTO v_dup_total\n    FROM public.importacoes_nfe_duplicatas d\n   WHERE d.importacao_nfe_id = p_importacao_id;\n  IF abs(v_dup_total - v_exigivel) > 0.01 THEN\n    RAISE EXCEPTION ''IMPORT_NFE_DUPLICATAS_DIVERGENTES''\n      USING DETAIL = format(''valor_exigivel=%s duplicatas=%s'', v_exigivel, v_dup_total);\n  END IF;\n\n  FOR v_dup IN\n    SELECT numero_duplicata, data_vencimento, valor\n',
        E'  FOR v_dup IN\n    SELECT numero_duplicata, data_vencimento, valor\n'
      )
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'CONCILIACAO_NFE_ROLLBACK: trecho encontrado % vezes (esperado 1): %', v_n, left(r.antigo, 60);
    END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;

  EXECUTE v_def;
END
$rb$;

COMMIT;
