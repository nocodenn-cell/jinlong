-- Regressão de 20260929130000_descontos_venda_exige_pagamento_dinheiro.sql
--
-- Prova a invariante de banco: linha em `descontos_venda` (desconto de gerente
-- sobre o total) exige vendas.forma_pagamento e TODAS as vendas_pagamentos =
-- DINHEIRO. Testa o trigger diretamente (mesma ordem dos RPCs: vendas ->
-- vendas_pagamentos -> descontos_venda), sem depender de itens/estoque/token.
--
-- NÃO executar em produção. Rodar só em banco local/CI/clone.
-- Tudo dentro de transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja   uuid := 'f4000001-0000-4000-8000-000000000001';
  v_op     uuid := 'f4000002-0000-4000-8000-000000000001';
  v_caixa  uuid := 'f4000003-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_op) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'DESC-DIN Loja', 'DESCDIN-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_op, 'DESC-DIN Operador', 'OPERADOR', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.caixas WHERE id = v_caixa;
  INSERT INTO public.caixas (id, loja_id, operador_id, status, valor_inicial, data_abertura)
  VALUES (v_caixa, v_loja, v_op, 'ABERTO', 0, now());
END
$setup$;

-- Helper de teste: cria venda + parcelas e tenta inserir o desconto.
-- p_parcelas: jsonb [{"forma":"DINHEIRO","valor":50}, ...]; NULL = sem vendas_pagamentos.
-- Retorna NULL se o INSERT em descontos_venda passou, ou a mensagem do erro.
CREATE FUNCTION pg_temp.tenta_desconto(p_id text, p_forma_escalar text, p_parcelas jsonb)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_venda uuid := ('f4000004-0000-4000-8000-' || lpad(p_id, 12, '0'))::uuid;
  v_p jsonb;
BEGIN
  INSERT INTO public.vendas (id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES (v_venda, 'f4000003-0000-4000-8000-000000000001', 'f4000002-0000-4000-8000-000000000001',
          100, 5, 95, p_forma_escalar, 'CONCLUIDA');

  IF p_parcelas IS NOT NULL THEN
    FOR v_p IN SELECT value FROM jsonb_array_elements(p_parcelas) LOOP
      INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
      VALUES (v_venda, v_p->>'forma', (v_p->>'valor')::numeric);
    END LOOP;
  END IF;

  BEGIN
    INSERT INTO public.descontos_venda (venda_id, gerente_id, desconto_percentual, desconto_valor)
    VALUES (v_venda, 'gerente-teste', 5, 5);
    RETURN NULL;
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
END
$$;

DO $casos$
DECLARE
  v_msg text;
  c_erro constant text := 'DESCONTO_GERENTE_EXIGE_PAGAMENTO_DINHEIRO';
BEGIN
  -- Permitidos ---------------------------------------------------------------
  v_msg := pg_temp.tenta_desconto('1', 'DINHEIRO', '[{"forma":"DINHEIRO","valor":95}]');
  IF v_msg IS NOT NULL THEN RAISE EXCEPTION 'FALHOU caso 1 (dinheiro + parcela): %', v_msg; END IF;

  v_msg := pg_temp.tenta_desconto('2', 'DINHEIRO', NULL);
  IF v_msg IS NOT NULL THEN RAISE EXCEPTION 'FALHOU caso 2 (dinheiro escalar, sem parcelas): %', v_msg; END IF;

  -- Bloqueados ---------------------------------------------------------------
  v_msg := pg_temp.tenta_desconto('3', 'PIX', '[{"forma":"PIX","valor":95}]');
  IF v_msg IS DISTINCT FROM c_erro THEN RAISE EXCEPTION 'FALHOU caso 3 (PIX): %', v_msg; END IF;

  v_msg := pg_temp.tenta_desconto('4', 'CARTAO_DEBITO', '[{"forma":"CARTAO_DEBITO","valor":95}]');
  IF v_msg IS DISTINCT FROM c_erro THEN RAISE EXCEPTION 'FALHOU caso 4 (cartão débito): %', v_msg; END IF;

  v_msg := pg_temp.tenta_desconto('5', 'CARTAO_CREDITO', '[{"forma":"CARTAO_CREDITO","valor":95}]');
  IF v_msg IS DISTINCT FROM c_erro THEN RAISE EXCEPTION 'FALHOU caso 5 (cartão crédito): %', v_msg; END IF;

  v_msg := pg_temp.tenta_desconto('6', 'DINHEIRO', '[{"forma":"DINHEIRO","valor":50},{"forma":"PIX","valor":45}]');
  IF v_msg IS DISTINCT FROM c_erro THEN RAISE EXCEPTION 'FALHOU caso 6 (dinheiro + PIX): %', v_msg; END IF;

  v_msg := pg_temp.tenta_desconto('7', 'DINHEIRO', '[{"forma":"DINHEIRO","valor":50},{"forma":"CARTAO_DEBITO","valor":45}]');
  IF v_msg IS DISTINCT FROM c_erro THEN RAISE EXCEPTION 'FALHOU caso 7 (dinheiro + cartão): %', v_msg; END IF;

  -- Escalar PIX com parcelas só em dinheiro (escalar não é validado pelo RPC quando há p_pagamentos)
  v_msg := pg_temp.tenta_desconto('8', 'PIX', '[{"forma":"DINHEIRO","valor":95}]');
  IF v_msg IS DISTINCT FROM c_erro THEN RAISE EXCEPTION 'FALHOU caso 8 (escalar PIX + parcela dinheiro): %', v_msg; END IF;

  -- Escalar PIX sem parcelas
  v_msg := pg_temp.tenta_desconto('9', 'PIX', NULL);
  IF v_msg IS DISTINCT FROM c_erro THEN RAISE EXCEPTION 'FALHOU caso 9 (escalar PIX sem parcelas): %', v_msg; END IF;

  RAISE NOTICE 'OK: invariante desconto de gerente => 100%% DINHEIRO (9 casos).';
END
$casos$;

-- Sem desconto, PIX / cartão / misto continuam permitidos (o trigger só vive em descontos_venda).
DO $regressao$
DECLARE
  v_venda uuid;
BEGIN
  v_venda := 'f4000004-0000-4000-8000-0000000000a1';
  INSERT INTO public.vendas (id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES (v_venda, 'f4000003-0000-4000-8000-000000000001', 'f4000002-0000-4000-8000-000000000001', 100, 0, 100, 'PIX', 'CONCLUIDA');
  INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor) VALUES
    (v_venda, 'PIX', 60), (v_venda, 'CARTAO_DEBITO', 40);
  RAISE NOTICE 'OK: venda sem desconto em PIX/cartão/misto continua gravando.';
END
$regressao$;

-- Estrutura: trigger presente, habilitado e função não exposta.
DO $estrutura$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.descontos_venda'::regclass
       AND t.tgname = 'trg_descontos_venda_exige_pagamento_dinheiro'
       AND t.tgenabled = 'O' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'FALHOU: trigger trg_descontos_venda_exige_pagamento_dinheiro ausente ou desabilitado';
  END IF;
  IF has_function_privilege('anon', 'internal.trg_descontos_venda_exige_pagamento_dinheiro()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'internal.trg_descontos_venda_exige_pagamento_dinheiro()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: função do trigger exposta a anon/authenticated';
  END IF;
  RAISE NOTICE 'OK: estrutura do trigger.';
END
$estrutura$;

ROLLBACK;
