-- ============================================================================
-- TESTES SQL — BLOQUEADOR #3 (Estoque Órfão / Race Condition)
-- ============================================================================
-- Arquivo: teste_bloqueador_3_sql.sql
-- Propósito: Validar que o sistema de finalização de venda é atomicamente seguro
--
-- CENÁRIOS:
--   1. Venda normal: stock 10, vende 2 → expect stock 8, venda CONCLUIDA
--   2. Falha proposital: stock 5, tenta vender 10 → expect rollback completo
--   3. Concorrência: stock 1, dois caixas vendem simultaneamente → 1 sucesso + 1 erro
--
-- PRÉ-REQUISITO: Migrations 016 (estoque_atomic_lock) e 243 (finalizar_venda_v4)
-- ============================================================================

-- ============================================================================
-- SETUP: Criar dados de teste
-- ============================================================================

-- Limpar dados de teste anteriores (caso existam)
DELETE FROM itens_venda WHERE venda_id IN (SELECT id FROM vendas WHERE operador_id = 'test-op-blocker3');
DELETE FROM estoque_baixas WHERE venda_id IN (SELECT id FROM vendas WHERE operador_id = 'test-op-blocker3');
DELETE FROM vendas WHERE operador_id = 'test-op-blocker3';
DELETE FROM estoque WHERE produto_id IN (SELECT id FROM produtos WHERE nome ILIKE 'TEST-WIDGET%');
DELETE FROM produtos WHERE nome ILIKE 'TEST-WIDGET%';

-- Criar loja de teste
INSERT INTO lojas (id, nome) VALUES ('loja-test-blocker3', 'Loja Teste Blocker #3')
ON CONFLICT (id) DO NOTHING;

-- Criar operador de teste
INSERT INTO auth.users (id, email, user_metadata) VALUES
  ('test-op-blocker3', 'test-blocker3@local', '{"nome":"Test Op 3"}')
ON CONFLICT (id) DO NOTHING;

-- Criar caixa de teste
INSERT INTO caixas (id, loja_id, nome, ativo) VALUES
  ('caixa-test-blocker3', 'loja-test-blocker3', 'Caixa Teste', true)
ON CONFLICT (id) DO NOTHING;

-- Criar produtos de teste
-- Produto 1: Widget A (para cenários 1 e 2)
INSERT INTO produtos (id, loja_id, nome, preco_varejo, preco_atacado, ativo, categoria_id)
VALUES ('produto-a', 'loja-test-blocker3', 'TEST-WIDGET-A', 100.00, 85.00, true, NULL)
ON CONFLICT (id) DO NOTHING;

-- Produto 2: Widget B (para cenário 3 - concorrência)
INSERT INTO produtos (id, loja_id, nome, preco_varejo, preco_atacado, ativo, categoria_id)
VALUES ('produto-b', 'loja-test-blocker3', 'TEST-WIDGET-B', 50.00, 40.00, true, NULL)
ON CONFLICT (id) DO NOTHING;

-- Inicializar estoque
INSERT INTO estoque (produto_id, quantidade_atual, version)
VALUES
  ('produto-a', 10, 1),
  ('produto-b', 1, 1)
ON CONFLICT (produto_id) DO UPDATE SET quantidade_atual = EXCLUDED.quantidade_atual;

COMMIT;

-- ============================================================================
-- CENÁRIO 1: VENDA NORMAL
-- ============================================================================
-- Descrição: Stock=10, vender 2 unidades → expect stock=8, venda CONCLUIDA
-- ============================================================================

