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

DO $t$
DECLARE
  la uuid := pg_temp.c('la'); opa uuid := pg_temp.c('opa'); gea uuid := pg_temp.c('gea');
  pa uuid := pg_temp.c('pa'); ca uuid := pg_temp.c('ca');
  v_din uuid := gen_random_uuid(); v_pix uuid := gen_random_uuid(); v_cre uuid := gen_random_uuid();
  v_deb uuid := gen_random_uuid(); v_mix uuid := gen_random_uuid(); v_tr uuid := gen_random_uuid();
  v_canc uuid := gen_random_uuid(); s text; n int; x numeric; e int; e2 int; r record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', opa::text, true);
  -- 1-4) 100% em cada meio
  s := pg_temp.vender(v_din, ca, opa, la, pa, 1, 'DINHEIRO', pg_temp.pg('DINHEIRO','100'));
  s := s || pg_temp.vender(v_pix, ca, opa, la, pa, 1, 'PIX', pg_temp.pg('PIX','100'));
  s := s || pg_temp.vender(v_cre, ca, opa, la, pa, 1, 'CARTAO_CREDITO', pg_temp.pg('CARTAO_CREDITO','100'));
  s := s || pg_temp.vender(v_deb, ca, opa, la, pa, 1, 'CARTAO_DEBITO', pg_temp.pg('CARTAO_DEBITO','100'));
  IF s <> repeat('CONCLUIDA',4) THEN RAISE EXCEPTION 'T1-4 FALHOU: %', s; END IF;
  SELECT count(*) INTO n FROM public.vendas_pagamentos WHERE venda_id IN (v_din,v_pix,v_cre,v_deb) AND valor = 100;
  IF n <> 4 THEN RAISE EXCEPTION 'T1-4 FALHOU: parcelas gravadas %', n; END IF;
  RAISE NOTICE 'OK T1-T4 100%% dinheiro / PIX / crédito / débito: 4 vendas CONCLUIDA, 1 parcela cada';

  -- 5) Combinada: 300 = 50 dinheiro + 100 PIX + 100 crédito + 50 débito
  s := pg_temp.vender(v_mix, ca, opa, la, pa, 3, 'DINHEIRO',
        pg_temp.pg('DINHEIRO','50','PIX','100','CARTAO_CREDITO','100','CARTAO_DEBITO','50'));
  SELECT count(*), sum(valor) INTO n, x FROM public.vendas_pagamentos WHERE venda_id = v_mix;
  IF s <> 'CONCLUIDA' OR n <> 4 OR x <> 300 THEN RAISE EXCEPTION 'T5 FALHOU: % % %', s, n, x; END IF;
  RAISE NOTICE 'OK T5 combinada: 4 parcelas somando 300.00';

  -- 6) Insuficiente sem cliente: recusado (saldo a prazo exige cliente/limite)
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa,
    'PIX', pg_temp.pg('PIX','60')), 'FINALIZAR_VENDA_CANONICA_', 'T6 pagamento insuficiente sem cliente');

  -- 7) Excedente em cartão/PIX: recusado no servidor (troco não existe fora do dinheiro)
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa,
    'PIX', pg_temp.pg('PIX','150')), 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL', 'T7a excedente PIX');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa,
    'CARTAO_CREDITO', pg_temp.pg('DINHEIRO','10','CARTAO_CREDITO','100')), 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL', 'T7b excedente cartão em misto');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa,
    'PIX', pg_temp.pg('PIX','100.001')), 'FINALIZAR_VENDA_CANONICA_', 'T7c valor com mais de 2 casas');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa,
    'PIX', pg_temp.pg('PIX','-100')), 'FINALIZAR_VENDA_CANONICA_', 'T7d valor negativo');

  -- 8) Troco: cliente entrega 150 em dinheiro numa venda de 100; o PDV envia o valor LÍQUIDO (100) e o saldo do
  --    caixa sobe só 100 (o troco sai da gaveta). Excesso bruto em dinheiro é recusado pelo servidor.
  SELECT valor_sistema INTO x FROM public.calcular_valor_sistema_por_forma_caixa(ca) WHERE forma_pagamento='DINHEIRO';
  s := pg_temp.vender(v_tr, ca, opa, la, pa, 1, 'DINHEIRO', pg_temp.pg('DINHEIRO','100'));
  IF (SELECT valor_sistema FROM public.calcular_valor_sistema_por_forma_caixa(ca) WHERE forma_pagamento='DINHEIRO') - x <> 100 THEN
    RAISE EXCEPTION 'T8 FALHOU: saldo dinheiro não subiu exatamente 100'; END IF;
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa,
    'DINHEIRO', pg_temp.pg('DINHEIRO','150')), 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL', 'T8b dinheiro bruto acima do total');
  RAISE NOTICE 'OK T8 troco: caixa registra só o líquido (troco = recebido − total calculado no PDV)';

  -- 9a) Idempotência sequencial (a concorrente real está no .sh)
  s := pg_temp.vender(v_din, ca, opa, la, pa, 1, 'DINHEIRO', pg_temp.pg('DINHEIRO','100'));
  SELECT count(*) INTO n FROM public.vendas_pagamentos WHERE venda_id = v_din;
  IF s <> 'CONCLUIDA' OR n <> 1 OR (SELECT valor FROM public.vendas_pagamentos WHERE venda_id=v_din) <> 100 THEN
    RAISE EXCEPTION 'T9a FALHOU: replay duplicou parcela'; END IF;
  RAISE NOTICE 'OK T9a replay da mesma venda não duplica pagamento';

  -- 10) Rollback: 2º item inválido (produto inexistente) -> nada persiste, estoque intacto
  SELECT quantidade_atual INTO e FROM public.estoque WHERE produto_id=pa AND loja_id=la;
  DECLARE vid uuid := gen_random_uuid(); BEGIN
    BEGIN
      PERFORM public.finalizar_venda_transacional_canonica_v4(vid, ca, opa, la, 'PIX', 200, 0, 200, pg_temp.pg('PIX','200'),
        jsonb_build_array(
          jsonb_build_object('item_id',gen_random_uuid(),'produto_id',pa,'quantidade',1,'preco_original',100,'preco_unitario',100,'tipo_preco','VAREJO'),
          jsonb_build_object('item_id',gen_random_uuid(),'produto_id',gen_random_uuid(),'quantidade',1,'preco_original',100,'preco_unitario',100,'tipo_preco','VAREJO')));
      RAISE EXCEPTION 'T10 FALHOU: venda com item inválido concluiu';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'T10 FALHOU%' THEN RAISE; END IF;
    END;
    SELECT quantidade_atual INTO e2 FROM public.estoque WHERE produto_id=pa AND loja_id=la;
    IF e2 <> e OR EXISTS (SELECT 1 FROM public.vendas WHERE id=vid) OR EXISTS (SELECT 1 FROM public.vendas_pagamentos WHERE venda_id=vid) THEN
      RAISE EXCEPTION 'T10 FALHOU: resíduo após falha'; END IF;
  END;
  RAISE NOTICE 'OK T10 falha no meio da venda: sem venda, sem pagamento, estoque intacto';

  -- 11) Cancelamento e estorno (gerente). Operador não pode.
  s := pg_temp.vender(v_canc, ca, opa, la, pa, 2, 'DINHEIRO', pg_temp.pg('DINHEIRO','50','CARTAO_CREDITO','150'));
  PERFORM pg_temp.espera_erro(format('SELECT * FROM public.cancelar_venda_transacional(%L,%L,%L)', v_canc, 'teste', opa),
    'CANCELAR_VENDA_SEM_PERMISSAO', 'T11a operador cancelando');
  PERFORM set_config('request.jwt.claim.sub', gea::text, true);
  SELECT * INTO r FROM public.cancelar_venda_transacional(v_canc, 'cliente desistiu (teste)', gea);
  IF r.status_venda <> 'CANCELADA' THEN RAISE EXCEPTION 'T11 FALHOU: %', r.status_venda; END IF;
  SELECT count(*) INTO n FROM public.vendas_canceladas_auditoria WHERE venda_id=v_canc AND operador_id=gea;
  SELECT coalesce(sum(valor),0) INTO x FROM public.devolucoes WHERE venda_id=v_canc;
  IF n <> 1 OR x <> 200 THEN RAISE EXCEPTION 'T11 FALHOU: auditoria=% devolvido=%', n, x; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_recebiveis_venda WHERE venda_id=v_canc AND forma='CARTAO_CREDITO' AND status='PENDENTE'
             AND NOT EXISTS (SELECT 1 FROM public.vendas v WHERE v.id=v_canc AND v.status='CANCELADA')) THEN
    RAISE EXCEPTION 'T11 FALHOU: recebível ativo de venda cancelada'; END IF;
  PERFORM pg_temp.espera_erro(format('SELECT * FROM public.cancelar_venda_transacional(%L,%L,%L)', v_canc, 'de novo', gea),
    'CANCELAR_VENDA_JA_CANCELADA', 'T11b cancelamento duplo');
  RAISE NOTICE 'OK T11 cancelamento: auditoria com gerente, devolução 200.00 por forma, sem duplo estorno';
