-- Homolog Cycle 4 — venda fracionada + cartão + asserts de consistência.
-- Ambiente: Supabase local (NÃO executar em jinlong/produção).
-- Pré-requisito: produto ativo com estoque > 10 na loja matriz seed.
BEGIN;

DO $$
DECLARE
  v_loja uuid := 'a0000001-0000-4000-8000-000000000001';
  v_user uuid := 'b1000001-0000-4000-8000-000000000001';
  v_caixa uuid := gen_random_uuid();
  v_prod uuid;
  v_qtd numeric(10,3) := 0.500;
  v_preco_unit numeric(10,2);
  v_total numeric(10,2);
  v_estoque_antes numeric;
  v_estoque_depois numeric;
  v_calc jsonb;
  v_venda_frac uuid := gen_random_uuid();
  v_venda_cartao uuid := gen_random_uuid();
  v_status text;
  v_item_qtd numeric;
  v_saldo_antes numeric;
  v_saldo_depois numeric;
  v_cr_id uuid;
  v_event_ok boolean;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    v_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'operador.homolog.pdv@example.com',
    crypt('homolog-pass', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, ativo, loja_id)
  VALUES (v_user, 'Operador Homolog PDV', 'OPERADOR', 'pt', true, v_loja)
  ON CONFLICT (id) DO UPDATE
    SET perfil = 'OPERADOR', loja_id = EXCLUDED.loja_id, ativo = true;

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT p.id, e.quantidade_atual
  INTO v_prod, v_estoque_antes
  FROM public.produtos p
  JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = v_loja
  WHERE p.ativo = true AND e.quantidade_atual > 10
  ORDER BY e.quantidade_atual DESC
  LIMIT 1;

  IF v_prod IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: sem produto com estoque>10';
  END IF;

  -- Preço: RPC exige integer (faixa atacado). Fracionado (0,q) → 1, como quantidadeParaRpcPreco.
  v_calc := public.calcular_preco_produto(
    v_prod,
    GREATEST(1, FLOOR(v_qtd))::integer,
    v_loja
  );
  IF v_calc IS NULL OR (v_calc->>'preco') IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: calcular_preco_produto(qtd_rpc=%) sem preco: %',
      GREATEST(1, FLOOR(v_qtd))::integer, v_calc;
  END IF;
  v_preco_unit := public.round_abnt((v_calc->>'preco')::numeric, 2);
  v_total := public.round_abnt(v_preco_unit * v_qtd, 2);
  IF v_total < 0.01 THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: total fracionado inválido %', v_total;
  END IF;

  INSERT INTO public.caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
  VALUES (v_caixa, v_user, v_loja, 'ABERTO', 200, 200);
  v_saldo_antes := 200;

  SELECT f.status, f.contas_receber_id
  INTO v_status, v_cr_id
  FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_frac, v_caixa, v_user, v_loja, 'DINHEIRO',
    v_total, 0, v_total,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_total)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(),
      'produto_id', v_prod,
      'quantidade', v_qtd,
      'preco_original', v_preco_unit,
      'preco_unitario', v_preco_unit,
      'tipo_preco', 'VAREJO'
    )),
    NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
  ) f;

  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: venda fracionada status=%', v_status;
  END IF;
  IF v_cr_id IS NOT NULL THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: CR indevida em venda fracionada integral';
  END IF;

  SELECT iv.quantidade INTO v_item_qtd
  FROM public.itens_venda iv
  WHERE iv.venda_id = v_venda_frac
  LIMIT 1;
  IF v_item_qtd IS DISTINCT FROM v_qtd THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: item qty esperada % obtida %', v_qtd, v_item_qtd;
  END IF;

  SELECT e.quantidade_atual INTO v_estoque_depois
  FROM public.estoque e WHERE e.produto_id = v_prod AND e.loja_id = v_loja;
  IF ABS(v_estoque_depois - (v_estoque_antes - v_qtd)) > 0.0005 THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: estoque esperado % obtido %',
      v_estoque_antes - v_qtd, v_estoque_depois;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.venda_eventos
    WHERE sale_id = v_venda_frac AND event_type = 'SALE_REGISTERED'
  ) THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: SALE_REGISTERED ausente (fracionado)';
  END IF;

  -- Cartão (crédito) — cobertura Golden Flow pagamento
  v_calc := public.calcular_preco_produto(v_prod, 1, v_loja);
  v_preco_unit := public.round_abnt((v_calc->>'preco')::numeric, 2);
  SELECT f.status INTO v_status
  FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_cartao, v_caixa, v_user, v_loja, 'CARTAO_CREDITO',
    v_preco_unit, 0, v_preco_unit,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'CARTAO_CREDITO', 'valor', v_preco_unit)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(),
      'produto_id', v_prod,
      'quantidade', 1,
      'preco_original', v_preco_unit,
      'preco_unitario', v_preco_unit,
      'tipo_preco', 'VAREJO'
    )),
    NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
  ) f;
  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: venda cartão status=%', v_status;
  END IF;

  -- SSoT espécie (049): valor_sistema = valor_inicial + vendas DINHEIRO + mov − devoluções.
  -- saldo_atual NÃO é incrementado pela v4 (só sangria/suprimento/estorno).
  SELECT c.saldo_atual INTO v_saldo_depois FROM public.caixas c WHERE c.id = v_caixa;
  IF ABS(v_saldo_depois - v_saldo_antes) > 0.009 THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: saldo_atual mudou na venda (antes=% depois=%) — v4 não deve alterar',
      v_saldo_antes, v_saldo_depois;
  END IF;
  v_saldo_depois := public.calcular_valor_sistema_dinheiro_caixa(v_caixa);
  IF ABS(v_saldo_depois - (v_saldo_antes + v_total)) > 0.02 THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: valor_sistema esperado % obtido % (inicial=% + dinheiro_frac=%)',
      v_saldo_antes + v_total, v_saldo_depois, v_saldo_antes, v_total;
  END IF;

  v_event_ok := EXISTS (
    SELECT 1 FROM public.venda_eventos
    WHERE sale_id = v_venda_cartao AND event_type = 'SALE_REGISTERED'
  );
  IF NOT v_event_ok THEN
    RAISE EXCEPTION 'SMOKE_FRAC_FAIL: SALE_REGISTERED ausente (cartão)';
  END IF;

  RAISE NOTICE 'SMOKE_FRAC_OK qtd=% unit=% total=% estoque=%->% dinheiro_frac=% cartao=% saldo_atual_ok=% valor_sistema=%',
    v_qtd, v_preco_unit, v_total, v_estoque_antes, v_estoque_depois,
    v_venda_frac, v_venda_cartao, v_saldo_antes, v_saldo_depois;
END $$;

COMMIT;