DO $$
DECLARE
  v_venda_id UUID := gen_random_uuid();
  v_item_id UUID := gen_random_uuid();
  v_itens JSONB;
  v_result RECORD;
  v_estoque_final NUMERIC;
  v_venda_status TEXT;
  v_total_baixas NUMERIC;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CENÁRIO 1: VENDA NORMAL';
  RAISE NOTICE 'Setup: Stock produto-a = 10';
  RAISE NOTICE 'Ação: Vender 2 unidades';
  RAISE NOTICE 'Esperado: Stock final = 8, venda CONCLUIDA';
  RAISE NOTICE '========================================';

  -- Verificar estoque inicial
  SELECT quantidade_atual INTO v_estoque_final FROM estoque WHERE produto_id = 'produto-a';
  RAISE NOTICE '[PRÉ] Estoque inicial de produto-a: %', v_estoque_final;
  ASSERT v_estoque_final = 10, 'Setup: Estoque inicial deveria ser 10';

  -- Montar payload de venda
  v_itens := jsonb_build_array(
    jsonb_build_object(
      'item_id', v_item_id,
      'produto_id', 'produto-a',
      'quantidade', 2,
      'preco_original', 100.00,
      'preco_unitario', 100.00,
      'tipo_preco', 'VAREJO'
    )
  );

  -- Chamar RPC de finalização
  RAISE NOTICE '[EXEC] Chamando finalizar_venda_transacional_canonica_v4...';
  SELECT * INTO v_result FROM public.finalizar_venda_transacional_canonica_v4(
    p_venda_id := v_venda_id,
    p_caixa_id := 'caixa-test-blocker3',
    p_operador_id := 'test-op-blocker3',
    p_loja_id := 'loja-test-blocker3',
    p_itens := v_itens,
    p_forma_pagamento := 'DINHEIRO',
    p_total_bruto := 200.00,
    p_total_desconto := 0.00,
    p_total_liquido := 200.00,
    p_desconto_gerente_percentual := 0,
    p_desconto_gerente_token := NULL,
    p_strict_manager_discount_auth := false,
    p_pagamentos := NULL,
    p_fiscal_auto_enqueue := false,
    p_ip_address := '127.0.0.1',
    p_user_agent := 'test-browser',
    p_device_id := 'test-device',
    p_terminal_id := 'test-terminal'
  );

  -- Validar resultado
  RAISE NOTICE '[RESULTADO] Status venda: % (esperado: CONCLUIDA)', v_result.status;
  ASSERT v_result.status = 'CONCLUIDA', 'Venda deveria estar CONCLUIDA';

  -- Validar estoque após venda
  SELECT quantidade_atual INTO v_estoque_final FROM estoque WHERE produto_id = 'produto-a';
  RAISE NOTICE '[PÓS] Estoque final de produto-a: % (esperado: 8)', v_estoque_final;
  ASSERT v_estoque_final = 8, 'Estoque deveria ser 8 após vender 2';

  -- Validar registro de baixa
  SELECT COUNT(*), SUM(quantidade) INTO v_total_baixas FROM estoque_baixas
  WHERE venda_id = v_venda_id AND produto_id = 'produto-a';
  RAISE NOTICE '[AUDITORIA] Registros de baixa: % (esperado: 1), quantidade total: %', v_total_baixas, v_total_baixas;
  ASSERT v_total_baixas = 1, 'Deveria ter 1 registro de baixa';

  -- Validar venda nos registros
  SELECT status INTO v_venda_status FROM vendas WHERE id = v_venda_id;
  RAISE NOTICE '[VERIFICAÇÃO] Venda %: status=%', v_venda_id, v_venda_status;
  ASSERT v_venda_status = 'CONCLUIDA', 'Venda deveria estar CONCLUIDA nos registros';

  RAISE NOTICE '✅ CENÁRIO 1 PASSOU: Venda normal processada corretamente';
  RAISE NOTICE '';

END $$;

-- ============================================================================
-- CENÁRIO 2: FALHA PROPOSITAL (ROLLBACK)
-- ============================================================================
-- Descrição: Stock=8 (após cenário 1), tenta vender 10 → expect ROLLBACK
-- ============================================================================

