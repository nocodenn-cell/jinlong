-- Gate P0 (2026-10-15) — loja nova nasce com as formas de pagamento padrão.
-- Migration: 20261015140000_formas_pagamento_padrao_loja_nova.sql
--
-- Prova:
--   1. Loja nova (INSERT em `lojas`, como o wizard faz) recebe as 4 formas e CONCLUI uma venda
--      via finalizar_venda_transacional_canonica_v4 (antes: FORMA_PAGAMENTO_INVALIDA).
--   2. Reexecução da função é no-op (idempotente).
--   3. Loja já configurada não é tocada: forma desativada continua desativada, taxa preservada,
--      nenhuma forma extra é criada.
--   4. Backfill: loja ativa sem formas ganha as 4; loja inativa sem formas não é tocada.
--   5. Função e trigger não são executáveis por anon/authenticated (gate C1).
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $gate_formas$
DECLARE
  v_loja uuid := 'f1000001-0000-4000-8000-000000000001';
  v_loja_cfg uuid := 'f1000001-0000-4000-8000-000000000002';
  v_loja_bf uuid := 'f1000001-0000-4000-8000-000000000003';
  v_loja_inativa uuid := 'f1000001-0000-4000-8000-000000000004';
  v_operador uuid := 'f1000002-0000-4000-8000-000000000001';
  v_categoria uuid := 'f1000003-0000-4000-8000-000000000001';
  v_produto uuid := 'f1000004-0000-4000-8000-000000000001';
  v_caixa_id uuid;
  v_n int;
  v_ret int;
  r record;
  v_ativo boolean;
  v_taxa numeric;
BEGIN
  -- ── 1. Loja nova recebe as 4 formas e vende ────────────────────────────────────────────────
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja, 'FormasP0 Loja', 'FORMASP0', true);

  SELECT count(*) INTO v_n FROM public.formas_pagamento
  WHERE loja_id = v_loja AND ativo AND codigo IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: loja nova deveria ter 4 formas ativas, tem %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: loja nova deveria ter exatamente 4 linhas, tem %', v_n;
  END IF;

  INSERT INTO auth.users (id) VALUES (v_operador) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_operador, 'FormasP0 Operador', 'OPERADOR', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;
  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'FormasP0 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;
  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto, '7899999990910', 'FormasP0 Produto', v_categoria, 10.00, 'brasil_nf', false, true, v_loja);
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto, v_loja, 100, 0)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 100;

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (v_operador, 'ABERTO', now(), 300, v_loja)
  RETURNING id INTO v_caixa_id;

  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    gen_random_uuid(), v_caixa_id, v_operador, v_loja, 'DINHEIRO',
    10, 0, 10,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 10)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 10, 'preco_unitario', 10, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: venda em loja nova não concluiu (% / %)', r.status, r.mensagem;
  END IF;
  RAISE NOTICE 'OK 1: loja nova tem 4 formas e concluiu a venda.';

  -- ── 2. Reexecução é no-op ──────────────────────────────────────────────────────────────────
  v_ret := public.garantir_formas_pagamento_padrao(v_loja);
  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja;
  IF v_ret <> 0 OR v_n <> 4 THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: reexecução não é no-op (ret %, linhas %)', v_ret, v_n;
  END IF;
  RAISE NOTICE 'OK 2: reexecução idempotente.';

  -- ── 3. Loja já configurada não é tocada ────────────────────────────────────────────────────
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja_cfg, 'FormasP0 Cfg', 'FORMASP0CFG', true);
  -- Simula configuração pré-existente: só DINHEIRO desativada + PIX com taxa.
  DELETE FROM public.formas_pagamento WHERE loja_id = v_loja_cfg;
  INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo, taxa_percentual) VALUES
    (v_loja_cfg, 'DINHEIRO', 'Dinheiro custom', false, 0),
    (v_loja_cfg, 'PIX', 'Pix custom', true, 1.50);

  v_ret := public.garantir_formas_pagamento_padrao(v_loja_cfg);
  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja_cfg;
  SELECT ativo INTO v_ativo FROM public.formas_pagamento WHERE loja_id = v_loja_cfg AND codigo = 'DINHEIRO';
  SELECT taxa_percentual INTO v_taxa FROM public.formas_pagamento WHERE loja_id = v_loja_cfg AND codigo = 'PIX';
  IF v_ret <> 0 OR v_n <> 2 OR v_ativo IS DISTINCT FROM false OR v_taxa IS DISTINCT FROM 1.50 THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: loja configurada foi alterada (ret %, linhas %, dinheiro ativo %, taxa pix %)',
      v_ret, v_n, v_ativo, v_taxa;
  END IF;
  RAISE NOTICE 'OK 3: loja configurada intacta (desativada continua desativada).';

  -- ── 4. Backfill ────────────────────────────────────────────────────────────────────────────
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja_bf, 'FormasP0 Backfill', 'FORMASP0BF', true);
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja_inativa, 'FormasP0 Inativa', 'FORMASP0IN', false);
  DELETE FROM public.formas_pagamento WHERE loja_id IN (v_loja_bf, v_loja_inativa);

  -- Mesma instrução do backfill da migration.
  PERFORM public.garantir_formas_pagamento_padrao(l.id) FROM public.lojas l WHERE l.ativo = true;

  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja_bf;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: backfill não criou as 4 formas da loja ativa sem formas (%)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja_inativa;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: backfill tocou loja inativa (%)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja_cfg;
  SELECT ativo INTO v_ativo FROM public.formas_pagamento WHERE loja_id = v_loja_cfg AND codigo = 'DINHEIRO';
  IF v_n <> 2 OR v_ativo IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: backfill alterou loja já configurada (linhas %, ativo %)', v_n, v_ativo;
  END IF;
  -- Segunda passada do backfill: nada muda.
  PERFORM public.garantir_formas_pagamento_padrao(l.id) FROM public.lojas l WHERE l.ativo = true;
  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja_bf;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: segunda passada do backfill não é idempotente (%)', v_n;
  END IF;
  RAISE NOTICE 'OK 4: backfill seguro e idempotente.';

  -- ── 5. Sem exposição a anon/authenticated ──────────────────────────────────────────────────
  IF has_function_privilege('authenticated', 'public.garantir_formas_pagamento_padrao(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.garantir_formas_pagamento_padrao(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trg_lojas_formas_pagamento_padrao()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.trg_lojas_formas_pagamento_padrao()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FORMAS_P0_FALHOU: função SECURITY DEFINER exposta a anon/authenticated';
  END IF;
  RAISE NOTICE 'OK 5: sem EXECUTE para anon/authenticated.';
END
$gate_formas$;

ROLLBACK;