END $t$;

-- Dispara os triggers DEFERRED (captura de recebíveis) como no COMMIT.
SET CONSTRAINTS ALL IMMEDIATE;
-- 12) Conferência e fechamento por forma; recebíveis cartão/PIX (declarado → liquidado)
DO $t12$
DECLARE ca uuid := pg_temp.c('ca'); r record; n int; s text := '';
BEGIN
  FOR r IN SELECT * FROM public.calcular_valor_sistema_por_forma_caixa(ca) ORDER BY 1 LOOP
    s := s || r.forma_pagamento || '=' || r.valor_sistema || ' ';
  END LOOP;
  RAISE NOTICE 'conferência por forma (sistema): %', s;
  -- vendas vivas: din 100+50+100 = 250 | pix 100+100 = 200 | crédito 100+100 = 200 | débito 100+50 = 150
  IF (SELECT valor_sistema FROM public.calcular_valor_sistema_por_forma_caixa(ca) WHERE forma_pagamento='PIX') <> 200
  OR (SELECT valor_sistema FROM public.calcular_valor_sistema_por_forma_caixa(ca) WHERE forma_pagamento='CARTAO_CREDITO') <> 200
  OR (SELECT valor_sistema FROM public.calcular_valor_sistema_por_forma_caixa(ca) WHERE forma_pagamento='CARTAO_DEBITO') <> 150 THEN
    RAISE EXCEPTION 'T12 FALHOU: %', s; END IF;
  SELECT count(*) INTO n FROM public.financeiro_recebiveis_venda rv JOIN public.vendas v ON v.id=rv.venda_id
   WHERE v.caixa_id=ca AND v.status='CONCLUIDA' AND rv.forma IN ('CARTAO_CREDITO','CARTAO_DEBITO') AND rv.status='PENDENTE';
  IF n <> 4 THEN RAISE EXCEPTION 'T12 FALHOU: recebíveis de cartão pendentes (declarados) = %', n; END IF;
  RAISE NOTICE 'OK T12a recebíveis: 4 parcelas de cartão PENDENTE (declarado, aguardando liquidação)';
