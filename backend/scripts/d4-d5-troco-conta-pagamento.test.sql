-- D4 + D5 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06): prova SQL pela RPC de venda real.
--   D5: PIX sem conta financeira é recusado; com conta, a venda é gravada.
--   D4: valor_recebido e troco persistidos em DINHEIRO; caixa recebe só o líquido; validações.
-- Pré-requisito: migrations 20261107100000 (D4) e 20261107110000 (D5) aplicadas em banco descartável.
-- Executar SOMENTE em cópia descartável (nunca produção):
--   docker exec -i <container_db_local> psql -U postgres -d <banco_descartavel> -v ON_ERROR_STOP=1 -f - < este_arquivo
-- Roda em transação com ROLLBACK. Dados sintéticos (uuid prefixo d4d5).
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _d45 (k text PRIMARY KEY, v uuid);

DO $setup$
DECLARE
  e  uuid := 'd4d50001-0000-4000-8000-000000000001';
  la uuid := 'd4d50002-0000-4000-8000-000000000001';
  lb uuid := 'd4d50002-0000-4000-8000-000000000002';
  op uuid := 'd4d50003-0000-4000-8000-000000000001';
  cat uuid := 'd4d50004-0000-4000-8000-000000000001';
  p1 uuid := 'd4d50005-0000-4000-8000-000000000001';
  cx uuid;
  forma text;
BEGIN
  INSERT INTO public.empresas (id, nome) VALUES (e, 'D4D5 Empresa');
  INSERT INTO auth.users (id) VALUES (op);
  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES
    (e, la, 'D4D5 Loja A', 'D4A', true), (e, lb, 'D4D5 Loja B', 'D4B', true);
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (op, 'D4D5 Operador', 'OPERADOR', true, la);
  INSERT INTO public.categorias (id, nome, empresa_id) VALUES (cat, 'D4D5 Cat', e);
  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id, unidade_medida) VALUES
    (p1, 'D4D5000000001', 'D4D5 Item', cat, 10.00, 'brasil_nf', false, true, la, 'UN');
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES (p1, la, 100, 0);
  FOREACH forma IN ARRAY ARRAY['DINHEIRO', 'PIX', 'CARTAO_CREDITO'] LOOP
    INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES (la, forma, forma, true)
      ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;
  END LOOP;
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (op, 'ABERTO', now(), 100, la) RETURNING id INTO cx;
  INSERT INTO _d45 VALUES ('la', la), ('lb', lb), ('op', op), ('p1', p1), ('cx', cx);
END $setup$;

CREATE FUNCTION pg_temp.g(k text) RETURNS uuid LANGUAGE sql AS $f$ SELECT v FROM _d45 WHERE _d45.k = $1 $f$;

-- Venda com pagamentos já montados (permite valor_recebido). Retorna o status da venda.
CREATE FUNCTION pg_temp.venda(p_venda uuid, p_pag jsonb, p_qtd numeric, p_unit numeric) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE r record; v_liq numeric := round(p_qtd * p_unit, 2);
BEGIN
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    p_venda_id => p_venda, p_caixa_id => (SELECT id FROM public.caixas WHERE loja_id = pg_temp.g('la') AND status = 'ABERTO' LIMIT 1),
    p_operador_id => pg_temp.g('op'), p_loja_id => pg_temp.g('la'),
    p_forma_pagamento => (p_pag->0->>'forma_pagamento'), p_total_bruto => v_liq, p_total_desconto => 0,
    p_total_liquido => v_liq, p_pagamentos => p_pag,
    p_itens => jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', pg_temp.g('p1'),
      'quantidade', p_qtd, 'preco_original', p_unit, 'preco_unitario', p_unit, 'tipo_preco', 'VAREJO')));
  RETURN r.status;
END $f$;

CREATE FUNCTION pg_temp.saldo() RETURNS numeric LANGUAGE sql AS $f$
  SELECT saldo_atual FROM public.caixas WHERE loja_id = pg_temp.g('la') AND status = 'ABERTO' LIMIT 1 $f$;

