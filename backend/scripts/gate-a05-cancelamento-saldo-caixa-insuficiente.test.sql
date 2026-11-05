-- Gate de Convergência A05 — cancelamento de venda em dinheiro com a gaveta
-- sem saldo para o estorno.
--
-- Achado provado (stress test operacional do PDV, stack local): o débito de
-- `caixas.saldo_atual` em `cancelar_venda_transacional` era um UPDATE
-- condicional (`AND (saldo_atual - estorno) >= 0`) SEM `IF NOT FOUND`. Com a
-- gaveta esvaziada por sangria, o estorno era descartado em silêncio e as duas
-- autoridades de dinheiro passavam a divergir permanentemente:
--   · `caixas.saldo_atual`                        -> guard da sangria
--   · `calcular_valor_sistema_dinheiro_caixa`     -> base do fechamento
-- Efeitos: sangria autorizada sobre dinheiro inexistente e diferença fantasma
-- no fechamento. Corrigido por
-- 20260909200000_cancelar_venda_saldo_caixa_insuficiente.sql.
--
-- Prova as 3 propriedades da correção:
--   1. NEGATIVO — caixa ABERTO sem dinheiro para o estorno: cancelamento
--      rejeitado explicitamente, sem drift entre as duas autoridades.
--   2. POSITIVO — com suprimento cobrindo o estorno, o cancelamento conclui e
--      as duas autoridades continuam iguais.
--   3. NÃO-REGRESSÃO — venda de caixa já FECHADO continua cancelável mesmo com
--      `saldo_atual` insuficiente (o guard só vale para caixa ABERTO).
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.empresas (id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', 'Fixture empresa (suite SQL)') ON CONFLICT (id) DO NOTHING;

DO $setup$
DECLARE
  v_loja uuid := 'f5000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f5000002-0000-4000-8000-000000000001';
  v_gerente uuid := 'f5000002-0000-4000-8000-000000000002';
  v_operador2 uuid := 'f5000002-0000-4000-8000-000000000003';
  v_categoria uuid := 'f5000003-0000-4000-8000-000000000001';
  v_produto uuid := 'f5000004-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_operador), (v_gerente), (v_operador2)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', v_loja, 'GateA05 Loja', 'GATEA05', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_operador, 'GateA05 Operador', 'OPERADOR', true, v_loja),
    (v_operador2, 'GateA05 Operador 2', 'OPERADOR', true, v_loja),
    (v_gerente, 'GateA05 Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (empresa_id, id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', v_categoria, 'GateA05 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto, '7899999950010', 'GateA05 Produto', v_categoria, 100.00, 'brasil_nf', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id, preco_varejo = EXCLUDED.preco_varejo;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto, v_loja, 100, 0)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 100;

  INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo)
  VALUES (v_loja, 'DINHEIRO', 'Dinheiro', true)
  ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;

  DELETE FROM public.caixas WHERE operador_id IN (v_operador, v_operador2);
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) NEGATIVO + 2) POSITIVO — caixa ABERTO.
-- ═══════════════════════════════════════════════════════════════════════════

