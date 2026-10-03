-- SMOKE OPERACIONAL COMPLETO (SUPABASE / SQL EDITOR)
-- Simula: COMPRA (ENTRADA DE ESTOQUE), VENDA (DINHEIRO/PIX/CRÉDITO/DÉBITO),
-- DESCONTO DE GERENTE, CANCELAMENTO, MOVIMENTOS DE CAIXA E FECHAMENTO DE CAIXA.
-- Usa registrar_venda_com_itens (caminho PDV local / service_role).
-- Para smoke do fluxo web-caixa, use finalizar_venda_transacional_canonica_v4.
--
-- PRÉ-REQUISITOS:
-- - Banco alinhado ao repositório (sem lacunas em migration list), incluindo loja/estoque por loja (ex.: pacote 032+).
-- - PELO MENOS 1 USUÁRIO OPERADOR EM public.usuarios (ou outro perfil ativo — o script faz fallback).
-- - PELO MENOS 4 PRODUTOS ATIVOS COM ESTOQUE > 0.
--
-- OBS: ESTE SCRIPT GERA DADOS FICTÍCIOS DE TESTE.
-- PADRÃO DE SEGURANÇA: a execução é transacional e termina em ROLLBACK.
-- Para persistir deliberadamente, substitua o ROLLBACK final por COMMIT.

BEGIN;

DO $$
DECLARE
  v_loja_matriz uuid := 'a0000001-0000-4000-8000-000000000001'::uuid;
  v_operador_id uuid;
  v_auth_user_id uuid;
  v_caixa_id uuid := gen_random_uuid();
  v_prod_1 uuid;
  v_prod_2 uuid;
  v_prod_3 uuid;
  v_prod_4 uuid;
  v_venda_dinheiro uuid := gen_random_uuid();
  v_venda_pix uuid := gen_random_uuid();
  v_venda_credito uuid := gen_random_uuid();
  v_venda_debito uuid := gen_random_uuid();
  v_venda_desconto uuid := gen_random_uuid();
  v_cancelada uuid;
  v_preco_1 numeric(10,2);
  v_preco_2 numeric(10,2);
  v_preco_3 numeric(10,2);
  v_preco_4 numeric(10,2);
  v_count int;