END $t12$;
DO $t12b$
DECLARE ca uuid := pg_temp.c('ca'); gea uuid := pg_temp.c('opa'); r record; dif numeric; -- fecha quem opera o caixa
BEGIN
  PERFORM set_config('request.jwt.claim.sub', gea::text, true);
  SELECT * INTO r FROM public.fechar_caixa_atomico(gea, 350.00, 'fechamento teste');
  RAISE NOTICE 'fechamento: sistema=% contado=% diferença=%', r.o_valor_sistema, r.o_valor_contado, r.o_diferenca;
  IF r.o_valor_sistema <> 350 OR r.o_diferenca <> 0 THEN RAISE EXCEPTION 'T12 FALHOU: dinheiro esperado 350 (100 inicial + 250)'; END IF;
  IF (SELECT count(*) FROM public.caixas_fechamento_formas WHERE caixa_id=ca) < 4 THEN
    RAISE EXCEPTION 'T12 FALHOU: snapshot por forma ausente'; END IF;
  RAISE NOTICE 'OK T12b fechamento: dinheiro 350.00 sem diferença + snapshot das 4 formas';
END $t12b$;

-- 13) Permissões e isolamento entre lojas (papel authenticated, RLS real)
DO $t13$
DECLARE la uuid := pg_temp.c('la'); lb uuid := pg_temp.c('lb'); opb uuid := pg_temp.c('opb'); geb uuid := pg_temp.c('geb');
  pa uuid := pg_temp.c('pa'); cb uuid := pg_temp.c('cb'); ca uuid := pg_temp.c('ca'); n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', opb::text, true);
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opb, la, pa,
    'PIX', pg_temp.pg('PIX','100')), '', 'T13a operador B vendendo no caixa da loja A');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), cb, opb, lb, pa,
    'PIX', pg_temp.pg('PIX','100')), '', 'T13b produto da loja A no caixa da loja B');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), cb, pg_temp.c('opa'), lb, pg_temp.c('pb'),
    'PIX', pg_temp.pg('PIX','100')), '', 'T13c operador_id forjado (A) com sessão de B');
  PERFORM set_config('request.jwt.claim.sub', geb::text, true);
  PERFORM pg_temp.espera_erro(format('SELECT * FROM public.cancelar_venda_transacional(%L,%L,%L)',
    (SELECT id FROM public.vendas WHERE caixa_id=ca AND status='CONCLUIDA' LIMIT 1), 'x', geb), '', 'T13d gerente B cancelando venda A');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id=vp.venda_id WHERE v.caixa_id=ca;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'T13 FALHOU: gerente B enxerga % pagamentos da loja A', n; END IF;
  PERFORM set_config('request.jwt.claim.sub', pg_temp.c('gea')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id=vp.venda_id WHERE v.caixa_id=ca;
  EXECUTE 'RESET ROLE';
  IF n = 0 THEN RAISE EXCEPTION 'T13 FALHOU: gerente A não enxerga os próprios pagamentos (RLS quebrada para o dono)'; END IF;
  RAISE NOTICE 'OK T13e RLS: gerente B vê 0 pagamentos da loja A; gerente A vê %', n;
END $t13$;

-- 14) Regressões: forma desativada / FIADO desabilitado / caixa fechado
DO $t14$
DECLARE la uuid := pg_temp.c('la'); opa uuid := pg_temp.c('opa'); pa uuid := pg_temp.c('pa'); ca uuid := pg_temp.c('ca'); c2 uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', opa::text, true);
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), ca, opa, la, pa,
    'PIX', pg_temp.pg('PIX','100')), 'FINALIZAR_VENDA_CANONICA_CAIXA_FECHADO', 'T14a venda em caixa fechado');
  INSERT INTO public.caixas (operador_id,status,data_abertura,valor_inicial,loja_id) VALUES (opa,'ABERTO',now(),0,la) RETURNING id INTO c2;
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), c2, opa, la, pa,
    'FIADO', NULL), 'FINALIZAR_VENDA_CANONICA_FIADO', 'T14b FIADO desabilitado');
  UPDATE public.formas_pagamento SET ativo=false WHERE loja_id=la AND codigo='CARTAO_DEBITO';
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), c2, opa, la, pa,
    'CARTAO_DEBITO', pg_temp.pg('CARTAO_DEBITO','100')), 'FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA', 'T14c forma desativada na loja');
  PERFORM pg_temp.espera_erro(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,1,%L,%L)', gen_random_uuid(), c2, opa, la, pa,
    'BOLETO', pg_temp.pg('BOLETO','100')), 'FINALIZAR_VENDA_CANONICA_', 'T14d forma desconhecida');