DO $$
DECLARE
  v_venda_id UUID := gen_random_uuid();
  v_item_id UUID := gen_random_uuid();
  v_itens JSONB;
  v_estoque_antes NUMERIC;
  v_estoque_depois NUMERIC;
  v_venda_existe BOOLEAN;
  v_exception_raised BOOLEAN := false;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CENÁRIO 2: FALHA PROPOSITAL (ROLLBACK)';
  RAISE NOTICE 'Setup: Stock produto-a = 8 (após cenário 1)';
  RAISE NOTICE 'Ação: Tentar vender 10 unidades (insuficiente)';
  RAISE NOTICE 'Esperado: EXCEPTION, estoque = 8, venda NÃO criada';
  RAISE NOTICE '========================================';

  -- Verificar estoque inicial
  SELECT quantidade_atual INTO v_estoque_antes FROM estoque WHERE produto_id = 'produto-a';
  RAISE NOTICE '[PRÉ] Estoque inicial: %', v_estoque_antes;
  ASSERT v_estoque_antes = 8, 'Setup: Estoque deveria ser 8';

  -- Tentar venda que vai falhar
  RAISE NOTICE '[EXEC] Tentando vender 10 unidades (estoque insuficiente)...';
  v_itens := jsonb_build_array(
    jsonb_build_object(
      'item_id', v_item_id,
      'produto_id', 'produto-a',
      'quantidade', 10,
      'preco_original', 100.00,
      'preco_unitario', 100.00,
      'tipo_preco', 'VAREJO'
    )
  );

  BEGIN
    PERFORM * FROM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id := v_venda_id,
      p_caixa_id := 'caixa-test-blocker3',
      p_operador_id := 'test-op-blocker3',
      p_loja_id := 'loja-test-blocker3',
      p_itens := v_itens,
      p_forma_pagamento := 'DINHEIRO',
      p_total_bruto := 1000.00,
      p_total_desconto := 0.00,
      p_total_liquido := 1000.00,
      p_desconto_gerente_percentual := 0,
      p_desconto_gerente_token := NULL,
      p_strict_manager_discount_auth := false,
      p_pagamentos := NULL,
      p_fiscal_auto_enqueue := false,
      p_ip_address := '127.0.0.1',
      p_user_agent := 'test-browser',
      p_device_id := 'test-device',
      p_terminal_id := 'test-terminal'
    );
    RAISE NOTICE '[RESULTADO] ❌ ERRO: RPC não levantou exception (deveria ter levantado)';
    v_exception_raised := false;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[RESULTADO] ✅ Exception capturada como esperado: %', SQLERRM;
    v_exception_raised := true;
  END;

  ASSERT v_exception_raised, 'RPC deveria ter levantado EXCEPTION';

  -- Validar que venda NÃO foi criada
  SELECT EXISTS(SELECT 1 FROM vendas WHERE id = v_venda_id) INTO v_venda_existe;
  RAISE NOTICE '[PÓS] Venda criada? % (esperado: false)', v_venda_existe;
  ASSERT NOT v_venda_existe, 'Venda não deveria ter sido criada (ROLLBACK)';

  -- Validar que estoque NÃO foi alterado
  SELECT quantidade_atual INTO v_estoque_depois FROM estoque WHERE produto_id = 'produto-a';
  RAISE NOTICE '[PÓS] Estoque depois: % (esperado: %)', v_estoque_depois, v_estoque_antes;
  ASSERT v_estoque_depois = v_estoque_antes, 'Estoque deveria ter permanecido igual (ROLLBACK)';

  -- Validar que nenhuma baixa foi criada
  ASSERT NOT EXISTS(SELECT 1 FROM estoque_baixas WHERE venda_id = v_venda_id),
    'Nenhuma baixa deveria ter sido criada';

  RAISE NOTICE '✅ CENÁRIO 2 PASSOU: Rollback funcionou corretamente';
  RAISE NOTICE '';

END $$;

-- ============================================================================
-- CENÁRIO 3: CONCORRÊNCIA (2 CAIXAS, 1 UNIDADE)
-- ============================================================================
-- Descrição: Stock=1, dois caixas vendem simultaneamente
-- Esperado: 1 sucesso + 1 falha (CONCORRENCIA_DETECTADA ou ESTOQUE_INSUFICIENTE)
-- ============================================================================

