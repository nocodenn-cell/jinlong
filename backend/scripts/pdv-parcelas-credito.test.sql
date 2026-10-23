-- Setup idêntico ao de pdv-meios-pagamento.test.sql.
-- Sprint meios de pagamento PDV Jinlong — prova SQL dos 4 meios + misto contra a RPC canônica
-- `finalizar_venda_transacional_canonica_v4` (cadeia real de migrations), cancelamento/estorno,
-- conferência por forma (`calcular_valor_sistema_por_forma_caixa` + `fechar_caixa_atomico`),
-- recebíveis (declarado → liquidado), rollback transacional e isolamento entre lojas (RLS, papel authenticated).
-- Dupla finalização SIMULTÂNEA fica em pdv-meios-pagamento-concorrencia.sh (precisa de 2 sessões).
-- Dados sintéticos; tudo em transação com ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _ctx (k text PRIMARY KEY, v uuid);
GRANT ALL ON _ctx TO authenticated;

DO $setup$
DECLARE
  la uuid := 'e1000001-0000-4000-8000-000000000001'; lb uuid := 'e1000001-0000-4000-8000-000000000002';
  opa uuid := 'e1000002-0000-4000-8000-000000000001'; gea uuid := 'e1000002-0000-4000-8000-000000000002';
  opb uuid := 'e1000002-0000-4000-8000-000000000003'; geb uuid := 'e1000002-0000-4000-8000-000000000004';
  cat uuid := 'e1000003-0000-4000-8000-000000000001';
  pa uuid := 'e1000004-0000-4000-8000-000000000001'; pb uuid := 'e1000004-0000-4000-8000-000000000002';
  f text; ca uuid; cb uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (opa),(gea),(opb),(geb) ON CONFLICT DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (la,'PAG Loja A','PAGA',true),(lb,'PAG Loja B','PAGB',true);
  INSERT INTO public.usuarios (id,nome,perfil,ativo,loja_id) VALUES
    (opa,'Op A','OPERADOR',true,la),(gea,'Ger A','GERENTE',true,la),(opb,'Op B','OPERADOR',true,lb),(geb,'Ger B','GERENTE',true,lb);
  INSERT INTO public.categorias (id, nome) VALUES (cat,'PAG Cat') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.produtos (id,codigo_barras,nome,categoria_id,preco_varejo,origem,tem_nf,ativo,loja_id) VALUES
    (pa,'7899999991001','PAG Prod A',cat,100.00,'brasil_nf',false,true,la),
    (pb,'7899999991002','PAG Prod B',cat,100.00,'brasil_nf',false,true,lb);
  INSERT INTO public.estoque (produto_id,loja_id,quantidade_atual,estoque_minimo) VALUES (pa,la,1000,0),(pb,lb,1000,0)
    ON CONFLICT (produto_id,loja_id) DO UPDATE SET quantidade_atual=1000;
  FOREACH f IN ARRAY ARRAY['DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO'] LOOP
    INSERT INTO public.formas_pagamento (loja_id,codigo,nome,ativo) VALUES (la,f,f,true),(lb,f,f,true)
      ON CONFLICT (loja_id,codigo) DO UPDATE SET ativo=true;
  END LOOP;
  INSERT INTO public.caixas (operador_id,status,data_abertura,valor_inicial,loja_id) VALUES (opa,'ABERTO',now(),100,la) RETURNING id INTO ca;
  INSERT INTO public.caixas (operador_id,status,data_abertura,valor_inicial,loja_id) VALUES (opb,'ABERTO',now(),100,lb) RETURNING id INTO cb;
  INSERT INTO _ctx VALUES ('la',la),('lb',lb),('opa',opa),('gea',gea),('opb',opb),('geb',geb),('pa',pa),('pb',pb),('ca',ca),('cb',cb);
END $setup$;

