-- Integridade financeira pós-OPS-02 — fixtures sintéticas, ROLLBACK.
-- Cobre: cache saldo_atual vs E(c), valor por forma, snapshot de fechamento,
-- guard de cancelamento (OPERADOR negado; gaveta insuficiente não grava devolução).
-- Não usa PII. Não depende do remoto.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'f4100001-0000-4000-8000-000000000001';
  v_operador uuid := 'f4100002-0000-4000-8000-000000000001';
  v_gerente uuid := 'f4100002-0000-4000-8000-000000000002';
  v_categoria uuid := 'f4100003-0000-4000-8000-000000000001';
  v_produto uuid := 'f4100004-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_operador), (v_gerente) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'PosOps02 Loja', 'POSOPS', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_operador, 'PosOps02 Operador', 'OPERADOR', true, v_loja),
    (v_gerente, 'PosOps02 Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;
  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'PosOps02 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;
  INSERT INTO public.produtos (
    id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id
  ) VALUES (
    v_produto, '7899999940027', 'PosOps02 Produto', v_categoria, 40.00, 'brasil_nf', false, true, v_loja
  ) ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id, preco_varejo = 40;
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto, v_loja, 50, 0)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 50;
  INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES
    (v_loja, 'DINHEIRO', 'Dinheiro', true),
    (v_loja, 'PIX', 'Pix', true)
  ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;
  DELETE FROM public.caixas WHERE operador_id IN (v_operador, v_gerente);
END
$setup$;

DO $cache$
DECLARE
  v_loja uuid := 'f4100001-0000-4000-8000-000000000001';
  v_operador uuid := 'f4100002-0000-4000-8000-000000000001';
  v_caixa uuid;
  v_ec numeric;
  v_saldo numeric;
BEGIN
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (v_operador, 'ABERTO', now(), 50, v_loja)
  RETURNING id INTO v_caixa;
  UPDATE public.caixas SET saldo_atual = 999 WHERE id = v_caixa;
  v_ec := internal.valor_sistema_dinheiro(v_caixa);
  IF v_ec <> 50 THEN
    RAISE EXCEPTION 'E(c) de abertura esperava 50, veio %', v_ec;
  END IF;
  PERFORM internal.sincronizar_saldo_cache(v_caixa);
  SELECT saldo_atual INTO v_saldo FROM public.caixas WHERE id = v_caixa;
  IF v_saldo <> v_ec THEN
    RAISE EXCEPTION 'cache divergiu de E(c): saldo=% ec=%', v_saldo, v_ec;
  END IF;

  UPDATE public.caixas SET
    status = 'FECHADO',
    data_fechamento = now(),
    valor_fechamento = v_saldo,
    fechamento_diferenca = 0,
    saldo_atual = 7
  WHERE id = v_caixa;
  PERFORM internal.sincronizar_saldo_cache(v_caixa);
  SELECT saldo_atual INTO v_saldo FROM public.caixas WHERE id = v_caixa;
  IF v_saldo <> 7 THEN
    RAISE EXCEPTION 'caixa FECHADO teve cache reescrito: %', v_saldo;
  END IF;
  DELETE FROM public.caixas WHERE id = v_caixa;
  RAISE NOTICE 'CACHE E(c) OK';
END
$cache$;

DO $formas$
DECLARE
  v_loja uuid := 'f4100001-0000-4000-8000-000000000001';
  v_operador uuid := 'f4100002-0000-4000-8000-000000000001';
  v_gerente uuid := 'f4100002-0000-4000-8000-000000000002';
  v_produto uuid := 'f4100004-0000-4000-8000-000000000001';
  v_caixa uuid;
  v_din uuid := 'f4100005-0000-4000-8000-000000000001';
  v_pix uuid := 'f4100005-0000-4000-8000-000000000002';
  v_cancel uuid := 'f4100005-0000-4000-8000-000000000003';
  v_ec numeric;
  v_pix_reg numeric;
  v_snap_pix numeric;
  v_snap_info numeric;
  v_dev int;
  r record;
