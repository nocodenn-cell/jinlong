-- Homolog PDV web — fluxo completo em ambiente limpo (Supabase local).
-- Cobre: pesquisa/preço → espera → retomar → multi-pagamento → saldo pendente
-- (contas_receber 24702) → kardex → integridade financeira → cancelamento →
-- negativos → asserts de RLS/JWT.
-- NÃO executar em jinlong/produção.
BEGIN;

DO $$
DECLARE
  v_loja uuid := 'a0000001-0000-4000-8000-000000000001';
  v_user uuid := 'b1000001-0000-4000-8000-000000000001';
  v_caixa uuid := gen_random_uuid();
  v_caixa_fechado uuid := gen_random_uuid();
  v_cliente uuid := gen_random_uuid();
  v_prod uuid;
  v_preco numeric(10,2);
  v_estoque_antes numeric;
  v_estoque_depois numeric;
  v_estoque_pos_cancel numeric;
  v_calc jsonb;
  v_espera jsonb;
  v_espera_id uuid;
  v_retomada jsonb;
  v_lista_espera jsonb;
  v_venda_dinheiro uuid := gen_random_uuid();
  v_venda_split uuid := gen_random_uuid();
  v_venda_pix uuid := gen_random_uuid();
  v_venda_parcial uuid := gen_random_uuid();
  v_venda_cancel uuid := gen_random_uuid();
  v_status text;
  v_pag_count int;
  v_pag_sum numeric(12,2);
  v_total_liq numeric(12,2);
  v_cr_aberto numeric(12,2);
  v_itens jsonb;
  v_half numeric(10,2);
  v_rest numeric(10,2);
  v_pago_parcial numeric(10,2);
  v_kardex_count int;
  v_neg_ok boolean;
  v_has_contas_receber boolean;
  v_has_auditoria_cancel boolean;
  v_jwt_role text;
  v_auth_uid uuid;
  v_full_sale_ids uuid[];
  v_sale_id uuid;