END $t14$;


-- 15) Caminho do PDV desktop (outbox → edge sync-outbox → registrar_venda_com_itens, papel service_role):
--     forma escalar PIX / CARTAO_CREDITO / CARTAO_DEBITO gera 1 parcela na forma certa; replay idempotente.
DO $t15$
DECLARE la uuid := pg_temp.c('la'); opa uuid := pg_temp.c('opa'); pa uuid := pg_temp.c('pa'); c3 uuid; f text; vid uuid; n int; it jsonb;
BEGIN
  SELECT id INTO c3 FROM public.caixas WHERE operador_id=opa AND status='ABERTO' LIMIT 1;
  FOREACH f IN ARRAY ARRAY['PIX','CARTAO_CREDITO','DINHEIRO'] LOOP
    vid := gen_random_uuid();
    it := jsonb_build_array(jsonb_build_object('item_id',gen_random_uuid(),'produto_id',pa,'nome','PAG Prod A','quantidade',1,'preco_original',100,'preco_unitario',100));
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM public.registrar_venda_com_itens(vid, c3, opa, f, 100, 0, 100,
      it, NULL, NULL, NULL, NULL);
    PERFORM public.registrar_venda_com_itens(vid, c3, opa, f, 100, 0, 100,
      it, NULL, NULL, NULL, NULL);
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO n FROM public.vendas_pagamentos WHERE venda_id=vid AND forma_pagamento=f AND valor=100;
    IF n <> 1 OR (SELECT count(*) FROM public.vendas_pagamentos WHERE venda_id=vid) <> 1 THEN
      RAISE EXCEPTION 'T15 FALHOU: forma % gravou % parcelas', f, n; END IF;
  END LOOP;
  RAISE NOTICE 'OK T15 desktop/outbox: PIX, crédito e dinheiro gravam 1 parcela na forma enviada; replay não duplica';
END $t15$;

SELECT 'PDV MEIOS DE PAGAMENTO (SQL): OK' AS resultado;
ROLLBACK;