BEGIN
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (v_operador, 'ABERTO', now(), 50, v_loja)
  RETURNING id INTO v_caixa;
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);

  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_din, v_caixa, v_operador, v_loja, 'DINHEIRO',
    40, 0, 40,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 40)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 40, 'preco_unitario', 40, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'venda dinheiro não concluiu: % / %', r.status, r.mensagem;
  END IF;

  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_pix, v_caixa, v_operador, v_loja, 'PIX',
    25, 0, 25,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'PIX', 'valor', 25)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 25, 'preco_unitario', 25, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'venda PIX não concluiu: % / %', r.status, r.mensagem;
  END IF;

  v_ec := internal.valor_sistema_dinheiro(v_caixa);
  IF v_ec <> 90 THEN
    RAISE EXCEPTION 'E(c) esperava 90 (50+40, PIX fora), veio %', v_ec;
  END IF;
  SELECT saldo_atual INTO v_pix_reg FROM public.caixas WHERE id = v_caixa;
  IF v_pix_reg <> v_ec THEN
    RAISE EXCEPTION 'cache pós-venda divergiu: saldo=% ec=%', v_pix_reg, v_ec;
  END IF;

  SELECT valor_sistema INTO v_pix_reg
  FROM public.calcular_valor_sistema_por_forma_caixa(v_caixa)
  WHERE forma_pagamento = 'PIX';
  IF v_pix_reg <> 25 THEN
    RAISE EXCEPTION 'PIX registrado esperava 25, veio %', v_pix_reg;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  BEGIN
    PERFORM public.cancelar_venda_transacional(v_pix, 'operador nao cancela', v_operador);
    RAISE EXCEPTION 'OPERADOR_DEVERIA_SER_NEGADO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CANCELAR_VENDA_SEM_PERMISSAO%' THEN
      RAISE;
    END IF;
  END;

  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_cancel, v_caixa, v_operador, v_loja, 'DINHEIRO',
    100, 0, 100,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 100)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 100, 'preco_unitario', 100, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'venda do guard não concluiu: % / %', r.status, r.mensagem;
  END IF;
  PERFORM public.registrar_movimentacao(
    v_caixa, 'sangria', 'dinheiro', 190, 'esvazia gaveta sintetica', 'RETIRADA',
    NULL, NULL, gen_random_uuid()::text
  );
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  BEGIN
    PERFORM public.cancelar_venda_transacional(v_cancel, 'gaveta vazia', v_gerente);
    RAISE EXCEPTION 'GUARD_DEVERIA_NEGAR';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE%' THEN
      RAISE;
    END IF;
  END;
  SELECT count(*) INTO v_dev FROM public.devolucoes WHERE venda_id = v_cancel;
  IF v_dev <> 0 THEN
    RAISE EXCEPTION 'guard gravou devolução: %', v_dev;
  END IF;
  IF (SELECT status FROM public.vendas WHERE id = v_cancel) <> 'CONCLUIDA' THEN
    RAISE EXCEPTION 'guard alterou status da venda';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  PERFORM public.fechar_caixa_atomico(v_operador, 0, 'gaveta zerada na prova');
  SELECT valor_sistema_snapshot, valor_informado
    INTO v_snap_pix, v_snap_info
  FROM public.caixas_fechamento_formas
  WHERE caixa_id = v_caixa AND forma_pagamento = 'PIX';
  IF v_snap_pix <> 25 OR v_snap_info IS NOT NULL THEN
    RAISE EXCEPTION 'snapshot PIX esperava 25/NULL, veio %/%', v_snap_pix, v_snap_info;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.caixas_fechamento_formas
    WHERE caixa_id = v_caixa AND forma_pagamento = 'DINHEIRO' AND valor_informado = 0
  ) THEN
    RAISE EXCEPTION 'snapshot DINHEIRO sem valor informado';
  END IF;

  RAISE NOTICE 'FORMAS CANCEL GUARD SNAPSHOT OK';
END
$formas$;

ROLLBACK;