-- Helper: finaliza venda de N unidades (R$100 cada) com as parcelas dadas.
CREATE FUNCTION pg_temp.vender(p_id uuid, p_caixa uuid, p_op uuid, p_loja uuid, p_prod uuid, p_qtd int, p_forma text, p_pag jsonb)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r record; t numeric := 100 * p_qtd;
BEGIN
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    p_id, p_caixa, p_op, p_loja, p_forma, t, 0, t, p_pag,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', p_prod, 'quantidade', p_qtd,
      'preco_original', 100, 'preco_unitario', 100, 'tipo_preco', 'VAREJO')));
  RETURN r.status;
END $f$;
CREATE FUNCTION pg_temp.c(k text) RETURNS uuid LANGUAGE sql AS $f$ SELECT v FROM _ctx WHERE _ctx.k = $1 $f$;
CREATE FUNCTION pg_temp.pg(VARIADIC a text[]) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_agg(jsonb_build_object('forma_pagamento', a[i], 'valor', a[i+1]::numeric))
  FROM generate_series(1, array_length(a,1), 2) i $f$;
CREATE FUNCTION pg_temp.espera_erro(sql text, prefixo text, rotulo text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE prefixo || '%' THEN RAISE EXCEPTION '% FALHOU: erro inesperado %', rotulo, SQLERRM; END IF;
    RAISE NOTICE 'OK % -> %', rotulo, SQLERRM; RETURN;
  END;
  RAISE EXCEPTION '% FALHOU: era para recusar', rotulo;
END $f$;

-- Parcelamento do crédito (migration 20261021120000): web (wrapper v4) e desktop (registrar_venda_com_itens_v2).
DO $p$
DECLARE la uuid := pg_temp.c('la'); opa uuid := pg_temp.c('opa'); pa uuid := pg_temp.c('pa'); ca uuid := pg_temp.c('ca');
  v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid(); v3 uuid := gen_random_uuid(); v4 uuid := gen_random_uuid();
  s text; n int; it jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', opa::text, true);
  s := pg_temp.vender(v1, ca, opa, la, pa, 1, 'CARTAO_CREDITO', '[{"forma_pagamento":"CARTAO_CREDITO","valor":100,"parcelas":3}]');
  IF s <> 'CONCLUIDA' OR (SELECT parcelas FROM public.vendas_pagamentos WHERE venda_id=v1) <> 3 THEN RAISE EXCEPTION 'P1 FALHOU'; END IF;
  RAISE NOTICE 'OK P1 crédito 3x gravado';
  s := pg_temp.vender(v2, ca, opa, la, pa, 2, 'DINHEIRO', '[{"forma_pagamento":"DINHEIRO","valor":50},{"forma_pagamento":"CARTAO_CREDITO","valor":150,"parcelas":6}]');
  SELECT string_agg(forma_pagamento||'='||parcelas, ',' ORDER BY forma_pagamento) INTO s FROM public.vendas_pagamentos WHERE venda_id=v2;
  IF s <> 'CARTAO_CREDITO=6,DINHEIRO=1' THEN RAISE EXCEPTION 'P2 FALHOU: %', s; END IF;
  RAISE NOTICE 'OK P2 misto dinheiro+crédito: %', s;
  s := pg_temp.vender(v3, ca, opa, la, pa, 1, 'CARTAO_CREDITO', pg_temp.pg('CARTAO_CREDITO','100'));
  IF (SELECT parcelas FROM public.vendas_pagamentos WHERE venda_id=v3) <> 1 THEN RAISE EXCEPTION 'P3 FALHOU'; END IF;
  RAISE NOTICE 'OK P3 sem campo parcelas => 1x (PDV/edge atuais)';
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa, 'PIX',
    '[{"forma_pagamento":"PIX","valor":100,"parcelas":2}]'), 'PAGAMENTO_PARCELAS_INVALIDAS', 'P4a parcelas em PIX');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa, 'CARTAO_CREDITO',
    '[{"forma_pagamento":"CARTAO_CREDITO","valor":100,"parcelas":0}]'), 'PAGAMENTO_PARCELAS_INVALIDAS', 'P4b 0x');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa, 'CARTAO_CREDITO',
    '[{"forma_pagamento":"CARTAO_CREDITO","valor":100,"parcelas":25}]'), 'PAGAMENTO_PARCELAS_INVALIDAS', 'P4c 25x');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa, 'CARTAO_CREDITO',
    '[{"forma_pagamento":"CARTAO_CREDITO","valor":100,"parcelas":2.5}]'), 'PAGAMENTO_PARCELAS_INVALIDAS', 'P4d 2.5x');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa, 'CARTAO_CREDITO',
    '[{"forma_pagamento":"CARTAO_CREDITO","valor":100,"parcelas":"3"}]'), 'PAGAMENTO_PARCELAS_INVALIDAS', 'P4e texto');
  s := pg_temp.vender(v1, ca, opa, la, pa, 1, 'CARTAO_CREDITO', '[{"forma_pagamento":"CARTAO_CREDITO","valor":100,"parcelas":3}]');
  s := pg_temp.vender(v1, ca, opa, la, pa, 1, 'CARTAO_CREDITO', '[{"forma_pagamento":"CARTAO_CREDITO","valor":100,"parcelas":10}]');
  SELECT count(*) INTO n FROM public.vendas_pagamentos WHERE venda_id=v1;
  IF n <> 1 OR (SELECT parcelas FROM public.vendas_pagamentos WHERE venda_id=v1) <> 3 THEN RAISE EXCEPTION 'P5 FALHOU'; END IF;
  RAISE NOTICE 'OK P5 replay: 1 linha, mantém 3x';
  it := jsonb_build_array(jsonb_build_object('item_id',gen_random_uuid(),'produto_id',pa,'nome','x','quantidade',1,'preco_original',100,'preco_unitario',100));
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM public.registrar_venda_com_itens_v2(v4, ca, opa, 'PIX', 100, 0, 100, it, NULL, NULL, NULL,
    '[{"forma_pagamento":"PIX","valor":40},{"forma_pagamento":"CARTAO_CREDITO","valor":60,"parcelas":4}]');
  PERFORM public.registrar_venda_com_itens_v2(v4, ca, opa, 'PIX', 100, 0, 100, it, NULL, NULL, NULL,
    '[{"forma_pagamento":"PIX","valor":40},{"forma_pagamento":"CARTAO_CREDITO","valor":60,"parcelas":4}]');
  EXECUTE 'RESET ROLE';
  SELECT string_agg(forma_pagamento||'='||valor||'/'||parcelas, ',' ORDER BY forma_pagamento) INTO s FROM public.vendas_pagamentos WHERE venda_id=v4;
  IF s <> 'CARTAO_CREDITO=60.00/4,PIX=40.00/1' THEN RAISE EXCEPTION 'P6 FALHOU: %', s; END IF;
  RAISE NOTICE 'OK P6 desktop v2 misto PIX+crédito 4x, replay sem duplicar: %', s;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.registrar_venda_com_itens_v2(gen_random_uuid(), ca, opa, 'PIX', 100, 0, 100, it, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'P7 FALHOU: authenticated executou v2';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK P7 v2 negada para authenticated';
  END;
  EXECUTE 'RESET ROLE';
  s := pg_temp.vender(gen_random_uuid(), ca, opa, la, pa, 1, 'CARTAO_CREDITO', pg_temp.pg('CARTAO_CREDITO','100'));
  IF EXISTS (SELECT 1 FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id=vp.venda_id
             WHERE v.caixa_id=ca AND vp.parcelas>1 AND vp.venda_id NOT IN (v1,v2,v4)) THEN RAISE EXCEPTION 'P8 FALHOU'; END IF;
  RAISE NOTICE 'OK P8 parcelas não vazam para a venda seguinte na mesma transação';
  BEGIN
    UPDATE public.vendas_pagamentos SET parcelas=2 WHERE venda_id=v2 AND forma_pagamento='DINHEIRO';
    RAISE EXCEPTION 'P9 FALHOU';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK P9 CHECK impede parcelas fora do crédito';
  END;
END $p$;
SELECT 'PDV PARCELAS CREDITO (SQL): OK' AS resultado;
ROLLBACK;
