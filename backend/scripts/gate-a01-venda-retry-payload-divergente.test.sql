-- Gate de Convergência A01-1.1 — regressão da idempotência semântica de
-- `finalizar_venda_transacional_canonica_v4` (via wrapper público).
--
-- Antes de 20260902100000_finalizar_venda_retry_payload_divergente.sql:
-- chamar a RPC duas vezes com o MESMO venda_id e payloads materialmente
-- diferentes (1 item/R$100 depois 2 itens/R$200) retornava status='CONCLUIDA'
-- nas duas vezes, e o banco preservava só a primeira operação — a segunda
-- chamada parecia bem-sucedida ao chamador sem ter sido aplicada.
--
-- Prova as 2 propriedades da correção:
--   1. Replay com o MESMO payload (mesmos totais + forma de pagamento) ->
--      devolve 'CONCLUIDA' silenciosamente, sem duplicar itens/estoque.
--   2. Replay do MESMO venda_id com payload DIFERENTE -> RAISE EXCEPTION
--      FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE, não sucesso
--      silencioso com o total antigo.
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'f0000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f0000002-0000-4000-8000-000000000001';
  v_categoria uuid := 'f0000003-0000-4000-8000-000000000001';
  v_produto uuid := 'f0000004-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_operador) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja, 'GateA01 Loja', 'GATEA01', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_operador, 'GateA01 Operador', 'OPERADOR', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'GateA01 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto, '7899999990010', 'GateA01 Produto', v_categoria, 100.00, 'brasil_nf', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id, preco_varejo = EXCLUDED.preco_varejo;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto, v_loja, 100, 0)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 100;

  INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo)
  VALUES (v_loja, 'DINHEIRO', 'Dinheiro', true)
  ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Finaliza venda; 2) replay com o MESMO payload é silencioso;
-- 3) replay do MESMO venda_id com payload DIFERENTE é rejeitado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $gate_a01_idempotencia$
DECLARE
  v_loja uuid := 'f0000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f0000002-0000-4000-8000-000000000001';
  v_produto uuid := 'f0000004-0000-4000-8000-000000000001';
  v_caixa_id uuid;
  v_venda_id uuid := gen_random_uuid();
  r1 record;
  r2 record;
  v_persistido record;
  v_itens_count int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);

  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (v_operador, 'ABERTO', now(), 1000, v_loja)
  RETURNING id INTO v_caixa_id;

  -- Chamada 1: payload A = 1 unidade / R$100.
  SELECT * INTO r1 FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_id, v_caixa_id, v_operador, v_loja, 'DINHEIRO',
    100, 0, 100,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 100)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 100, 'preco_unitario', 100, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r1.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'GATE_A01_SETUP_FALHOU: primeira chamada não concluiu (% / %)', r1.status, r1.mensagem;
  END IF;

  -- Replay positivo: MESMO venda_id, MESMO payload -> sucesso silencioso, sem duplicar.
  SELECT * INTO r2 FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_id, v_caixa_id, v_operador, v_loja, 'DINHEIRO',
    100, 0, 100,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 100)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 100, 'preco_unitario', 100, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r2.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'GATE_A01_FALHOU: replay com payload idêntico não devolveu CONCLUIDA (%)', r2.status;
  END IF;

  SELECT count(*) INTO v_itens_count FROM public.itens_venda WHERE venda_id = v_venda_id;
  IF v_itens_count <> 1 THEN
    RAISE EXCEPTION 'GATE_A01_FALHOU: replay com payload idêntico duplicou itens (esperado 1, achou %)', v_itens_count;
  END IF;
  RAISE NOTICE 'Positivo OK: replay com payload idêntico devolveu CONCLUIDA sem duplicar itens.';

  -- Negativo: MESMO venda_id, payload MATERIALMENTE DIFERENTE (2 unidades / R$200) -> rejeitado.
  BEGIN
    PERFORM public.finalizar_venda_transacional_canonica_v4(
      v_venda_id, v_caixa_id, v_operador, v_loja, 'DINHEIRO',
      200, 0, 200,
      jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 200)),
      jsonb_build_array(jsonb_build_object(
        'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 2,
        'preco_original', 100, 'preco_unitario', 100, 'tipo_preco', 'VAREJO'
      ))
    );
    RAISE EXCEPTION 'GATE_A01_FALHOU: replay do mesmo venda_id com payload divergente devolveu sucesso silencioso (achado A01-1.1 reaberto)';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo OK (A01-1.1): payload divergente no mesmo venda_id foi rejeitado explicitamente (%).', SQLERRM;
  END;

  SELECT total_bruto, total_liquido, status INTO v_persistido FROM public.vendas WHERE id = v_venda_id;
  IF v_persistido.total_bruto <> 100 OR v_persistido.total_liquido <> 100 THEN
    RAISE EXCEPTION 'GATE_A01_FALHOU: tentativa rejeitada alterou os totais persistidos (bruto=% liquido=%)',
      v_persistido.total_bruto, v_persistido.total_liquido;
  END IF;

  SELECT count(*) INTO v_itens_count FROM public.itens_venda WHERE venda_id = v_venda_id;
  IF v_itens_count <> 1 THEN
    RAISE EXCEPTION 'GATE_A01_FALHOU: tentativa rejeitada alterou os itens persistidos (esperado 1, achou %)', v_itens_count;
  END IF;
  RAISE NOTICE 'Consistência OK: tentativa rejeitada não alterou nada do que foi persistido na primeira chamada.';
END
$gate_a01_idempotencia$;

SELECT 'GATE A01-1.1 VENDA RETRY PAYLOAD DIVERGENTE: OK' AS resultado;
ROLLBACK;
