-- Fixture comum dos testes de comissão: 2 empresas (A, B), dados fictícios, tudo dentro da transação do teste.
CREATE TEMP TABLE _ctx (k text PRIMARY KEY, v uuid);
GRANT ALL ON _ctx TO authenticated, service_role;
DO $setup$
DECLARE
  ea uuid := 'c0000000-0000-4000-8000-00000000000a'; eb uuid := 'c0000000-0000-4000-8000-00000000000b';
  la uuid := 'c1000000-0000-4000-8000-00000000000a'; lb uuid := 'c1000000-0000-4000-8000-00000000000b';
  dona uuid := 'c2000000-0000-4000-8000-000000000001'; gea uuid := 'c2000000-0000-4000-8000-000000000002';
  opa uuid := 'c2000000-0000-4000-8000-000000000003'; vea uuid := 'c2000000-0000-4000-8000-000000000004';
  veb2 uuid := 'c2000000-0000-4000-8000-000000000005';
  geb uuid := 'c2000000-0000-4000-8000-000000000006'; opb uuid := 'c2000000-0000-4000-8000-000000000007';
  cat uuid := 'c3000000-0000-4000-8000-000000000001'; cat2 uuid := 'c3000000-0000-4000-8000-000000000002'; catb uuid := 'c3000000-0000-4000-8000-000000000003';
  pa uuid := 'c4000000-0000-4000-8000-000000000001'; pa2 uuid := 'c4000000-0000-4000-8000-000000000002';
  pb uuid := 'c4000000-0000-4000-8000-000000000003';
  f text; ca uuid; cb uuid; u record;
BEGIN
  INSERT INTO public.empresas (id, nome, plano, status, vigencia_inicio) VALUES
    (ea, 'Comissão Teste A', 'basico', 'ATIVA', now()), (eb, 'Comissão Teste B', 'basico', 'ATIVA', now());
  INSERT INTO public.lojas (id, nome, codigo, ativo, empresa_id) VALUES (la,'COM Loja A','COMA',true,ea),(lb,'COM Loja B','COMB',true,eb);
  INSERT INTO auth.users (id) VALUES (dona),(gea),(opa),(vea),(veb2),(geb),(opb) ON CONFLICT DO NOTHING;
  INSERT INTO public.usuarios (id,nome,perfil,ativo,loja_id) VALUES
    (dona,'Dona A','DONO',true,la),(gea,'Gerente A','GERENTE',true,la),(opa,'Caixa A','OPERADOR',true,la),
    (vea,'Vendedora A','OPERADOR',true,la),(veb2,'Vendedor A2','OPERADOR',true,la),
    (geb,'Gerente B','GERENTE',true,lb),(opb,'Caixa B','OPERADOR',true,lb);
  FOR u IN SELECT * FROM (VALUES (dona,ea,la,'DONO'),(gea,ea,la,'GERENTE'),(opa,ea,la,'OPERADOR'),(vea,ea,la,'OPERADOR'),
      (veb2,ea,la,'OPERADOR'),(geb,eb,lb,'GERENTE'),(opb,eb,lb,'OPERADOR')) t(us,em,lo,pa) LOOP
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
    SELECT u.us, u.em, CASE WHEN u.pa = 'DONO' THEN NULL ELSE u.lo END, u.pa, true
     WHERE NOT EXISTS (SELECT 1 FROM public.usuario_vinculos x WHERE x.usuario_id = u.us AND x.empresa_id = u.em);
    UPDATE public.usuario_vinculos SET papel = u.pa, loja_id = CASE WHEN u.pa = 'DONO' THEN NULL ELSE u.lo END, ativo = true WHERE usuario_id = u.us AND empresa_id = u.em;
  END LOOP;
  INSERT INTO public.categorias (id, nome, empresa_id) VALUES (cat,'COM Cat',ea),(cat2,'COM Cat 2',ea),(catb,'COM Cat B',eb);
  INSERT INTO public.produtos (id,codigo_barras,nome,categoria_id,preco_varejo,origem,tem_nf,ativo,loja_id) VALUES
    (pa,'7899999992001','COM Prod A',cat,100.00,'brasil_nf',false,true,la),
    (pa2,'7899999992002','COM Prod A2',cat2,33.33,'brasil_nf',false,true,la),
    (pb,'7899999992003','COM Prod B',catb,100.00,'brasil_nf',false,true,lb);
  INSERT INTO public.estoque (produto_id,loja_id,quantidade_atual,estoque_minimo) VALUES (pa,la,1000,0),(pa2,la,1000,0),(pb,lb,1000,0)
    ON CONFLICT (produto_id,loja_id) DO UPDATE SET quantidade_atual=1000;
  INSERT INTO public.precos_atacado (produto_id, loja_id, quantidade_minima, preco_unitario, ativo) VALUES (pa, la, 5, 90.00, true);
  FOREACH f IN ARRAY ARRAY['DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO'] LOOP
    INSERT INTO public.formas_pagamento (loja_id,codigo,nome,ativo) VALUES (la,f,f,true),(lb,f,f,true)
      ON CONFLICT (loja_id,codigo) DO UPDATE SET ativo=true;
  END LOOP;
  INSERT INTO public.configuracoes_gerais (chave, valor, tipo_dado, empresa_id) VALUES
    ('comissao_padrao_percentual','5','percent',ea),('comissao_padrao_percentual','5','percent',eb)
    ON CONFLICT DO NOTHING;
  UPDATE public.configuracoes_gerais SET valor='5' WHERE chave='comissao_padrao_percentual' AND empresa_id IN (ea,eb);
  INSERT INTO public.caixas (operador_id,status,data_abertura,valor_inicial,loja_id) VALUES (opa,'ABERTO',now(),100,la) RETURNING id INTO ca;
  INSERT INTO public.caixas (operador_id,status,data_abertura,valor_inicial,loja_id) VALUES (opb,'ABERTO',now(),100,lb) RETURNING id INTO cb;
  INSERT INTO _ctx VALUES ('ea',ea),('eb',eb),('la',la),('lb',lb),('dona',dona),('gea',gea),('opa',opa),('vea',vea),('veb2',veb2),
    ('geb',geb),('opb',opb),('cat',cat),('cat2',cat2),('pa',pa),('pa2',pa2),('pb',pb),('ca',ca),('cb',cb);