BEGIN
  -- Prioriza OPERADOR ativo; fallback para qualquer usuário ativo (ex.: GERENTE/DONO)
  -- para não bloquear homologação em ambientes sem operador seedado.
  SELECT u.id
  INTO v_operador_id
  FROM public.usuarios u
  WHERE u.perfil = 'OPERADOR'
    AND u.ativo = true
  ORDER BY u.created_at
  LIMIT 1;

  IF v_operador_id IS NULL THEN
    SELECT u.id
    INTO v_operador_id
    FROM public.usuarios u
    WHERE u.ativo = true
    ORDER BY
      CASE u.perfil
        WHEN 'GERENTE' THEN 1
        WHEN 'DONO' THEN 2
        ELSE 3
      END,
      u.created_at
    LIMIT 1;
  END IF;

  IF v_operador_id IS NULL THEN
    -- Fallback final: tenta semear public.usuarios a partir de auth.users.
    SELECT au.id
    INTO v_auth_user_id
    FROM auth.users au
    ORDER BY au.created_at
    LIMIT 1;

    IF v_auth_user_id IS NULL THEN
      RAISE EXCEPTION 'SMOKE_ABORT: NÃO HÁ USUÁRIO EM auth.users; crie/login um usuário primeiro';
    END IF;

    INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, ativo)
    VALUES (v_auth_user_id, 'SMOKE Operador', 'OPERADOR', 'pt', true)
    ON CONFLICT (id) DO UPDATE
      SET ativo = true;

    v_operador_id := v_auth_user_id;
  END IF;

  SELECT p.id, p.preco_varejo INTO v_prod_1, v_preco_1
  FROM public.produtos p
  JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = v_loja_matriz
  WHERE p.ativo = true
    AND e.quantidade_atual > 5
  ORDER BY p.nome
  LIMIT 1;

  SELECT p.id, p.preco_varejo INTO v_prod_2, v_preco_2
  FROM public.produtos p
  JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = v_loja_matriz
  WHERE p.ativo = true
    AND e.quantidade_atual > 5
    AND p.id <> v_prod_1
  ORDER BY p.nome
  LIMIT 1;

  SELECT p.id, p.preco_varejo INTO v_prod_3, v_preco_3
  FROM public.produtos p
  JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = v_loja_matriz
  WHERE p.ativo = true
    AND e.quantidade_atual > 5
    AND p.id NOT IN (v_prod_1, v_prod_2)
  ORDER BY p.nome
  LIMIT 1;

  SELECT p.id, p.preco_varejo INTO v_prod_4, v_preco_4
  FROM public.produtos p
  JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = v_loja_matriz
  WHERE p.ativo = true
    AND e.quantidade_atual > 5
    AND p.id NOT IN (v_prod_1, v_prod_2, v_prod_3)
  ORDER BY p.nome
  LIMIT 1;

  IF v_prod_1 IS NULL OR v_prod_2 IS NULL OR v_prod_3 IS NULL OR v_prod_4 IS NULL THEN
    RAISE EXCEPTION 'SMOKE_ABORT: NECESSÁRIOS 4 PRODUTOS ATIVOS COM ESTOQUE > 5';
  END IF;

  INSERT INTO public.caixas (
    id, operador_id, data_abertura, valor_inicial, status
  ) VALUES (
    v_caixa_id, v_operador_id, now(), 200.00, 'ABERTO'
  );

  -- "COMPRA" (ENTRADA DE ESTOQUE) FICTÍCIA
  UPDATE public.estoque
  SET quantidade_atual = quantidade_atual + 20
  WHERE produto_id = v_prod_1
    AND loja_id = v_loja_matriz;

  -- MOVIMENTOS DE CAIXA
  INSERT INTO public.movimentos_caixa (caixa_id, tipo, valor, observacao)
  VALUES
    (v_caixa_id, 'SUPRIMENTO', 150.00, 'SMOKE: SUPRIMENTO INICIAL'),
    (v_caixa_id, 'SANGRIA', 45.00, 'SMOKE: SANGRIA OPERACIONAL');

  -- VENDA DINHEIRO
  PERFORM public.registrar_venda_com_itens(
    p_venda_id        => v_venda_dinheiro,
    p_caixa_id        => v_caixa_id,
    p_operador_id     => v_operador_id,
    p_forma_pagamento => 'DINHEIRO',
    p_total_bruto     => round(v_preco_1 * 2, 2),
    p_total_desconto  => 0,
    p_total_liquido   => round(v_preco_1 * 2, 2),
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_prod_1,
        'quantidade', 2,
        'preco_original', v_preco_1,
        'preco_unitario', v_preco_1,
        'tipo_preco', 'VAREJO'
      )
    )
  );

  -- VENDA PIX
  PERFORM public.registrar_venda_com_itens(
    p_venda_id        => v_venda_pix,
    p_caixa_id        => v_caixa_id,
    p_operador_id     => v_operador_id,
    p_forma_pagamento => 'PIX',
    p_total_bruto     => v_preco_2,
    p_total_desconto  => 0,
    p_total_liquido   => v_preco_2,
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_prod_2,
        'quantidade', 1,
        'preco_original', v_preco_2,
        'preco_unitario', v_preco_2,
        'tipo_preco', 'VAREJO'
      )
    )
  );

  -- VENDA CARTÃO CRÉDITO
  PERFORM public.registrar_venda_com_itens(
    p_venda_id        => v_venda_credito,
    p_caixa_id        => v_caixa_id,
    p_operador_id     => v_operador_id,
    p_forma_pagamento => 'CARTAO_CREDITO',
    p_total_bruto     => v_preco_3,
    p_total_desconto  => 0,
    p_total_liquido   => v_preco_3,
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_prod_3,
        'quantidade', 1,
        'preco_original', v_preco_3,
        'preco_unitario', v_preco_3,
        'tipo_preco', 'VAREJO'
      )
    )
  );

  -- VENDA CARTÃO DÉBITO
  PERFORM public.registrar_venda_com_itens(
    p_venda_id        => v_venda_debito,
    p_caixa_id        => v_caixa_id,
    p_operador_id     => v_operador_id,
    p_forma_pagamento => 'CARTAO_DEBITO',
    p_total_bruto     => v_preco_4,
    p_total_desconto  => 0,
    p_total_liquido   => v_preco_4,
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_prod_4,
        'quantidade', 1,
        'preco_original', v_preco_4,
        'preco_unitario', v_preco_4,
        'tipo_preco', 'VAREJO'
      )
    )
  );

  -- VENDA COM DESCONTO DE GERENTE
  PERFORM public.registrar_venda_com_itens(
    p_venda_id        => v_venda_desconto,
    p_caixa_id        => v_caixa_id,
    p_operador_id     => v_operador_id,
    p_forma_pagamento => 'DINHEIRO',
    p_total_bruto     => v_preco_1,
    p_total_desconto  => round(v_preco_1 * 0.10, 2),
    p_total_liquido   => round(v_preco_1 * 0.90, 2),
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_prod_1,
        'quantidade', 1,
        'preco_original', v_preco_1,
        'preco_unitario', v_preco_1,
        'tipo_preco', 'VAREJO'
      )
    ),
    p_desconto_gerente_percentual => 10,
    p_desconto_gerente_valor      => round(v_preco_1 * 0.10, 2)
  );

  -- CANCELAMENTO (MARCA 1 VENDA COMO CANCELADA)
  UPDATE public.vendas
  SET status = 'CANCELADA'
  WHERE id = v_venda_debito
  RETURNING id INTO v_cancelada;

  IF v_cancelada IS NULL THEN
    RAISE EXCEPTION 'SMOKE_ABORT: FALHA AO CANCELAR VENDA DE DÉBITO';
  END IF;

  -- FECHAMENTO DE CAIXA
  UPDATE public.caixas
  SET
    status = 'FECHADO',
    data_fechamento = now(),
    valor_fechamento = 320.00,
    fechamento_diferenca = 0
  WHERE id = v_caixa_id;

  -- VALIDAÇÕES
  SELECT COUNT(*)
  INTO v_count
  FROM public.vendas
  WHERE caixa_id = v_caixa_id;
  IF v_count < 5 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: ESPERADO >= 5 VENDAS NO CAIXA, OBTIDO %', v_count;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.vendas
  WHERE caixa_id = v_caixa_id
    AND forma_pagamento = 'PIX';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: VENDA PIX NÃO ENCONTRADA';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.vendas
  WHERE caixa_id = v_caixa_id
    AND forma_pagamento = 'CARTAO_CREDITO';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: VENDA CARTAO_CREDITO NÃO ENCONTRADA';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.vendas
  WHERE caixa_id = v_caixa_id
    AND forma_pagamento = 'CARTAO_DEBITO'
    AND status = 'CANCELADA';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: CANCELAMENTO NÃO VALIDADO';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.descontos_venda
  WHERE venda_id = v_venda_desconto;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: DESCONTO DE GERENTE NÃO REGISTRADO';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.movimentos_caixa
  WHERE caixa_id = v_caixa_id
    AND tipo IN ('SUPRIMENTO', 'SANGRIA');
  IF v_count < 2 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: MOVIMENTOS DE CAIXA (SUPRIMENTO/SANGRIA) INCOMPLETOS';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.caixas
  WHERE id = v_caixa_id
    AND status = 'FECHADO'
    AND data_fechamento IS NOT NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: FECHAMENTO DE CAIXA NÃO CONFIRMADO';
  END IF;

  RAISE NOTICE 'SMOKE_OK: CAIXA % TESTADO COM SUCESSO.', v_caixa_id;
END $;

ROLLBACK;
