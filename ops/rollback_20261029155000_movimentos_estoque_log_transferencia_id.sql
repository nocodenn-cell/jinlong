-- Rollback de 20261029155000_movimentos_estoque_log_transferencia_id.sql (issue #586).
-- Restaura os dois INSERTs originais de internal.transferir_estoque_seguro e remove a coluna.
-- ATENÇÃO: DROP COLUMN apaga o vínculo das transferências feitas depois da migration (os movimentos em si ficam).
BEGIN;
DO $rb$
DECLARE
  v_def text := pg_get_functiondef('internal.transferir_estoque_seguro(uuid, uuid, uuid, numeric, text, text, numeric)'::regprocedure);
BEGIN
  v_def := regexp_replace(v_def,
    $s$v_transferencia_id\s*:=\s*gen_random_uuid\(\);\s*INSERT INTO public\.movimentos_estoque_log\s*\(\s*id\s*,\s*loja_id\s*,\s*produto_id\s*,\s*tipo_codigo\s*,\s*quantidade_delta\s*,\s*remessa_id\s*,\s*usuario_id\s*,\s*observacao\s*,\s*transferencia_id\s*\)\s*VALUES\s*\(\s*v_transferencia_id\s*,\s*p_loja_origem\s*,\s*p_produto_id\s*,\s*'TRANSFERENCIA_SAIDA'\s*,\s*-p_quantidade\s*,\s*NULL\s*,\s*v_uid\s*,\s*p_observacao\s*,\s*v_transferencia_id\s*\)\s*;$s$,
    $r$INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_origem, p_produto_id, 'TRANSFERENCIA_SAIDA', -p_quantidade, NULL, v_uid, p_observacao
  ) RETURNING id INTO v_transferencia_id;$r$);
  v_def := regexp_replace(v_def,
    $e$INSERT INTO public\.movimentos_estoque_log\s*\(\s*loja_id\s*,\s*produto_id\s*,\s*tipo_codigo\s*,\s*quantidade_delta\s*,\s*remessa_id\s*,\s*usuario_id\s*,\s*observacao\s*,\s*transferencia_id\s*\)\s*VALUES\s*\(\s*p_loja_destino\s*,\s*p_produto_id\s*,\s*'TRANSFERENCIA_ENTRADA'\s*,\s*p_quantidade\s*,\s*NULL\s*,\s*v_uid\s*,\s*p_observacao\s*,\s*v_transferencia_id\s*\)\s*;$e$,
    $r$INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_destino, p_produto_id, 'TRANSFERENCIA_ENTRADA', p_quantidade, NULL, v_uid, p_observacao
  );$r$);
  -- Só os trechos que a migration introduz (transferencias_idempotencia também tem "transferencia_id ) VALUES").
  IF v_def ~ 'gen_random_uuid\(\)' OR v_def ~ 'p_observacao\s*,\s*v_transferencia_id' THEN
    RAISE EXCEPTION 'rollback 20261029155000: função não reconhecida — revisar manualmente';
  END IF;
  EXECUTE v_def;
END $rb$;
DROP INDEX IF EXISTS public.idx_movimentos_estoque_log_transferencia_id;
ALTER TABLE public.movimentos_estoque_log DROP COLUMN IF EXISTS transferencia_id;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261029155000';
COMMIT;