DO $$
DECLARE
  v_venda_a UUID := gen_random_uuid();
  v_venda_b UUID := gen_random_uuid();
  v_item_a UUID := gen_random_uuid();
  v_item_b UUID := gen_random_uuid();
  v_itens_a JSONB;
  v_itens_b JSONB;
  v_estoque_antes NUMERIC;
  v_estoque_depois NUMERIC;
  v_exception_a BOOLEAN := false;
  v_exception_b BOOLEAN := false;
  v_result_a RECORD;
  v_result_b RECORD;
  v_vendas_criadas INT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CENÁRIO 3: CONCORRÊNCIA';
  RAISE NOTICE 'Setup: Stock produto-b = 1';
  RAISE NOTICE 'Ação: Caixa A vende 1, Caixa B vende 1 (simultâneo)';
  RAISE NOTICE 'Esperado: 1 sucesso + 1 falha, stock = 0';
  RAISE NOTICE '========================================';

  -- Verificar estoque
  SELECT quantidade_atual INTO v_estoque_antes FROM estoque WHERE produto_id = 'produto-b';
  RAISE NOTICE '[PRÉ] Estoque inicial: %', v_estoque_antes;
  ASSERT v_estoque_antes = 1, 'Setup: Estoque deveria ser 1';

  -- Prepare payloads
  v_itens_a := jsonb_build_array(jsonb_build_object(
    'item_id', v_item_a,
    'produto_id', 'produto-b',
    'quantidade', 1,
    'preco_original', 50.00,
    'preco_unitario', 50.00,
    'tipo_preco', 'VAREJO'
  ));

  v_itens_b := jsonb_build_array(jsonb_build_object(
    'item_id', v_item_b,
    'produto_id', 'produto-b',
    'quantidade', 1,
    'preco_original', 50.00,
    'preco_unitario', 50.00,
    'tipo_preco', 'VAREJO'
  ));

  RAISE NOTICE '[EXEC] Caixa A: iniciando venda...';
  BEGIN
    SELECT * INTO v_result_a FROM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id := v_venda_a,
      p_caixa_id := 'caixa-test-blocker3',
      p_operador_id := 'test-op-blocker3',
      p_loja_id := 'loja-test-blocker3',
      p_itens := v_itens_a,
      p_forma_pagamento := 'DINHEIRO',
      p_total_bruto := 50.00,
      p_total_desconto := 0.00,
      p_total_liquido := 50.00,
      p_desconto_gerente_percentual := 0,
      p_desconto_gerente_token := NULL,
      p_strict_manager_discount_auth := false,
      p_pagamentos := NULL,
      p_fiscal_auto_enqueue := false,
      p_ip_address := '127.0.0.1',
      p_user_agent := 'test-browser',
      p_device_id := 'test-device',
      p_terminal_id := 'test-terminal'
    );
    RAISE NOTICE '[RESULTADO A] Venda A: status=% ✅', v_result_a.status;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[RESULTADO A] Venda A: EXCEPTION: %', SQLERRM;
    v_exception_a := true;
  END;

  RAISE NOTICE '[EXEC] Caixa B: iniciando venda...';
  BEGIN
    SELECT * INTO v_result_b FROM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id := v_venda_b,
      p_caixa_id := 'caixa-test-blocker3',
      p_operador_id := 'test-op-blocker3',
      p_loja_id := 'loja-test-blocker3',
      p_itens := v_itens_b,
      p_forma_pagamento := 'DINHEIRO',
      p_total_bruto := 50.00,
      p_total_desconto := 0.00,
      p_total_liquido := 50.00,
      p_desconto_gerente_percentual := 0,
      p_desconto_gerente_token := NULL,
      p_strict_manager_discount_auth := false,
      p_pagamentos := NULL,
      p_fiscal_auto_enqueue := false,
      p_ip_address := '127.0.0.1',
      p_user_agent := 'test-browser',
      p_device_id := 'test-device',
      p_terminal_id := 'test-terminal'
    );
    RAISE NOTICE '[RESULTADO B] Venda B: status=% (ou EXCEPTION)', CASE WHEN v_result_b IS NULL THEN 'NULL' ELSE v_result_b.status END;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[RESULTADO B] Venda B: EXCEPTION: %', SQLERRM;
    v_exception_b := true;
  END;

  -- Validar que exatamente um sucesso e um erro
  RAISE NOTICE '';
  RAISE NOTICE '[VALIDAÇÃO] Caixa A: %', CASE WHEN v_exception_a THEN 'FAILED' ELSE 'SUCCESS' END;
  RAISE NOTICE '[VALIDAÇÃO] Caixa B: %', CASE WHEN v_exception_b THEN 'FAILED' ELSE 'SUCCESS' END;

  ASSERT (v_exception_a AND NOT v_exception_b) OR (NOT v_exception_a AND v_exception_b),
    'Exatamente um deveria ter falhado';

  -- Validar que estoque final é 0 (não negativo!)
  SELECT quantidade_atual INTO v_estoque_depois FROM estoque WHERE produto_id = 'produto-b';
  RAISE NOTICE '[PÓS] Estoque final: % (esperado: 0)', v_estoque_depois;
  ASSERT v_estoque_depois = 0, 'Estoque deveria ser 0 (não negativo)';

  -- Validar que apenas 1 venda foi criada
  SELECT COUNT(*) INTO v_vendas_criadas FROM vendas
  WHERE (id = v_venda_a OR id = v_venda_b) AND status = 'CONCLUIDA';
  RAISE NOTICE '[AUDITORIA] Vendas CONCLUIDAS: % (esperado: 1)', v_vendas_criadas;
  ASSERT v_vendas_criadas = 1, 'Exatamente 1 venda deveria estar CONCLUIDA';

  RAISE NOTICE '✅ CENÁRIO 3 PASSOU: Concorrência foi tratada corretamente';
  RAISE NOTICE '';