BEGIN
  -- ---------- Seed auth / operador ----------
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

  -- 8) RLS authenticity — JWT autenticado antes das RPCs de negócio
  v_auth_uid := auth.uid();
  v_jwt_role := current_setting('request.jwt.claim.role', true);
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: auth.uid() nulo (JWT sub ausente)';
  END IF;
  IF v_jwt_role IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: jwt role=% (esperado authenticated)', v_jwt_role;
  END IF;
  IF current_setting('role', true) = 'service_role' THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: sessão em service_role — smoke exige authenticated';
  END IF;

  v_has_contas_receber := to_regclass('public.contas_receber') IS NOT NULL;
  v_has_auditoria_cancel := to_regclass('public.vendas_canceladas_auditoria') IS NOT NULL;

  -- 9) Seed resilience — barcode preferido; fallback estoque>10
  SELECT p.id, p.preco_varejo, e.quantidade_atual
  INTO v_prod, v_preco, v_estoque_antes
  FROM public.produtos p
  JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = v_loja
  WHERE p.codigo_barras = '7898512340003' AND p.ativo = true
  LIMIT 1;

  IF v_prod IS NULL THEN
    SELECT p.id, p.preco_varejo, e.quantidade_atual
    INTO v_prod, v_preco, v_estoque_antes
    FROM public.produtos p
    JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = v_loja
    WHERE p.ativo = true AND e.quantidade_atual > 10
    ORDER BY e.quantidade_atual DESC
    LIMIT 1;
  END IF;

  IF v_prod IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: nenhum produto ativo com estoque>10 na matriz';
  END IF;
  IF v_estoque_antes IS NULL OR v_estoque_antes < 10 THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: estoque insuficiente para smoke (atual=%)', v_estoque_antes;
  END IF;

  INSERT INTO public.clientes (id, nome, documento, telefone, limite_credito, ativo, loja_id)
  VALUES (v_cliente, 'Cliente Homolog PDV Web', 'SMOKE-PDV-WEB', '11988887777', 5000, true, v_loja)
  ON CONFLICT (id) DO NOTHING;

  v_calc := public.calcular_preco_produto(v_prod, 1, v_loja);
  IF v_calc IS NULL OR (v_calc->>'preco') IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: calcular_preco_produto sem preco: %', v_calc;
  END IF;
  v_preco := public.round_abnt((v_calc->>'preco')::numeric, 2);

  INSERT INTO public.caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
  VALUES (v_caixa, v_user, v_loja, 'ABERTO', 200, 200);

  INSERT INTO public.caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
  VALUES (v_caixa_fechado, v_user, v_loja, 'FECHADO', 0, 0);

  v_itens := jsonb_build_array(
    jsonb_build_object(
      'item_id', gen_random_uuid(),
      'produto_id', v_prod,
      'quantidade', 1,
      'preco_original', v_preco,
      'preco_unitario', v_preco,
      'tipo_preco', 'VAREJO'
    )
  );

  -- ---------- Venda em espera → listar → retomar → sumiu da lista ----------
  v_espera := public.colocar_venda_em_espera(
    v_itens,
    jsonb_build_object('total_liquido', v_preco, 'total_bruto', v_preco),
    v_caixa,
    'SMOKE_PDV_WEB',
    NULL, NULL, NULL
  );
  v_espera_id := (v_espera->>'id')::uuid;
  IF v_espera_id IS NULL OR COALESCE(v_espera->>'status', '') <> 'EM_ESPERA' THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: colocar_venda_em_espera: %', v_espera;
  END IF;

  IF jsonb_array_length(public.listar_vendas_em_espera()) < 1 THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: listar_vendas_em_espera vazio';
  END IF;

  v_retomada := public.retomar_venda_em_espera(v_espera_id);
  IF v_retomada IS NULL OR (v_retomada->>'id') IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: retomar_venda_em_espera: %', v_retomada;
  END IF;

  -- 4) Após retomar, id não deve permanecer em EM_ESPERA
  v_lista_espera := public.listar_vendas_em_espera();
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_lista_espera, '[]'::jsonb)) e
    WHERE (e.value->>'id')::uuid = v_espera_id
  ) THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: v_espera_id ainda em listar_vendas_em_espera';
  END IF;

  -- ---------- Venda unitária DINHEIRO (pagamento integral) ----------
  SELECT f.status INTO v_status
  FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_dinheiro, v_caixa, v_user, v_loja, 'DINHEIRO',
    v_preco, 0, v_preco,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_preco)),
    v_itens,
    NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
  ) f;
  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: venda DINHEIRO status=%', v_status;
  END IF;

  -- ---------- Venda unitária PIX ----------
  v_itens := jsonb_build_array(
    jsonb_build_object(
      'item_id', gen_random_uuid(),
      'produto_id', v_prod,
      'quantidade', 1,
      'preco_original', v_preco,
      'preco_unitario', v_preco,
      'tipo_preco', 'VAREJO'
    )
  );
  SELECT f.status INTO v_status
  FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_pix, v_caixa, v_user, v_loja, 'PIX',
    v_preco, 0, v_preco,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'PIX', 'valor', v_preco)),
    v_itens,
    NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
  ) f;
  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: venda PIX status=%', v_status;
  END IF;

  -- ---------- Split DINHEIRO + PIX ----------
  v_half := public.round_abnt(v_preco / 2, 2);
  v_rest := public.round_abnt(v_preco - v_half, 2);
  v_itens := jsonb_build_array(
    jsonb_build_object(
      'item_id', gen_random_uuid(),
      'produto_id', v_prod,
      'quantidade', 1,
      'preco_original', v_preco,
      'preco_unitario', v_preco,
      'tipo_preco', 'VAREJO'
    )
  );
  SELECT f.status INTO v_status
  FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_split, v_caixa, v_user, v_loja, 'DINHEIRO',
    v_preco, 0, v_preco,
    jsonb_build_array(
      jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_half),
      jsonb_build_object('forma_pagamento', 'PIX', 'valor', v_rest)
    ),
    v_itens,
    NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
  ) f;
  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: venda split status=%', v_status;
  END IF;

  SELECT COUNT(*) INTO v_pag_count
  FROM public.vendas_pagamentos WHERE venda_id = v_venda_split;
  IF v_pag_count < 2 THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: split esperava 2 pagamentos, obteve %', v_pag_count;
  END IF;

  -- 1) contas_receber (24702) — caminho saldo pendente + cliente
  v_pago_parcial := public.round_abnt(v_preco / 2, 2);
  IF v_pago_parcial <= 0.01 THEN
    v_pago_parcial := public.round_abnt(GREATEST(v_preco - 1, 0.01), 2);
  END IF;
  v_itens := jsonb_build_array(
    jsonb_build_object(
      'item_id', gen_random_uuid(),
      'produto_id', v_prod,
      'quantidade', 1,
      'preco_original', v_preco,
      'preco_unitario', v_preco,
      'tipo_preco', 'VAREJO'
    )
  );
  SELECT f.status INTO v_status
  FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_parcial, v_caixa, v_user, v_loja, 'DINHEIRO',
    v_preco, 0, v_preco,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_pago_parcial)),
    v_itens,
    NULL, NULL, false, false, NULL, NULL, NULL, NULL,
    v_cliente
  ) f;
  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: venda parcial status=%', v_status;
  END IF;

  IF v_has_contas_receber THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.contas_receber cr
      WHERE cr.venda_id = v_venda_parcial
        AND cr.cliente_id = v_cliente
        AND cr.valor_aberto > 0.009
        AND cr.status IN ('ABERTO', 'PARCIAL')
    ) THEN
      RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: contas_receber ausente para venda parcial %', v_venda_parcial;
    END IF;
    -- Pagamento integral NÃO exige contas_receber
    IF EXISTS (SELECT 1 FROM public.contas_receber WHERE venda_id = v_venda_dinheiro) THEN
      RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: contas_receber indevida em venda integral';
    END IF;
  ELSE
    RAISE NOTICE 'SMOKE_PDV_WEB_NOTE: tabela contas_receber ausente — skip assert 24702';
  END IF;

  -- ---------- Venda pequena para cancelamento ----------
  v_itens := jsonb_build_array(
    jsonb_build_object(
      'item_id', gen_random_uuid(),
      'produto_id', v_prod,
      'quantidade', 1,
      'preco_original', v_preco,
      'preco_unitario', v_preco,
      'tipo_preco', 'VAREJO'
    )
  );
  SELECT f.status INTO v_status
  FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_cancel, v_caixa, v_user, v_loja, 'DINHEIRO',
    v_preco, 0, v_preco,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_preco)),
    v_itens,
    NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
  ) f;
  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: venda cancel-alvo status=%', v_status;
  END IF;

  SELECT e.quantidade_atual INTO v_estoque_depois
  FROM public.estoque e WHERE e.produto_id = v_prod AND e.loja_id = v_loja;
  -- 5 vendas unitárias finalizadas
  IF v_estoque_depois <> v_estoque_antes - 5 THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: estoque pré-cancel esperado % obtido %',
      v_estoque_antes - 5, v_estoque_depois;
  END IF;

  -- 3) Integridade financeira — vendas integrais: SUM(pag) = total_liquido
  v_full_sale_ids := ARRAY[v_venda_dinheiro, v_venda_pix, v_venda_split, v_venda_cancel];
  FOREACH v_sale_id IN ARRAY v_full_sale_ids
  LOOP
    SELECT v.total_liquido, COALESCE(SUM(vp.valor), 0)
    INTO v_total_liq, v_pag_sum
    FROM public.vendas v
    LEFT JOIN public.vendas_pagamentos vp ON vp.venda_id = v.id
    WHERE v.id = v_sale_id
    GROUP BY v.total_liquido;
    IF ABS(v_pag_sum - v_total_liq) > 0.02 THEN
      RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: pagamentos % <> total_liquido % (venda %)',
        v_pag_sum, v_total_liq, v_sale_id;
    END IF;
  END LOOP;

  -- Parcial: SUM(pag) + valor_aberto = total_liquido
  IF v_has_contas_receber THEN
    SELECT v.total_liquido, COALESCE(SUM(vp.valor), 0)
    INTO v_total_liq, v_pag_sum
    FROM public.vendas v
    LEFT JOIN public.vendas_pagamentos vp ON vp.venda_id = v.id
    WHERE v.id = v_venda_parcial
    GROUP BY v.total_liquido;
    SELECT cr.valor_aberto INTO v_cr_aberto
    FROM public.contas_receber cr WHERE cr.venda_id = v_venda_parcial;
    IF ABS((v_pag_sum + COALESCE(v_cr_aberto, 0)) - v_total_liq) > 0.02 THEN
      RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: parcial pag+aberto % <> total %',
        v_pag_sum + COALESCE(v_cr_aberto, 0), v_total_liq;
    END IF;
  END IF;

  -- 2) Kardex / movimentos de estoque (não só quantidade_atual)
  SELECT COUNT(*) INTO v_kardex_count
  FROM public.v_kardex_unificado k
  WHERE k.produto_id = v_prod
    AND k.loja_id = v_loja
    AND k.referencia_id IN (
      v_venda_dinheiro, v_venda_pix, v_venda_split, v_venda_parcial, v_venda_cancel
    )
    AND k.tipo_codigo = 'SAIDA_VENDA';
  IF v_kardex_count < 5 THEN
    -- Fallback físico direto
    SELECT COUNT(*) INTO v_kardex_count
    FROM public.movimentos_estoque_log m
    WHERE m.produto_id = v_prod
      AND m.venda_id IN (
        v_venda_dinheiro, v_venda_pix, v_venda_split, v_venda_parcial, v_venda_cancel
      )
      AND m.tipo_codigo = 'SAIDA_VENDA';
  END IF;
  IF v_kardex_count < 5 THEN
    SELECT COUNT(*) INTO v_kardex_count
    FROM public.estoque_baixas eb
    WHERE eb.venda_id IN (
      v_venda_dinheiro, v_venda_pix, v_venda_split, v_venda_parcial, v_venda_cancel
    );
  END IF;
  IF v_kardex_count < 5 THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: kardex/movimentos insuficientes (count=%)', v_kardex_count;
  END IF;

  -- 10) venda_eventos — SALE_REGISTERED (constraint 248)
  IF NOT EXISTS (
    SELECT 1 FROM public.venda_eventos
    WHERE sale_id = v_venda_dinheiro AND event_type = 'SALE_REGISTERED'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.venda_eventos
    WHERE sale_id = v_venda_parcial AND event_type = 'SALE_REGISTERED'
  ) THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: SALE_REGISTERED ausente no ledger';
  END IF;

  -- 5) Cancelamento via cancelar_venda_transacional (exige GERENTE+)
  UPDATE public.usuarios SET perfil = 'GERENTE' WHERE id = v_user;
  PERFORM public.cancelar_venda_transacional(
    v_venda_cancel,
    'SMOKE_PDV_WEB cancelamento homolog',
    v_user
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.vendas WHERE id = v_venda_cancel AND status = 'CANCELADA'
  ) THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: venda não ficou CANCELADA';
  END IF;

  SELECT e.quantidade_atual INTO v_estoque_pos_cancel
  FROM public.estoque e WHERE e.produto_id = v_prod AND e.loja_id = v_loja;
  IF v_estoque_pos_cancel <> v_estoque_antes - 4 THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: estoque pós-cancel esperado % obtido %',
      v_estoque_antes - 4, v_estoque_pos_cancel;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.venda_eventos
    WHERE sale_id = v_venda_cancel AND event_type = 'SALE_CANCELLED'
  ) THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: SALE_CANCELLED ausente no ledger';
  END IF;

  -- 11) Auditoria de cancelamento (se existir)
  IF v_has_auditoria_cancel THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vendas_canceladas_auditoria WHERE venda_id = v_venda_cancel
    ) THEN
      RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: vendas_canceladas_auditoria sem registro';
    END IF;
  ELSE
    RAISE NOTICE 'SMOKE_PDV_WEB_NOTE: vendas_canceladas_auditoria ausente — documentar no GO_LIVE';
  END IF;

  UPDATE public.usuarios SET perfil = 'OPERADOR' WHERE id = v_user;

  -- ---------- 6) Negative tests ----------
  -- Produto inexistente
  v_neg_ok := false;
  BEGIN
    PERFORM 1 FROM public.finalizar_venda_transacional_canonica_v4(
      gen_random_uuid(), v_caixa, v_user, v_loja, 'DINHEIRO',
      v_preco, 0, v_preco,
      jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_preco)),
      jsonb_build_array(jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', '00000000-0000-4000-8000-000000000099',
        'quantidade', 1,
        'preco_original', v_preco,
        'preco_unitario', v_preco,
        'tipo_preco', 'VAREJO'
      )),
      NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_neg_ok := true;
  END;
  IF NOT v_neg_ok THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: esperado erro para produto inexistente';
  END IF;

  -- Estoque insuficiente (força saldo baixo, evita falso negativo por preço/qty absurda)
  v_neg_ok := false;
  UPDATE public.estoque
  SET quantidade_atual = 0
  WHERE produto_id = v_prod AND loja_id = v_loja;
  BEGIN
    PERFORM 1 FROM public.finalizar_venda_transacional_canonica_v4(
      gen_random_uuid(), v_caixa, v_user, v_loja, 'DINHEIRO',
      v_preco, 0, v_preco,
      jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_preco)),
      jsonb_build_array(jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_prod,
        'quantidade', 1,
        'preco_original', v_preco,
        'preco_unitario', v_preco,
        'tipo_preco', 'VAREJO'
      )),
      NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_neg_ok := (
      SQLERRM ILIKE '%ESTOQUE%'
      OR SQLERRM ILIKE '%INSUFICIENTE%'
      OR SQLERRM ILIKE '%FINALIZAR_VENDA_CANONICA_ESTOQUE%'
    );
  END;
  UPDATE public.estoque
  SET quantidade_atual = v_estoque_pos_cancel
  WHERE produto_id = v_prod AND loja_id = v_loja;
  IF NOT v_neg_ok THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: esperado erro de estoque insuficiente';
  END IF;

  -- Pagamentos excedem total
  v_neg_ok := false;
  BEGIN
    PERFORM 1 FROM public.finalizar_venda_transacional_canonica_v4(
      gen_random_uuid(), v_caixa, v_user, v_loja, 'DINHEIRO',
      v_preco, 0, v_preco,
      jsonb_build_array(jsonb_build_object(
        'forma_pagamento', 'DINHEIRO',
        'valor', public.round_abnt(v_preco + 10, 2)
      )),
      jsonb_build_array(jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_prod,
        'quantidade', 1,
        'preco_original', v_preco,
        'preco_unitario', v_preco,
        'tipo_preco', 'VAREJO'
      )),
      NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_neg_ok := (SQLERRM ILIKE '%PAGAMENTOS_EXCEDEM%' OR SQLERRM ILIKE '%PAGAMENTO%');
  END;
  IF NOT v_neg_ok THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: esperado erro pagamentos inconsistentes';
  END IF;

  -- Caixa fechado (trigger VENDA_CAIXA_FECHADO)
  v_neg_ok := false;
  BEGIN
    PERFORM 1 FROM public.finalizar_venda_transacional_canonica_v4(
      gen_random_uuid(), v_caixa_fechado, v_user, v_loja, 'DINHEIRO',
      v_preco, 0, v_preco,
      jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', v_preco)),
      jsonb_build_array(jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_prod,
        'quantidade', 1,
        'preco_original', v_preco,
        'preco_unitario', v_preco,
        'tipo_preco', 'VAREJO'
      )),
      NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_neg_ok := (SQLERRM ILIKE '%CAIXA_FECHADO%' OR SQLERRM ILIKE '%CAIXA%');
  END;
  IF NOT v_neg_ok THEN
    RAISE EXCEPTION 'SMOKE_PDV_WEB_FAIL: esperado erro para caixa fechado';
  END IF;

  RAISE NOTICE 'SMOKE_PDV_WEB_OK preco=% estoque=%->% (pos_cancel=%) dinheiro=% pix=% split=% parcial=% cancel=% espera=% cr=% auditoria=%',
    v_preco, v_estoque_antes, v_estoque_depois, v_estoque_pos_cancel,
    v_venda_dinheiro, v_venda_pix, v_venda_split, v_venda_parcial, v_venda_cancel,
    v_espera_id, v_has_contas_receber, v_has_auditoria_cancel;
END $$;

COMMIT;
