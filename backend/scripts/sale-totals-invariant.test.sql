\set ON_ERROR_STOP on
BEGIN;

-- Fixture determinística do caminho offline: garante um caixa ABERTO na loja
-- que tem produto precificado. Sem isto a suíte dependia de já existir um caixa
-- aberto na loja certa — `test:rls-scope` deixa caixas numa loja sem produtos e
-- o bloco offline falhava com `offline_fixture_missing`. Rollback desfaz.
SELECT p.loja_id AS fixture_loja FROM public.produtos p
WHERE p.preco_varejo>0 AND p.ativo
 AND EXISTS(SELECT 1 FROM public.estoque e WHERE e.produto_id=p.id AND e.loja_id=p.loja_id AND e.quantidade_atual>0)
ORDER BY p.loja_id,p.id LIMIT 1 \gset
SELECT gen_random_uuid() AS fixture_operador \gset
INSERT INTO auth.users(id) VALUES (:'fixture_operador');
INSERT INTO public.usuarios(id,nome,perfil,ativo,loja_id)
VALUES (:'fixture_operador','Teste totais online','OPERADOR',true,:'fixture_loja');
INSERT INTO public.caixas(operador_id,loja_id,status,valor_inicial)
VALUES (:'fixture_operador',:'fixture_loja','ABERTO',0);
-- D5 (20261107110000): PIX exige conta financeira vinculada à forma na loja.
WITH c AS (
  INSERT INTO public.contas_financeiras (id, loja_id, nome, tipo, ativo, data_inicial, criado_por)
  SELECT gen_random_uuid(), :'fixture_loja', 'Fixture conta D5', 'BANCO', true, current_date, :'fixture_operador'
  WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_contas_forma WHERE loja_id = :'fixture_loja' AND forma_pagamento = 'PIX')
  RETURNING id
)
INSERT INTO public.financeiro_contas_forma (loja_id, forma_pagamento, conta_financeira_id)
SELECT :'fixture_loja', f.forma, c.id FROM c CROSS JOIN unnest(ARRAY['PIX','CARTAO_DEBITO','CARTAO_CREDITO']) AS f(forma)
ON CONFLICT (loja_id, forma_pagamento) DO NOTHING;

DO $test$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM internal.calcular_totais_venda(
    '[{"quantidade":1,"preco_original":0.01,"preco_unitario":0.01}]'::jsonb, NULL);
  IF v.total_liquido <> 0.01 THEN RAISE EXCEPTION 'case_001_failed'; END IF;

  SELECT * INTO v FROM internal.calcular_totais_venda(
    '[{"quantidade":1,"preco_original":0.10,"preco_unitario":0.10},
      {"quantidade":3,"preco_original":1.99,"preco_unitario":1.99}]'::jsonb, NULL);
  IF v.total_bruto <> 6.07 OR v.total_liquido <> 6.07 THEN
    RAISE EXCEPTION 'multi_item_failed: %', row_to_json(v);
  END IF;

  SELECT * INTO v FROM internal.calcular_totais_venda(
    '[{"quantidade":0.125,"preco_original":1.99,"preco_unitario":1.99}]'::jsonb, NULL);
  IF v.total_liquido <> 0.25 THEN RAISE EXCEPTION 'fraction_round_failed: %', v.total_liquido; END IF;

  SELECT * INTO v FROM internal.calcular_totais_venda(
    '[{"quantidade":1,"preco_original":1.99,"preco_unitario":1.99}]'::jsonb, 10);
  IF v.desconto_global_valor <> 0.20 OR v.total_liquido <> 1.79 THEN
    RAISE EXCEPTION 'percent_discount_failed: %', row_to_json(v);
  END IF;

  SELECT * INTO v FROM internal.calcular_totais_venda(
    '[{"quantidade":2,"preco_original":10.00,"preco_unitario":9.00}]'::jsonb, NULL);
  IF v.total_bruto <> 20.00 OR v.total_desconto <> 2.00 OR v.total_liquido <> 18.00 THEN
    RAISE EXCEPTION 'official_formula_failed: %', row_to_json(v);
  END IF;
END
$test$;