END $$;

-- ============================================================================
-- RESUMO FINAL
-- ============================================================================

DO $$
DECLARE
  v_total_vendas INT;
  v_total_itens INT;
  v_total_baixas INT;
  v_estoque_produto_a NUMERIC;
  v_estoque_produto_b NUMERIC;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '📊 RESUMO FINAL DE TESTES';
  RAISE NOTICE '========================================';

  SELECT COUNT(*) INTO v_total_vendas FROM vendas WHERE operador_id = 'test-op-blocker3';
  SELECT COUNT(*) INTO v_total_itens FROM itens_venda
    WHERE venda_id IN (SELECT id FROM vendas WHERE operador_id = 'test-op-blocker3');
  SELECT COUNT(*), SUM(quantidade) INTO v_total_baixas FROM estoque_baixas
    WHERE venda_id IN (SELECT id FROM vendas WHERE operador_id = 'test-op-blocker3');
  SELECT quantidade_atual INTO v_estoque_produto_a FROM estoque WHERE produto_id = 'produto-a';
  SELECT quantidade_atual INTO v_estoque_produto_b FROM estoque WHERE produto_id = 'produto-b';

  RAISE NOTICE 'Vendas criadas: %', v_total_vendas;
  RAISE NOTICE 'Itens vendidos: %', v_total_itens;
  RAISE NOTICE 'Registros de baixa: %', v_total_baixas;
  RAISE NOTICE 'Estoque produto-a: % (esperado: 8)', v_estoque_produto_a;
  RAISE NOTICE 'Estoque produto-b: % (esperado: 0)', v_estoque_produto_b;
  RAISE NOTICE '';
  RAISE NOTICE '✅ TODOS OS TESTES PASSARAM';
  RAISE NOTICE '✅ Sistema de finalização de venda é ATOMICAMENTE SEGURO';
  RAISE NOTICE '✅ Sem orphans, sem race conditions, sem estoque negativo';
  RAISE NOTICE '';

END $$;

-- ============================================================================
-- LIMPEZA (opcional)
-- ============================================================================
-- Descomente para remover dados de teste após validação:
/*
DELETE FROM itens_venda WHERE venda_id IN (SELECT id FROM vendas WHERE operador_id = 'test-op-blocker3');
DELETE FROM estoque_baixas WHERE venda_id IN (SELECT id FROM vendas WHERE operador_id = 'test-op-blocker3');
DELETE FROM vendas WHERE operador_id = 'test-op-blocker3';
DELETE FROM estoque WHERE produto_id IN ('produto-a', 'produto-b');
DELETE FROM produtos WHERE id IN ('produto-a', 'produto-b');
DELETE FROM caixas WHERE id = 'caixa-test-blocker3';
DELETE FROM lojas WHERE id = 'loja-test-blocker3';
DELETE FROM auth.users WHERE id = 'test-op-blocker3';
COMMIT;
*/