DO $gate_a05_aberto$
DECLARE
  v_loja uuid := 'f5000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f5000002-0000-4000-8000-000000000001';
  v_gerente uuid := 'f5000002-0000-4000-8000-000000000002';
  v_produto uuid := 'f5000004-0000-4000-8000-000000000001';
  v_caixa_id uuid;
  v_venda_id uuid := gen_random_uuid();
  r record;
  v_saldo numeric(10,2);
  v_sistema numeric(10,2);
  v_status_venda text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);

  -- Fundo R$ 0 — só o dinheiro da venda entra na gaveta.
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (v_operador, 'ABERTO', now(), 0, v_loja)
  RETURNING id INTO v_caixa_id;

  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_id, v_caixa_id, v_operador, v_loja, 'DINHEIRO',
    100, 0, 100,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 100)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 100, 'preco_unitario', 100, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'GATE_A05_SETUP_FALHOU: venda não concluiu (% / %)', r.status, r.mensagem;
  END IF;

  -- Sangria leva todo o dinheiro para o cofre: gaveta zerada.
  PERFORM public.registrar_movimentacao(
    v_caixa_id, 'sangria', 'dinheiro', 100, 'gate-a05 retirada', 'RETIRADA',
    NULL, NULL, gen_random_uuid()::text
  );

  SELECT saldo_atual INTO v_saldo FROM public.caixas WHERE id = v_caixa_id;
  v_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  IF v_saldo <> 0 OR v_sistema <> 0 THEN
    RAISE EXCEPTION 'GATE_A05_SETUP_FALHOU: apos sangria esperava 0/0, achou saldo=% sistema=%', v_saldo, v_sistema;
  END IF;

  -- NEGATIVO: gerente cancela a venda em dinheiro com a gaveta vazia.
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  BEGIN
    PERFORM public.cancelar_venda_transacional(v_venda_id, 'gate-a05 cancelamento sem lastro');
    RAISE EXCEPTION 'GATE_A05_FALHOU: cancelamento com gaveta sem o valor do estorno foi ACEITO — o debito seria descartado em silencio';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo OK (A05): cancelamento sem lastro na gaveta foi rejeitado explicitamente (%).', SQLERRM;
  END;

  -- A rejeição não pode ter deixado rastro: venda intacta e autoridades iguais.
  SELECT status INTO v_status_venda FROM public.vendas WHERE id = v_venda_id;
  IF v_status_venda IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'GATE_A05_FALHOU: cancelamento rejeitado alterou o status da venda (%)', v_status_venda;
  END IF;

  SELECT saldo_atual INTO v_saldo FROM public.caixas WHERE id = v_caixa_id;
  v_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  IF v_saldo <> v_sistema THEN
    RAISE EXCEPTION 'GATE_A05_FALHOU: divergencia entre autoridades de dinheiro apos rejeicao (saldo_atual=% valor_sistema=%)',
      v_saldo, v_sistema;
  END IF;
  RAISE NOTICE 'Consistencia OK (A05): saldo_atual = valor_sistema = % apos a rejeicao.', v_saldo;

  -- POSITIVO: suprimento traz o dinheiro de volta -> cancelamento conclui.
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  PERFORM public.registrar_movimentacao(
    v_caixa_id, 'suprimento', 'dinheiro', 100, 'gate-a05 recomposicao', 'TROCO',
    NULL, NULL, gen_random_uuid()::text
  );

  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM public.cancelar_venda_transacional(v_venda_id, 'gate-a05 cancelamento com lastro');

  SELECT status INTO v_status_venda FROM public.vendas WHERE id = v_venda_id;
  IF v_status_venda IS DISTINCT FROM 'CANCELADA' THEN
    RAISE EXCEPTION 'GATE_A05_FALHOU: cancelamento com lastro nao concluiu (status=%)', v_status_venda;
  END IF;

  SELECT saldo_atual INTO v_saldo FROM public.caixas WHERE id = v_caixa_id;
  v_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  IF v_saldo <> v_sistema THEN
    RAISE EXCEPTION 'GATE_A05_FALHOU: divergencia apos cancelamento valido (saldo_atual=% valor_sistema=%)', v_saldo, v_sistema;
  END IF;
  IF v_saldo <> 0 THEN
    RAISE EXCEPTION 'GATE_A05_FALHOU: apos venda 100 + sangria 100 + suprimento 100 + cancelamento, esperava gaveta 0 (achou %)', v_saldo;
  END IF;
  RAISE NOTICE 'Positivo OK (A05): cancelamento com lastro concluiu e as duas autoridades ficaram em % .', v_saldo;
END
$gate_a05_aberto$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) NÃO-REGRESSÃO — venda de caixa FECHADO continua cancelável.
-- ═══════════════════════════════════════════════════════════════════════════

DO $gate_a05_fechado$
DECLARE
  v_loja uuid := 'f5000001-0000-4000-8000-000000000001';
  v_operador2 uuid := 'f5000002-0000-4000-8000-000000000003';
  v_gerente uuid := 'f5000002-0000-4000-8000-000000000002';
  v_produto uuid := 'f5000004-0000-4000-8000-000000000001';
  v_caixa_id uuid;
  v_venda_id uuid := gen_random_uuid();
  r record;
  v_status_venda text;
  v_status_caixa text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador2::text, true);

  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (v_operador2, 'ABERTO', now(), 0, v_loja)
  RETURNING id INTO v_caixa_id;

  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda_id, v_caixa_id, v_operador2, v_loja, 'DINHEIRO',
    100, 0, 100,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 100)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 100, 'preco_unitario', 100, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'GATE_A05_SETUP_FALHOU (fechado): venda nao concluiu (% / %)', r.status, r.mensagem;
  END IF;

  -- Esvazia a gaveta e fecha o caixa contando o valor do sistema (zero).
  PERFORM public.registrar_movimentacao(
    v_caixa_id, 'sangria', 'dinheiro', 100, 'gate-a05 retirada final', 'RETIRADA',
    NULL, NULL, gen_random_uuid()::text
  );
  PERFORM public.fechar_caixa_atomico(v_operador2, 0, 'gate-a05 fechamento');

  SELECT status INTO v_status_caixa FROM public.caixas WHERE id = v_caixa_id;
  IF v_status_caixa IS DISTINCT FROM 'FECHADO' THEN
    RAISE EXCEPTION 'GATE_A05_SETUP_FALHOU (fechado): caixa nao fechou (status=%)', v_status_caixa;
  END IF;

  -- Caixa FECHADO com saldo insuficiente: o guard NÃO deve disparar.
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM public.cancelar_venda_transacional(v_venda_id, 'gate-a05 cancelamento pos-fechamento');

  SELECT status INTO v_status_venda FROM public.vendas WHERE id = v_venda_id;
  IF v_status_venda IS DISTINCT FROM 'CANCELADA' THEN
    RAISE EXCEPTION 'GATE_A05_FALHOU: guard bloqueou cancelamento de venda em caixa FECHADO (status=%)', v_status_venda;
  END IF;
  RAISE NOTICE 'Nao-regressao OK (A05): venda de caixa FECHADO segue cancelavel mesmo com saldo insuficiente.';
END
$gate_a05_fechado$;

SELECT 'GATE A05 CANCELAMENTO SALDO CAIXA INSUFICIENTE: OK' AS resultado;
ROLLBACK;
