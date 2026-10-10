-- A-L1 G3/G4 — probes + smoke funcional (stack fastproduct-capacity).
\set ON_ERROR_STOP on

\echo '=== G3 schema probes ==='
SELECT count(*)::int AS migrations
FROM supabase_migrations.schema_migrations \gset
\echo migrations=:'migrations'
SELECT CASE WHEN :migrations >= 400 THEN 'PASS' ELSE 'FAIL' END AS g3_migrations;

SELECT string_agg(proname, ',' ORDER BY proname) AS rpcs
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'finalizar_venda_transacional_canonica_v4',
    'fechar_caixa_atomico',
    'retomar_caixa_atomico',
    'financeiro_comando',
    'financeiro_painel'
  ) \gset
\echo rpcs=:'rpcs'

SELECT bool_and(c.relrowsecurity) AS rls_all
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('vendas', 'estoque', 'lojas', 'produtos', 'caixas') \gset
\echo rls_all=:'rls_all'

SELECT count(*)::int AS public_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT count(*)::int AS rls_enabled_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity;

SELECT count(*)::int AS triggers_public
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal;

SELECT count(*)::int AS check_constraints
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace;

SELECT count(*)::int AS indexes_public
FROM pg_indexes
WHERE schemaname = 'public';

\echo '=== G4 functional smoke (transactional, ROLLBACK) ==='
BEGIN;

DO $smoke$
DECLARE
  v_loja_a uuid := 'a0000001-0000-4000-8000-000000000001';
  v_loja_b uuid := 'b0000002-0000-4000-8000-000000000002';
  v_op_a uuid := '33333333-3333-4333-8333-333333333333';
  v_dono uuid := '11111111-1111-4111-8111-111111111111';
  v_op_b uuid := 'c1000002-0000-4000-8000-000000000002';
  v_prod_a uuid;
  v_caixa uuid;
  v_operador uuid;
  v_preco numeric;
  v_estoque_antes numeric;
  v_estoque_depois numeric;
  v_venda_id uuid := gen_random_uuid();
  v_status text;
  v_own int;
  v_other int;
  v_fin jsonb;
  v_painel jsonb;
  v_itens jsonb;
  v_pagamentos jsonb;
BEGIN
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja_b, 'Capacity Smoke B', 'CAP_SMK_B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_op_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'op.b.capacity@local.test', now(), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_op_b, 'Op Smoke B', 'OPERADOR', true, v_loja_b)
  ON CONFLICT (id) DO UPDATE
    SET loja_id = EXCLUDED.loja_id, ativo = true, perfil = 'OPERADOR';

  INSERT INTO public.produtos (
    id, loja_id, nome, codigo_barras, preco_varejo, preco_custo, ativo, origem
  ) VALUES (
    'd1000002-0000-4000-8000-000000000002', v_loja_b,
    'Produto Smoke B', 'CAPSMKB001', 9.90, 1.00, true, 'china_manual'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual)
  VALUES ('d1000002-0000-4000-8000-000000000002', v_loja_b, 50)
  ON CONFLICT (produto_id, loja_id) DO UPDATE
    SET quantidade_atual = GREATEST(public.estoque.quantidade_atual, 50);

  -- Isolamento: operador A não lê produtos da loja B
  PERFORM set_config('request.jwt.claim.sub', v_op_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_op_a),
    true
  );
  SET LOCAL ROLE authenticated;

  SELECT count(*)::int INTO v_own
  FROM public.produtos WHERE loja_id = v_loja_a AND ativo;

  SELECT count(*)::int INTO v_other
  FROM public.produtos WHERE loja_id = v_loja_b;

  IF v_own < 1 THEN
    RAISE EXCEPTION 'isolation_fail: operador A sem produtos da própria loja';
  END IF;
  IF v_other <> 0 THEN
    RAISE EXCEPTION 'isolation_fail: operador A viu % produtos da loja B', v_other;
  END IF;

  RESET ROLE;

  -- Venda v4 autenticada (operador do caixa aberto)
  SELECT c.id, c.operador_id, p.id,
         (public.calcular_preco_produto(p.id, 1, c.loja_id)->>'preco')::numeric,
         e.quantidade_atual
  INTO v_caixa, v_operador, v_prod_a, v_preco, v_estoque_antes
  FROM public.caixas c
  JOIN public.produtos p ON p.loja_id = c.loja_id AND p.ativo AND p.preco_varejo > 0
  JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = p.loja_id
    AND e.quantidade_atual > 0
  WHERE c.status = 'ABERTO'
    AND c.operador_id IS NOT NULL
    AND c.loja_id = v_loja_a
  ORDER BY p.id
  LIMIT 1;

  IF v_caixa IS NULL OR v_preco IS NULL THEN
    RAISE EXCEPTION 'v4_fail: sem caixa aberto + produto com estoque na Matriz';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_operador),
    true
  );
  SET LOCAL ROLE authenticated;

  v_itens := jsonb_build_array(jsonb_build_object(
    'item_id', gen_random_uuid(),
    'produto_id', v_prod_a,
    'quantidade', 1,
    'preco_original', v_preco,
    'preco_unitario', v_preco,
    'tipo_preco', 'VAREJO'
  ));
  v_pagamentos := jsonb_build_array(
    jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_preco)
  );

  SELECT r.status INTO v_status
  FROM public.finalizar_venda_transacional_canonica_v4(
    p_venda_id => v_venda_id,
    p_caixa_id => v_caixa,
    p_operador_id => v_operador,
    p_loja_id => v_loja_a,
    p_forma_pagamento => 'DINHEIRO',
    p_total_bruto => v_preco,
    p_total_desconto => 0,
    p_total_liquido => v_preco,
    p_pagamentos => v_pagamentos,
    p_itens => v_itens
  ) r;

  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'v4_fail: status=% esperado CONCLUIDA', v_status;
  END IF;

  SELECT quantidade_atual INTO v_estoque_depois
  FROM public.estoque WHERE produto_id = v_prod_a AND loja_id = v_loja_a;

  IF v_estoque_depois <> v_estoque_antes - 1 THEN
    RAISE EXCEPTION 'estoque_fail: antes=% depois=%', v_estoque_antes, v_estoque_depois;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.caixas WHERE id = v_caixa AND status = 'ABERTO'
  ) THEN
    RAISE EXCEPTION 'caixa_fail: caixa % não permanece ABERTO após venda', v_caixa;
  END IF;

  RESET ROLE;

  -- Financeiro como DONO da Matriz
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_dono),
    true
  );
  SET LOCAL ROLE authenticated;

  v_fin := public.financeiro_comando(
    'CRIAR_CONTA',
    jsonb_build_object(
      'nome', 'Conta Smoke Capacity',
      'tipo', 'BANCO',
      'data', (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ),
    gen_random_uuid()
  );

  IF v_fin IS NULL OR (v_fin->>'id') IS NULL THEN
    RAISE EXCEPTION 'financeiro_fail: CRIAR_CONTA sem id (% )', v_fin;
  END IF;

  v_painel := public.financeiro_painel(
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 30),
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1),
    1
  );

  IF v_painel IS NULL THEN
    RAISE EXCEPTION 'financeiro_fail: painel null';
  END IF;

  RAISE NOTICE
    'G4_OK own_produtos=% isolation_other=% v4_status=% estoque=%→% fin_id=%',
    v_own, v_other, v_status, v_estoque_antes, v_estoque_depois, v_fin->>'id';
END
$smoke$;

ROLLBACK;
\echo '=== G4 ROLLBACK done ==='
