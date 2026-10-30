-- Regressão da migration 20261029155000_movimentos_estoque_log_transferencia_id.sql (issue #586).
--
-- Uma transação com ROLLBACK no final — não persiste nada. Chama a RPC pública real como DONO e prova:
--   1. a transferência gera exatamente 2 linhas no kardex com o mesmo transferencia_id;
--   2. esse id é o da linha TRANSFERENCIA_SAIDA (que aponta para si mesma), o retornado pela RPC e o gravado em
--      transferencias_idempotencia;
--   3. saldos de origem/destino mudam como antes; o replay com a mesma chave devolve o mesmo id sem novas linhas;
--   4. o kardex continua imutável (UPDATE bloqueado).

\set ON_ERROR_STOP on
BEGIN;

-- Multiempresa: lojas exigem empresa_id (trigger tg_preenche_empresa_id). Empresa 1 da FIXTURE-S1.
INSERT INTO public.lojas (id, nome, empresa_id) VALUES
  ('d0000000-0000-0000-0000-0000000000a1', 'T586 Origem', 'f5100000-0000-4000-8000-0000000000e1'),
  ('d0000000-0000-0000-0000-0000000000b2', 'T586 Destino', 'f5100000-0000-4000-8000-0000000000e1');
INSERT INTO public.produtos (id, nome, preco_varejo, origem, loja_id)
VALUES ('d0000000-0000-0000-0000-0000000000c3', 'T586 Produto', 10, 'brasil_nf', 'd0000000-0000-0000-0000-0000000000a1');
INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
VALUES ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000c3', 10, 0);
INSERT INTO auth.users (id, email, aud, role)
VALUES ('d0000000-0000-0000-0000-0000000000d4', 't586-dono@teste.local', 'authenticated', 'authenticated');
INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
VALUES ('d0000000-0000-0000-0000-0000000000d4', 'T586 Dono', 'DONO', true, 'd0000000-0000-0000-0000-0000000000a1');

SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000d4', true),
       set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);

DO $t586$
DECLARE
  c_origem  constant uuid := 'd0000000-0000-0000-0000-0000000000a1';
  c_destino constant uuid := 'd0000000-0000-0000-0000-0000000000b2';
  c_produto constant uuid := 'd0000000-0000-0000-0000-0000000000c3';
  v_fail text[] := ARRAY[]::text[];
  v_id uuid;
  v_replay uuid;
  v_n int;
  v_saida_id uuid;
  v_ids uuid[];
  v_idem uuid;
  v_qtd_origem numeric;
  v_qtd_destino numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'movimentos_estoque_log' AND column_name = 'transferencia_id') THEN
    RAISE EXCEPTION 'transferencia-id-kardex: coluna movimentos_estoque_log.transferencia_id ausente';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.transferir_estoque_seguro(c_origem, c_destino, c_produto, 3, 'teste 586', 't586-chave-1', 10);
  v_replay := public.transferir_estoque_seguro(c_origem, c_destino, c_produto, 3, 'teste 586', 't586-chave-1', 10);
  EXECUTE 'RESET ROLE';

  SELECT count(*), array_agg(DISTINCT transferencia_id), max(id::text) FILTER (WHERE tipo_codigo = 'TRANSFERENCIA_SAIDA')::uuid
    INTO v_n, v_ids, v_saida_id
  FROM public.movimentos_estoque_log
  WHERE produto_id = c_produto AND tipo_codigo IN ('TRANSFERENCIA_SAIDA', 'TRANSFERENCIA_ENTRADA');

  IF v_n <> 2 THEN
    v_fail := array_append(v_fail, format('esperava 2 linhas de transferência, veio %s', v_n));
  END IF;
  IF cardinality(v_ids) <> 1 OR v_ids[1] IS NULL THEN
    v_fail := array_append(v_fail, format('as duas linhas deveriam ter o mesmo transferencia_id não nulo, vieram %s', v_ids));
  ELSIF v_ids[1] IS DISTINCT FROM v_saida_id THEN
    v_fail := array_append(v_fail, 'transferencia_id deveria ser o id da linha TRANSFERENCIA_SAIDA');
  END IF;
  IF v_id IS DISTINCT FROM v_saida_id THEN
    v_fail := array_append(v_fail, 'o retorno da RPC deveria ser o id da SAÍDA');
  END IF;
  IF v_replay IS DISTINCT FROM v_id THEN
    v_fail := array_append(v_fail, 'replay com a mesma chave deveria devolver o mesmo id');
  END IF;

  SELECT ti.transferencia_id INTO v_idem FROM public.transferencias_idempotencia ti
  WHERE ti.usuario_id = 'd0000000-0000-0000-0000-0000000000d4' AND ti.idempotency_key = 't586-chave-1';
  IF v_idem IS DISTINCT FROM v_id THEN
    v_fail := array_append(v_fail, 'transferencias_idempotencia.transferencia_id deveria ser o mesmo id');
  END IF;

  SELECT quantidade_atual INTO v_qtd_origem FROM public.estoque WHERE loja_id = c_origem AND produto_id = c_produto;
  SELECT quantidade_atual INTO v_qtd_destino FROM public.estoque WHERE loja_id = c_destino AND produto_id = c_produto;
  IF v_qtd_origem IS DISTINCT FROM 7 OR v_qtd_destino IS DISTINCT FROM 3 THEN
    v_fail := array_append(v_fail, format('saldos inesperados: origem=%s destino=%s (esperado 7/3)', v_qtd_origem, v_qtd_destino));
  END IF;

  IF EXISTS (SELECT 1 FROM public.movimentos_estoque_log
             WHERE transferencia_id IS NOT NULL AND tipo_codigo NOT IN ('TRANSFERENCIA_SAIDA', 'TRANSFERENCIA_ENTRADA')) THEN
    v_fail := array_append(v_fail, 'transferencia_id preenchido em movimento que não é transferência');
  END IF;

  BEGIN
    UPDATE public.movimentos_estoque_log SET observacao = 'x' WHERE id = v_saida_id;
    v_fail := array_append(v_fail, 'kardex deveria continuar imutável (UPDATE)');
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  IF cardinality(v_fail) > 0 THEN
    RAISE EXCEPTION 'transferencia-id-kardex: % falha(s):%', cardinality(v_fail), E'\n  - ' || array_to_string(v_fail, E'\n  - ');
  END IF;
  RAISE NOTICE 'transferencia-id-kardex: OK (transferencia_id=%)', v_id;
END
$t586$;

ROLLBACK;
