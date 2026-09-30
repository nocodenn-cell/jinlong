-- Homolog smoke Sprint B — seed mínimo + exercício da RPC devolver_ou_trocar_venda
-- Ambiente: Supabase local (Docker) — NÃO executar em jinlong/produção
BEGIN;

DO $$
DECLARE
  v_loja uuid := 'a0000001-0000-4000-8000-000000000001';
  v_user uuid := 'b0000001-0000-4000-8000-000000000001';
  v_prod uuid := 'c0000001-0000-4000-8000-000000000001';
  v_caixa uuid := 'd0000001-0000-4000-8000-000000000001';
  v_venda uuid := 'e0000001-0000-4000-8000-000000000001';
  v_item uuid := 'f0000001-0000-4000-8000-000000000001';
  v_op uuid;
  v_estoque_antes numeric;
  v_estoque_depois numeric;
  v_saldo_antes numeric;
  v_saldo_depois numeric;
  v_valor_estornado numeric;
  v_valor_caixa numeric;
BEGIN
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'Homolog Loja', 'HOMOL', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    v_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gerente.homolog@example.com',
    crypt('homolog-pass', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, ativo, loja_id)
  VALUES (v_user, 'Gerente Homolog', 'GERENTE', 'pt', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = 'GERENTE', loja_id = EXCLUDED.loja_id, ativo = true;

  INSERT INTO public.produtos (
    id, nome, codigo_barras, preco_varejo, ativo, loja_id, status_publicacao, origem
  ) VALUES (
    v_prod, 'Produto Homolog Devolucao', '7890000000001', 10.00, true, v_loja, 'PUBLICADO', 'china_manual'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
  VALUES (v_prod, v_loja, 5, 0, 1)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 5, version = estoque.version + 1;

  INSERT INTO public.caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
  VALUES (v_caixa, v_user, v_loja, 'ABERTO', 100, 100)
  ON CONFLICT (id) DO UPDATE SET status = 'ABERTO', saldo_atual = 100, operador_id = v_user;

  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido,
    forma_pagamento, status, data
  ) VALUES (
    v_venda, v_caixa, v_user, 20, 0, 20, 'DINHEIRO', 'CONCLUIDA', now()
  ) ON CONFLICT (id) DO UPDATE SET status = 'CONCLUIDA', total_liquido = 20, forma_pagamento = 'DINHEIRO';

  INSERT INTO public.itens_venda (
    id, venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco
  ) VALUES (
    v_item, v_venda, v_prod, 2, 10, 10, 0, 'VAREJO'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT quantidade_atual INTO v_estoque_antes
  FROM public.estoque WHERE produto_id = v_prod AND loja_id = v_loja;

  -- PR-2D: a verdade do caixa é a autoridade (internal.valor_sistema_dinheiro); saldo_atual é cache derivado.
  v_saldo_antes := internal.valor_sistema_dinheiro(v_caixa);

  SELECT operacao_id, valor_estornado, valor_caixa_estornado
  INTO v_op, v_valor_estornado, v_valor_caixa
  FROM public.devolver_ou_trocar_venda(
    v_venda,
    'homolog-key-001',
    'Smoke homolog: defeito',
    'DEVOLUCAO',
    jsonb_build_array(jsonb_build_object('item_venda_id', v_item, 'quantidade', 1)),
    10.00,
    'DINHEIRO',
    NULL,
    v_user,
    v_caixa
  );

  IF v_op IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: operacao_id nulo';
  END IF;

  -- Idempotência: mesma chave deve retornar a mesma operação
  PERFORM * FROM public.devolver_ou_trocar_venda(
    v_venda,
    'homolog-key-001',
    'Smoke homolog: defeito',
    'DEVOLUCAO',
    jsonb_build_array(jsonb_build_object('item_venda_id', v_item, 'quantidade', 1)),
    10.00,
    'DINHEIRO',
    NULL,
    v_user,
    v_caixa
  );

  SELECT quantidade_atual INTO v_estoque_depois
  FROM public.estoque WHERE produto_id = v_prod AND loja_id = v_loja;

  v_saldo_depois := internal.valor_sistema_dinheiro(v_caixa);

  IF v_estoque_depois <> v_estoque_antes + 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: estoque esperado %, obtido %', v_estoque_antes + 1, v_estoque_depois;
  END IF;

  IF v_saldo_depois <> v_saldo_antes - 10 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: caixa (autoridade) esperado %, obtido %', v_saldo_antes - 10, v_saldo_depois;
  END IF;

  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo_depois THEN
    RAISE EXCEPTION 'SMOKE_FAIL: cache saldo_atual deveria refletir a autoridade (%)', v_saldo_depois;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.devolucoes WHERE operacao_id = v_op AND forma_pagamento = 'DINHEIRO' AND caixa_desembolso_id = v_caixa) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: devolução em dinheiro sem caixa_desembolso_id';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.devolucoes WHERE venda_id = v_venda AND operacao_id = v_op) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: devolucoes ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.estoque_reposicoes_devolucao WHERE operacao_id = v_op AND produto_id = v_prod
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: kardex reposicao ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.venda_eventos
    WHERE sale_id = v_venda AND event_type = 'SALE_PARTIAL_RETURN'
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: ledger SALE_PARTIAL_RETURN ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.v_kardex_unificado
    WHERE tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE' AND referencia_id = v_venda
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: view kardex sem ENTRADA_DEVOLUCAO_CLIENTE';
  END IF;

  RAISE NOTICE 'SMOKE_OK operacao=% estoque=%->% caixa=%->% valor_estornado=% valor_caixa=%',
    v_op, v_estoque_antes, v_estoque_depois, v_saldo_antes, v_saldo_depois, v_valor_estornado, v_valor_caixa;
END $$;

COMMIT;