END $setup$;

CREATE FUNCTION pg_temp.c(k text) RETURNS uuid LANGUAGE sql AS $f$ SELECT v FROM _ctx WHERE _ctx.k = $1 $f$;
CREATE FUNCTION pg_temp.ok(cond boolean, rotulo text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', rotulo; END IF; RAISE NOTICE 'ok: %', rotulo; END $f$;
CREATE FUNCTION pg_temp.como(u text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN PERFORM set_config('request.jwt.claim.sub', coalesce(pg_temp.c(u)::text, ''), true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.c(u), 'role', 'authenticated')::text, true); END $f$;
-- Venda pela RPC canônica v4 (web). itens: [{"p":"pa","q":2,"pu":100,"tp":"VAREJO"}];
-- p_desc_pct = desconto comercial do operador sobre o total (AUTORIZACAO_COMERCIAL, até 10%), igual ao caixa web.
CREATE FUNCTION pg_temp.vender(p_id uuid, p_caixa text, p_op text, p_loja text, p_itens jsonb, p_desc_pct numeric DEFAULT NULL,
  p_pag jsonb DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r record; it jsonb := '[]'; x jsonb; t record;
BEGIN
  FOR x IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    it := it || jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', pg_temp.c(x->>'p'),
      'quantidade', (x->>'q')::numeric, 'preco_original', (x->>'pu')::numeric, 'preco_unitario', (x->>'pu')::numeric,
      'tipo_preco', coalesce(x->>'tp','VAREJO')));
  END LOOP;
  SELECT * INTO t FROM internal.calcular_totais_venda(it, p_desc_pct);
  PERFORM pg_temp.como(p_op);
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    p_id, pg_temp.c(p_caixa), pg_temp.c(p_op), pg_temp.c(p_loja), 'DINHEIRO', t.total_bruto, t.total_desconto, t.total_liquido,
    coalesce(p_pag, jsonb_build_array(jsonb_build_object('forma_pagamento','DINHEIRO','valor',t.total_liquido))), it,
    NULL, p_desc_pct, false, false, NULL, NULL, NULL, NULL, NULL,
    CASE WHEN p_desc_pct IS NULL THEN 'NAO_ESPECIFICADO' ELSE 'AUTORIZACAO_COMERCIAL' END::public.motivo_desconto_enum_tipo);
  RETURN r.status;
END $f$;
DO $g$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated, service_role', pg_my_temp_schema()::regnamespace);
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO authenticated, service_role', pg_my_temp_schema()::regnamespace); END $g$;
