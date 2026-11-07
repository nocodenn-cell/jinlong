-- Issue #586 — rastreabilidade de transferências no kardex (movimentos_estoque_log).
--
-- PROBLEMA: `internal.transferir_estoque_seguro` grava duas linhas (TRANSFERENCIA_SAIDA na origem e
-- TRANSFERENCIA_ENTRADA no destino) que não se referenciam; reconstruir "origem → destino" exige parear por
-- produto/usuário/horário, frágil sob concorrência. `transferencias_idempotencia.transferencia_id` aponta só
-- para a SAÍDA.
--
-- CORREÇÃO (aditiva, sem mudar autorização, saldo ou idempotência):
--   1. `movimentos_estoque_log.transferencia_id uuid NULL` + índice parcial.
--   2. As duas linhas de uma transferência passam a levar o mesmo `transferencia_id` = id da SAÍDA (a SAÍDA aponta
--      para si mesma). Como o kardex é append-only (trigger bloqueia UPDATE), o id da SAÍDA é gerado antes do
--      INSERT (`gen_random_uuid()`), em vez de `RETURNING id`.
--   Sem backfill: produção não tem linhas de transferência (verificado em 2026-10-23: 0 linhas
--   TRANSFERENCIA_SAIDA/ENTRADA), então não há par histórico a reconstruir.
--
-- A função é reescrita a partir da definição em vigor (pg_get_functiondef), trocando só os dois INSERTs no kardex,
-- com casamento tolerante a espaços. O corpo em produção é idêntico ao da main (md5 do corpo normalizado
-- 026c228b9e9511e11e509a1e2dfb68bd, 2026-10-23). Se o trecho não for encontrado, a migration aborta (drift).
--
-- Regressão: backend/scripts/transferencia-id-kardex.test.sql
-- ORDEM: esta migration era 20261023130000 (duplicada com growth-001). Foi movida para depois do G14
-- (20261029150000), que reescreve a mesma função com o INSERT de entrada em `v_produto_destino`. A âncora
-- de entrada aceita `p_produto_id` (estado anterior ao G14) e `v_produto_destino` (estado posterior).
-- Ainda não aplicada em nenhum ambiente, então renomear é seguro.
-- ROLLBACK: ops/rollback_20261029155000_movimentos_estoque_log_transferencia_id.sql

ALTER TABLE public.movimentos_estoque_log ADD COLUMN IF NOT EXISTS transferencia_id uuid NULL;

COMMENT ON COLUMN public.movimentos_estoque_log.transferencia_id IS
  'Transferência entre lojas: id da linha TRANSFERENCIA_SAIDA, presente nas duas linhas (SAÍDA e ENTRADA). NULL para os demais movimentos.';

CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_log_transferencia_id
  ON public.movimentos_estoque_log (transferencia_id)
  WHERE transferencia_id IS NOT NULL;

DO $transf$
DECLARE
  v_oid oid := to_regprocedure('internal.transferir_estoque_seguro(uuid, uuid, uuid, numeric, text, text, numeric)');
  v_def text;
  v_nova text;
  c_cols constant text := $c$\(\s*loja_id\s*,\s*produto_id\s*,\s*tipo_codigo\s*,\s*quantidade_delta\s*,\s*remessa_id\s*,\s*usuario_id\s*,\s*observacao\s*\)$c$;
  c_saida text;
  c_entrada text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE NOTICE 'internal.transferir_estoque_seguro ausente — nada a ajustar';
    RETURN;
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF v_def ~ 'transferencia_id\s*\)\s*VALUES\s*\(\s*v_transferencia_id' THEN
    RETURN;  -- já ajustada (reaplicação)
  END IF;

  c_saida := 'INSERT INTO public\.movimentos_estoque_log\s*' || c_cols
    || $s$\s*VALUES\s*\(\s*p_loja_origem\s*,\s*p_produto_id\s*,\s*'TRANSFERENCIA_SAIDA'\s*,\s*-p_quantidade\s*,\s*NULL\s*,\s*v_uid\s*,\s*p_observacao\s*\)\s*RETURNING id INTO v_transferencia_id\s*;$s$;
  c_entrada := 'INSERT INTO public\.movimentos_estoque_log\s*' || c_cols
    || $e$\s*VALUES\s*\(\s*p_loja_destino\s*,\s*(p_produto_id|v_produto_destino)\s*,\s*'TRANSFERENCIA_ENTRADA'\s*,\s*p_quantidade\s*,\s*NULL\s*,\s*v_uid\s*,\s*p_observacao\s*\)\s*;$e$;

  IF v_def !~ c_saida OR v_def !~ c_entrada THEN
    RAISE EXCEPTION 'internal.transferir_estoque_seguro: INSERTs de TRANSFERENCIA_SAIDA/ENTRADA não encontrados — drift, ajuste manual necessário';
  END IF;

  v_nova := regexp_replace(v_def, c_saida,
    $r$v_transferencia_id := gen_random_uuid();
  INSERT INTO public.movimentos_estoque_log (
    id, loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao, transferencia_id
  ) VALUES (
    v_transferencia_id, p_loja_origem, p_produto_id, 'TRANSFERENCIA_SAIDA', -p_quantidade, NULL, v_uid, p_observacao, v_transferencia_id
  );$r$);
  v_nova := regexp_replace(v_nova, c_entrada,
    $r$INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao, transferencia_id
  ) VALUES (
    p_loja_destino, \1, 'TRANSFERENCIA_ENTRADA', p_quantidade, NULL, v_uid, p_observacao, v_transferencia_id
  );$r$);
  EXECUTE v_nova;
END
$transf$;