DO $test$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM internal.calcular_totais_venda(
    '[{"quantidade":2,"preco_original":10.00,"preco_unitario":9.00}]'::jsonb, NULL);
  IF 18.01 = v.total_liquido THEN
    RAISE EXCEPTION 'one_cent_difference_was_not_detected';
  END IF;
END
$test$;

-- Offline writer: valid sale, same retry is a no-op, and R$ 0.01 divergence
-- is rejected before any row can be changed. The outer transaction rolls back
-- the complete fixture, including trigger side effects.
SET LOCAL ROLE service_role;
DO $test$
DECLARE
  v_venda_id uuid := gen_random_uuid();
  v_item_id uuid := gen_random_uuid();
  v_caixa_id uuid;
  v_operador_id uuid;
  v_produto_id uuid;
  v_preco numeric;
  v_itens jsonb;
  v_count bigint;
BEGIN
  SELECT c.id, c.operador_id, p.id, p.preco_varejo
  INTO v_caixa_id, v_operador_id, v_produto_id, v_preco
  FROM public.caixas c
  CROSS JOIN LATERAL (
    SELECT pr.id, pr.preco_varejo
    FROM public.produtos pr
    WHERE pr.loja_id = c.loja_id AND pr.preco_varejo > 0
      -- O produto precisa ter saldo: a v4 baixa estoque e `test:rls-scope`
      -- deixa produtos sem linha de estoque que ordenavam antes do seed.
      AND EXISTS (SELECT 1 FROM public.estoque e
                  WHERE e.produto_id = pr.id AND e.loja_id = pr.loja_id
                    AND e.quantidade_atual > 0)
    ORDER BY pr.id
    LIMIT 1
  ) p
  WHERE c.status = 'ABERTO'
  -- Mesma ordenação da fixture criada no topo do arquivo, para que o bloco
  -- online e o offline operem sobre o mesmo caixa.
  ORDER BY c.loja_id, c.id
  LIMIT 1;
  IF v_caixa_id IS NULL THEN RAISE EXCEPTION 'offline_fixture_missing'; END IF;

  v_itens := jsonb_build_array(jsonb_build_object(
    'item_id', v_item_id,
    'produto_id', v_produto_id,
    'quantidade', 1,
    'preco_original', v_preco,
    'preco_unitario', v_preco
  ));

  PERFORM public.registrar_venda_com_itens(
    v_venda_id, v_caixa_id, v_operador_id, 'DINHEIRO',
    v_preco, 0, v_preco, v_itens, NULL, NULL, NULL
  );
  PERFORM public.registrar_venda_com_itens(
    v_venda_id, v_caixa_id, v_operador_id, 'DINHEIRO',
    v_preco, 0, v_preco, v_itens, NULL, NULL, NULL
  );

  SELECT count(*) INTO v_count FROM public.itens_venda WHERE venda_id = v_venda_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'offline_retry_mutated_items: %', v_count; END IF;

  BEGIN
    PERFORM public.registrar_venda_com_itens(
      v_venda_id, v_caixa_id, v_operador_id, 'DINHEIRO',
      v_preco, 0, v_preco + 0.01, v_itens, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'offline_one_cent_was_accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERRO_RPC_TOTAIS_DIVERGENTES%' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO v_count FROM public.itens_venda WHERE venda_id = v_venda_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'offline_rejection_changed_items: %', v_count; END IF;
END
$test$;

RESET ROLE;
SELECT c.operador_id AS test_user, c.id AS test_caixa, c.loja_id AS test_loja,
       p.id AS test_produto,
       (public.calcular_preco_produto(p.id, 1, c.loja_id)->>'preco') AS test_preco
FROM public.caixas c
JOIN public.produtos p ON p.loja_id = c.loja_id AND p.ativo = true
WHERE c.status = 'ABERTO'
  -- A fixture offline pode abrir um caixa sem operador; não é uma sessão online.
  AND c.operador_id IS NOT NULL
  AND public.calcular_preco_produto(p.id, 1, c.loja_id)->>'preco' IS NOT NULL
  -- A v4 baixa estoque: o produto precisa ter saldo na loja do caixa.
  -- `test:rls-scope` cria produto sem linha de estoque cujo id ordena antes do
  -- seed, e o bloco online falhava com PRODUTO_NAO_ENCONTRADO_NO_ESTOQUE.
  AND EXISTS (SELECT 1 FROM public.estoque e
              WHERE e.produto_id = p.id AND e.loja_id = c.loja_id
                AND e.quantidade_atual > 0)
ORDER BY c.data_abertura DESC, p.id
LIMIT 1
\gset
SELECT set_config('request.jwt.claim.sub', :'test_user', true);
SELECT set_config('test.caixa_id', :'test_caixa', true);
SELECT set_config('test.loja_id', :'test_loja', true);
SELECT set_config('test.produto_id', :'test_produto', true);
SELECT set_config('test.preco', :'test_preco', true);
SET LOCAL ROLE authenticated;

-- Online writer: the authenticated wrapper accepts an exact split, retry is
-- stable, and both a one-cent header drift and a one-cent overpayment fail
-- before the internal transactional writer runs.
DO $test$
DECLARE
  v_venda_id uuid := gen_random_uuid();
  v_caixa_id uuid := current_setting('test.caixa_id')::uuid;
  v_operador_id uuid := auth.uid();
  v_loja_id uuid := current_setting('test.loja_id')::uuid;
  v_produto_id uuid := current_setting('test.produto_id')::uuid;
  v_preco numeric := current_setting('test.preco')::numeric;
  v_itens jsonb;
  v_pagamentos jsonb;
  v_status text;
BEGIN
  v_itens := jsonb_build_array(jsonb_build_object(
    'item_id', gen_random_uuid(), 'produto_id', v_produto_id,
    'quantidade', 1, 'preco_original', v_preco,
    'preco_unitario', v_preco, 'tipo_preco', 'VAREJO'
  ));
  v_pagamentos := jsonb_build_array(
    jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 0.01),
    jsonb_build_object('forma_pagamento', 'PIX', 'valor', v_preco - 0.01)
  );

  SELECT r.status INTO v_status FROM public.finalizar_venda_transacional_canonica_v4(
    p_venda_id => v_venda_id, p_caixa_id => v_caixa_id,
    p_operador_id => v_operador_id, p_loja_id => v_loja_id,
    p_forma_pagamento => 'DINHEIRO', p_total_bruto => v_preco,
    p_total_desconto => 0, p_total_liquido => v_preco,
    p_pagamentos => v_pagamentos, p_itens => v_itens
  ) r;
  IF v_status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'online_valid_sale_failed'; END IF;
  SELECT r.status INTO v_status FROM public.finalizar_venda_transacional_canonica_v4(
    p_venda_id => v_venda_id, p_caixa_id => v_caixa_id,
    p_operador_id => v_operador_id, p_loja_id => v_loja_id,
    p_forma_pagamento => 'DINHEIRO', p_total_bruto => v_preco,
    p_total_desconto => 0, p_total_liquido => v_preco,
    p_pagamentos => v_pagamentos, p_itens => v_itens
  ) r;
  IF v_status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'online_retry_failed'; END IF;

  BEGIN
    PERFORM * FROM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id => gen_random_uuid(), p_caixa_id => v_caixa_id,
      p_operador_id => v_operador_id, p_loja_id => v_loja_id,
      p_forma_pagamento => 'DINHEIRO', p_total_bruto => v_preco,
      p_total_desconto => 0, p_total_liquido => v_preco + 0.01,
      p_pagamentos => v_pagamentos, p_itens => v_itens
    );
    RAISE EXCEPTION 'online_one_cent_header_was_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM * FROM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id => gen_random_uuid(), p_caixa_id => v_caixa_id,
      p_operador_id => v_operador_id, p_loja_id => v_loja_id,
      p_forma_pagamento => 'DINHEIRO', p_total_bruto => v_preco,
      p_total_desconto => 0, p_total_liquido => v_preco,
      p_pagamentos => v_pagamentos || jsonb_build_array(
        jsonb_build_object('forma_pagamento', 'PIX', 'valor', 0.01)),
      p_itens => v_itens
    );
    RAISE EXCEPTION 'online_one_cent_overpayment_was_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL%' THEN RAISE; END IF;
  END;
END
$test$;

ROLLBACK;