DO $t$
DECLARE
  la uuid := pg_temp.g('la'); lb uuid := pg_temp.g('lb'); op uuid := pg_temp.g('op');
  conta uuid := gen_random_uuid(); v1 uuid; v2 uuid; v3 uuid; st text; s0 numeric; vr numeric; tr numeric; n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', op::text, true);

  -- D5-1: PIX sem conta financeira na loja => recusado
  s0 := pg_temp.saldo();
  BEGIN
    PERFORM pg_temp.venda(gen_random_uuid(), jsonb_build_array(jsonb_build_object('forma_pagamento','PIX','valor',10)), 1, 10);
    RAISE EXCEPTION 'D5-1 FALHOU: PIX sem conta deveria ser recusado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGAMENTO_SEM_CONTA_FINANCEIRA%' THEN
      RAISE EXCEPTION 'D5-1 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D5-1 PIX sem conta recusado';
  END;
  IF pg_temp.saldo() <> s0 THEN RAISE EXCEPTION 'D5-1 FALHOU: caixa mudou após recusa'; END IF;

  -- D5-2: conta vinculada à forma PIX na loja A => venda gravada
  INSERT INTO public.contas_financeiras (id, loja_id, nome, tipo, ativo, data_inicial, criado_por)
    VALUES (conta, la, 'D4D5 Banco A', 'BANCO', true, current_date, op);
  INSERT INTO public.financeiro_contas_forma (loja_id, forma_pagamento, conta_financeira_id)
    VALUES (la, 'PIX', conta);
  v1 := gen_random_uuid();
  st := pg_temp.venda(v1, jsonb_build_array(jsonb_build_object('forma_pagamento','PIX','valor',10)), 1, 10);
  IF st IS DISTINCT FROM 'CONCLUIDA' THEN RAISE EXCEPTION 'D5-2 FALHOU: status=%', st; END IF;
  RAISE NOTICE 'OK D5-2 PIX com conta gravado';

  -- D5-3: conta INATIVA não serve
  UPDATE public.contas_financeiras SET ativo = false WHERE id = conta;
  BEGIN
    PERFORM pg_temp.venda(gen_random_uuid(), jsonb_build_array(jsonb_build_object('forma_pagamento','PIX','valor',10)), 1, 10);
    RAISE EXCEPTION 'D5-3 FALHOU: conta inativa deveria bloquear';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGAMENTO_SEM_CONTA_FINANCEIRA%' THEN
      RAISE EXCEPTION 'D5-3 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D5-3 conta inativa bloqueia';
  END;
  UPDATE public.contas_financeiras SET ativo = true WHERE id = conta;

  -- D4-1: dinheiro 10 entregue 15 => valor_recebido 15, troco 5, caixa recebe 10
  s0 := pg_temp.saldo();
  v2 := gen_random_uuid();
  st := pg_temp.venda(v2, jsonb_build_array(jsonb_build_object('forma_pagamento','DINHEIRO','valor',10,'valor_recebido',15)), 1, 10);
  SELECT valor_recebido, troco INTO vr, tr FROM public.vendas_pagamentos WHERE venda_id = v2 AND forma_pagamento = 'DINHEIRO';
  IF st IS DISTINCT FROM 'CONCLUIDA' OR vr IS DISTINCT FROM 15 OR tr IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'D4-1 FALHOU: status=% valor_recebido=% troco=%', st, vr, tr; END IF;
  IF pg_temp.saldo() - s0 <> 10 THEN RAISE EXCEPTION 'D4-1 FALHOU: caixa deveria receber 10, recebeu %', pg_temp.saldo() - s0; END IF;
  RAISE NOTICE 'OK D4-1 troco persistido e caixa recebe só o líquido';

  -- D4-2: valor_recebido menor que o valor => recusado
  BEGIN
    PERFORM pg_temp.venda(gen_random_uuid(), jsonb_build_array(jsonb_build_object('forma_pagamento','DINHEIRO','valor',10,'valor_recebido',8)), 1, 10);
    RAISE EXCEPTION 'D4-2 FALHOU: valor_recebido menor deveria ser recusado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGAMENTO_VALOR_RECEBIDO_INVALIDO%' THEN
      RAISE EXCEPTION 'D4-2 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D4-2 valor recebido menor recusado';
  END;

  -- D4-3: valor_recebido em PIX => recusado
  BEGIN
    PERFORM pg_temp.venda(gen_random_uuid(), jsonb_build_array(jsonb_build_object('forma_pagamento','PIX','valor',10,'valor_recebido',10)), 1, 10);
    RAISE EXCEPTION 'D4-3 FALHOU: valor_recebido em PIX deveria ser recusado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGAMENTO_VALOR_RECEBIDO_INVALIDO%' THEN
      RAISE EXCEPTION 'D4-3 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D4-3 valor recebido em PIX recusado';
  END;

  -- D4-4: sem valor_recebido => colunas NULL (compatibilidade)
  v3 := gen_random_uuid();
  st := pg_temp.venda(v3, jsonb_build_array(jsonb_build_object('forma_pagamento','DINHEIRO','valor',10)), 1, 10);
  SELECT valor_recebido, troco INTO vr, tr FROM public.vendas_pagamentos WHERE venda_id = v3;
  IF vr IS NOT NULL OR tr IS NOT NULL THEN RAISE EXCEPTION 'D4-4 FALHOU: deveria ser NULL'; END IF;
  RAISE NOTICE 'OK D4-4 sem valor recebido, colunas NULL';

  RAISE NOTICE 'TESTE D4/D5 CONCLUIDO';
END $t$;

ROLLBACK;
