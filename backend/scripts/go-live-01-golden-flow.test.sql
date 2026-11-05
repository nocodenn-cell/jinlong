-- JL-GO-LIVE-01 — Golden flow operacional do PDV (prova SQL com verificação de efeitos persistidos).
-- Executar SOMENTE em cópia descartável (ex.: sec_gf01 criada de homolog_real com a migration 20261104180000):
--   docker exec -i supabase_db_fastproduct psql -U postgres -d sec_gf01 -v ON_ERROR_STOP=1 -f - < este_arquivo
-- Dados sintéticos criados aqui (empresas/lojas/usuários/produtos GF*). Tudo roda em transação com ROLLBACK,
-- mas cada passo confere o estado persistido DENTRO da transação (saldo, estoque, pagamentos, auditoria),
-- não apenas o retorno da RPC. Variações são medidas como delta (antes/depois), para não depender de histórico.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _gf (k text PRIMARY KEY, v uuid);

DO $setup$
DECLARE
  e uuid := 'd0000001-0000-4000-8000-000000000001';
  f uuid := 'd0000001-0000-4000-8000-000000000002';
  la uuid := 'd0000002-0000-4000-8000-000000000001';
  lb uuid := 'd0000002-0000-4000-8000-000000000002';
  lc uuid := 'd0000002-0000-4000-8000-000000000003';
  op uuid := 'd0000003-0000-4000-8000-000000000001';
  ger uuid := 'd0000003-0000-4000-8000-000000000002';
  dono uuid := 'd0000003-0000-4000-8000-000000000003';
  opx uuid := 'd0000003-0000-4000-8000-000000000004';
  cat uuid := 'd0000004-0000-4000-8000-000000000001';
  p1 uuid := 'd0000005-0000-4000-8000-000000000001';
  p2 uuid := 'd0000005-0000-4000-8000-000000000002';
  cli uuid := 'd0000006-0000-4000-8000-000000000001';
  cx uuid; cxc uuid; forma text;
BEGIN
  INSERT INTO public.empresas (id, nome) VALUES (e, 'GF Empresa Piloto'), (f, 'GF Empresa Isolada');
  INSERT INTO auth.users (id) VALUES (op), (ger), (dono), (opx);
  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES
    (e, la, 'GF Loja A', 'GFA', true), (e, lb, 'GF Loja B', 'GFB', true), (f, lc, 'GF Loja C', 'GFC', true);
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (op, 'GF Operador A', 'OPERADOR', true, la), (ger, 'GF Gerente A', 'GERENTE', true, la),
    (dono, 'GF Dono', 'DONO', true, la), (opx, 'GF Operador C', 'OPERADOR', true, lc);
  INSERT INTO public.categorias (id, nome, empresa_id) VALUES (cat, 'GF Mercearia', e);
  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id, unidade_medida) VALUES
    (p1, 'GF7890000000011', 'GF Arroz 5kg', cat, 10.00, 'brasil_nf', false, true, la, 'UN'),
    (p2, 'GF7890000000028', 'GF Queijo Minas', cat, 40.00, 'brasil_nf', false, true, la, 'KG');
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES
    (p1, la, 100, 0), (p2, la, 10, 0), (p1, lb, 0, 0);
  FOREACH forma IN ARRAY ARRAY['DINHEIRO', 'PIX', 'CARTAO_CREDITO'] LOOP
    INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES (la, forma, forma, true), (lb, forma, forma, true)
      ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;
  END LOOP;
  INSERT INTO public.clientes (id, nome, limite_credito, loja_id, tipo) VALUES (cli, 'GF Cliente Fiado', 500, la, 'PF');
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (op, 'ABERTO', now(), 100, la) RETURNING id INTO cx;
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (opx, 'ABERTO', now(), 50, lc) RETURNING id INTO cxc;
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
    VALUES ('GF-DESC-25', now() + interval '1 day', false, ger);
  INSERT INTO _gf VALUES ('e', e), ('la', la), ('lb', lb), ('lc', lc), ('op', op), ('ger', ger), ('dono', dono),
    ('opx', opx), ('p1', p1), ('p2', p2), ('cli', cli), ('cx', cx), ('cxc', cxc);
END $setup$;

CREATE FUNCTION pg_temp.g(k text) RETURNS uuid LANGUAGE sql AS $f$ SELECT v FROM _gf WHERE _gf.k = $1 $f$;

CREATE FUNCTION pg_temp.pg(VARIADIC a text[]) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_agg(jsonb_build_object('forma_pagamento', a[i], 'valor', a[i+1]::numeric))
  FROM generate_series(1, array_length(a, 1), 2) i $f$;

-- Venda: qtd de produto, preço de tabela e preço praticado (desconto = bruto - líquido).
CREATE FUNCTION pg_temp.vender(p_id uuid, p_caixa uuid, p_op uuid, p_loja uuid, p_prod uuid, p_qtd numeric,
  p_orig numeric, p_unit numeric, p_forma text, p_pag jsonb, p_token text DEFAULT NULL, p_pct numeric DEFAULT NULL,
  p_cliente uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r record; v_bruto numeric := round(p_qtd * p_orig, 2); v_liq numeric := round(p_qtd * p_unit, 2);
BEGIN
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    p_venda_id => p_id, p_caixa_id => p_caixa, p_operador_id => p_op, p_loja_id => p_loja,
    p_forma_pagamento => p_forma, p_total_bruto => v_bruto, p_total_desconto => v_bruto - v_liq,
    p_total_liquido => v_liq, p_pagamentos => p_pag,
    p_itens => jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', p_prod,
      'quantidade', p_qtd, 'preco_original', p_orig, 'preco_unitario', p_unit, 'tipo_preco', CASE WHEN p_unit < p_orig THEN 'MANUAL' ELSE 'VAREJO' END)),
    p_desconto_gerente_token => p_token, p_desconto_gerente_percentual => p_pct, p_cliente_id => p_cliente);
  RETURN r.status;
END $f$;

CREATE FUNCTION pg_temp.saldo(p_caixa uuid) RETURNS numeric LANGUAGE sql AS $f$
  SELECT saldo_atual FROM public.caixas WHERE id = p_caixa $f$;
CREATE FUNCTION pg_temp.estoque(p_prod uuid, p_loja uuid) RETURNS numeric LANGUAGE sql AS $f$
  SELECT quantidade_atual FROM public.estoque WHERE produto_id = p_prod AND loja_id = p_loja $f$;
CREATE FUNCTION pg_temp.pago(p_venda uuid) RETURNS numeric LANGUAGE sql AS $f$
  SELECT coalesce(sum(valor), 0) FROM public.vendas_pagamentos WHERE venda_id = p_venda $f$;
CREATE FUNCTION pg_temp.nparc(p_venda uuid) RETURNS bigint LANGUAGE sql AS $f$
  SELECT count(*) FROM public.vendas_pagamentos WHERE venda_id = p_venda $f$;
CREATE FUNCTION pg_temp.snap(p_caixa uuid, p_loja uuid, p_prod uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT format('saldo_caixa=%s estoque=%s vendas_no_caixa=%s parcelas_no_caixa=%s',
    pg_temp.saldo(p_caixa), pg_temp.estoque(p_prod, p_loja),
    (SELECT count(*) FROM public.vendas WHERE caixa_id = p_caixa),
    (SELECT count(*) FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id = vp.venda_id WHERE v.caixa_id = p_caixa)) $f$;

-- Negativo: a operação DEVE falhar com o erro esperado (padrão LIKE). Sucesso aqui é falha do teste.
CREATE FUNCTION pg_temp.espera(sql text, padrao text, rotulo text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE padrao THEN RAISE EXCEPTION '% FALHOU: erro inesperado: %', rotulo, SQLERRM; END IF;
    RAISE NOTICE 'OK % -> recusado: %', rotulo, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION '% FALHOU: operação deveria ser recusada', rotulo;
END
$f$;

DO $t$
DECLARE
  e uuid := pg_temp.g('e'); la uuid := pg_temp.g('la'); lb uuid := pg_temp.g('lb'); lc uuid := pg_temp.g('lc');
  op uuid := pg_temp.g('op'); ger uuid := pg_temp.g('ger'); dono uuid := pg_temp.g('dono'); opx uuid := pg_temp.g('opx');
  p1 uuid := pg_temp.g('p1'); p2 uuid := pg_temp.g('p2'); cli uuid := pg_temp.g('cli');
  cx uuid := pg_temp.g('cx'); cxc uuid := pg_temp.g('cxc');
  v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid(); v3 uuid := gen_random_uuid(); v4 uuid := gen_random_uuid();
  v5 uuid := gen_random_uuid(); v6 uuid := gen_random_uuid(); v7 uuid := gen_random_uuid(); v_neg uuid := gen_random_uuid();
  v_falha uuid := gen_random_uuid();
  s text; n int; x numeric; y numeric; z numeric; a0 numeric; b0 numeric; c0 numeric; sis numeric;
  st text; sc uuid; r record; esp_id uuid; titulo uuid; oper uuid; t_id uuid; dev_id uuid; mov_id uuid;
  it uuid;
BEGIN
  RAISE NOTICE 'ESTADO INICIAL: %', pg_temp.snap(cx, la, p1);

  -- 1) Login do operador: o status do operador resolve o caixa aberto dele
  PERFORM set_config('request.jwt.claim.sub', op::text, true);
  SELECT o.status, o.caixa_id INTO st, sc FROM public.obter_status_caixa_operador(op) o;
  IF st IS DISTINCT FROM 'ABERTO' OR sc IS DISTINCT FROM cx THEN
    RAISE EXCEPTION 'GF-1 FALHOU: status=% caixa=%', st, sc; END IF;
  RAISE NOTICE 'OK 1 login/status do operador: caixa ABERTO resolvido';

  -- 2) Abertura de caixa (valor inicial vira saldo; sem RPC de abertura, ver relatório)
  IF pg_temp.saldo(cx) <> 100 THEN RAISE EXCEPTION 'GF-2 FALHOU: saldo inicial %', pg_temp.saldo(cx); END IF;
  RAISE NOTICE 'OK 2 abertura: saldo inicial = valor_inicial = 100';

  -- 3) Busca por código de barras e por nome: ambas devem achar o mesmo produto ativo da loja
  SELECT count(*) INTO n FROM public.produtos WHERE ativo AND loja_id = la AND codigo_barras = 'GF7890000000011' AND id = p1;
  SELECT count(*) INTO y FROM public.produtos WHERE ativo AND loja_id = la AND nome ILIKE 'GF Arroz%' AND id = p1;
  IF n <> 1 OR y <> 1 THEN RAISE EXCEPTION 'GF-3 FALHOU: barras=% nome=%', n, y; END IF;
  RAISE NOTICE 'OK 3 busca por código de barras e por nome encontra GF Arroz';

  -- 4) Venda simples: 2 x 10,00 em dinheiro
  a0 := pg_temp.estoque(p1, la); b0 := pg_temp.saldo(cx);
  s := pg_temp.vender(v1, cx, op, la, p1, 2, 10, 10, 'DINHEIRO', pg_temp.pg('DINHEIRO', '20'));
  SELECT total_liquido, total_desconto INTO x, y FROM public.vendas WHERE id = v1;
  IF s <> 'CONCLUIDA' OR x <> 20 OR y <> 0 OR pg_temp.pago(v1) <> 20 THEN
    RAISE EXCEPTION 'GF-4 FALHOU: status=% total=% desc=% pago=%', s, x, y, pg_temp.pago(v1); END IF;
  IF pg_temp.estoque(p1, la) <> a0 - 2 THEN RAISE EXCEPTION 'GF-4 FALHOU: estoque não baixou 2'; END IF;
  IF pg_temp.saldo(cx) <> b0 + 20 THEN RAISE EXCEPTION 'GF-4 FALHOU: caixa não recebeu 20 em dinheiro'; END IF;
  RAISE NOTICE 'OK 4 venda simples: total 20, estoque -2, caixa +20 (persistido)';

  -- 5) Venda fracionada 0,500 kg de queijo a 40,00/kg em PIX = 20,00 (caixa em dinheiro não muda)
  a0 := pg_temp.estoque(p2, la); b0 := pg_temp.saldo(cx);
  s := pg_temp.vender(v2, cx, op, la, p2, 0.5, 40, 40, 'PIX', pg_temp.pg('PIX', '20'));
  SELECT quantidade INTO x FROM public.itens_venda WHERE venda_id = v2;
  IF s <> 'CONCLUIDA' OR x <> 0.5 OR pg_temp.pago(v2) <> 20 THEN
    RAISE EXCEPTION 'GF-5 FALHOU: status=% qtd=% pago=%', s, x, pg_temp.pago(v2); END IF;
  IF pg_temp.estoque(p2, la) <> a0 - 0.5 THEN RAISE EXCEPTION 'GF-5 FALHOU: estoque fracionado não baixou 0,5'; END IF;
  IF pg_temp.saldo(cx) <> b0 THEN RAISE EXCEPTION 'GF-5 FALHOU: PIX alterou saldo em dinheiro'; END IF;
  RAISE NOTICE 'OK 5 fracionado 0,500 kg: estoque -0,5, PIX não entra no saldo em dinheiro';

  -- 6a) Desconto permitido pelo operador: 10% (limite manual 15%) — 10,00 -> 9,00 em dinheiro
  b0 := pg_temp.saldo(cx);
  s := pg_temp.vender(v3, cx, op, la, p1, 1, 10, 9, 'DINHEIRO', pg_temp.pg('DINHEIRO', '9'));
  SELECT total_desconto, total_liquido INTO x, y FROM public.vendas WHERE id = v3;
  IF s <> 'CONCLUIDA' OR x <> 1 OR y <> 9 OR pg_temp.saldo(cx) <> b0 + 9 THEN
    RAISE EXCEPTION 'GF-6a FALHOU: status=% desc=% liq=%', s, x, y; END IF;
  RAISE NOTICE 'OK 6a desconto manual 10%% permitido: desconto 1,00 gravado, caixa +9';

  -- 6b) Desconto bloqueado: 25% sem token de gerente (acima do limite manual)
  a0 := pg_temp.estoque(p1, la); b0 := pg_temp.saldo(cx);
  BEGIN
    PERFORM pg_temp.vender(v_neg, cx, op, la, p1, 1, 10, 7.5, 'DINHEIRO', pg_temp.pg('DINHEIRO', '7.5'));
    RAISE EXCEPTION 'GF-6b FALHOU: desconto de 25%% sem gerente foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'GF-6b FALHOU%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%DESCONTO%' THEN RAISE EXCEPTION 'GF-6b FALHOU: recusa por outro motivo: %', SQLERRM; END IF;
    RAISE NOTICE 'OK 6b desconto 25%% sem gerente recusado: %', SQLERRM;
  END;
  IF EXISTS (SELECT 1 FROM public.vendas WHERE id = v_neg) OR pg_temp.estoque(p1, la) <> a0 OR pg_temp.saldo(cx) <> b0 THEN
    RAISE EXCEPTION 'GF-6b FALHOU: recusa deixou efeito persistido'; END IF;

  -- 6c) Desconto com token de gerente (25%, dentro do máximo gerencial de 30%)
  b0 := pg_temp.saldo(cx);
  -- Desconto global de gerente: o servidor aplica o percentual sobre os itens (item a preço cheio). 10 - 25% = 7,50.
  SELECT fz.status INTO s FROM public.finalizar_venda_transacional_canonica_v4(p_venda_id => v4, p_caixa_id => cx, p_operador_id => op, p_loja_id => la, p_forma_pagamento => 'DINHEIRO', p_total_bruto => 10, p_total_desconto => 2.5, p_total_liquido => 7.5, p_pagamentos => pg_temp.pg('DINHEIRO', '7.5'), p_itens => jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', p1, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10, 'tipo_preco', 'VAREJO')), p_desconto_gerente_token => 'GF-DESC-25', p_desconto_gerente_percentual => 25) fz;
  IF s <> 'CONCLUIDA' OR pg_temp.saldo(cx) <> b0 + 7.5 OR (SELECT total_desconto FROM public.vendas WHERE id = v4) <> 2.5 THEN
    RAISE EXCEPTION 'GF-6c FALHOU: desconto com token não persistiu (status=%)', s; END IF;
  IF (SELECT usado FROM public.tokens_desconto_gerente WHERE token = 'GF-DESC-25') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GF-6c FALHOU: token de gerente não foi consumido'; END IF;
  RAISE NOTICE 'OK 6c desconto 25%% com token do gerente: gravado, caixa +7,50, token consumido';

  -- 7) Pagamento dividido: 30,00 = 10,00 dinheiro + 20,00 PIX
  b0 := pg_temp.saldo(cx); SELECT coalesce(sum(valor),0) INTO a0 FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id=vp.venda_id WHERE v.caixa_id=cx AND vp.forma_pagamento='PIX';
  s := pg_temp.vender(v5, cx, op, la, p1, 3, 10, 10, 'DINHEIRO', pg_temp.pg('DINHEIRO', '10', 'PIX', '20'));
  IF s <> 'CONCLUIDA' OR pg_temp.nparc(v5) <> 2 OR pg_temp.pago(v5) <> 30 THEN
    RAISE EXCEPTION 'GF-7 FALHOU: status=% parcelas=% pago=%', s, pg_temp.nparc(v5), pg_temp.pago(v5); END IF;
  IF pg_temp.saldo(cx) <> b0 + 10 THEN RAISE EXCEPTION 'GF-7 FALHOU: caixa deveria receber só os 10 em dinheiro'; END IF;
  SELECT coalesce(sum(valor),0) INTO x FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id=vp.venda_id WHERE v.caixa_id=cx AND vp.forma_pagamento='PIX';
  IF x - a0 <> 20 THEN RAISE EXCEPTION 'GF-7 FALHOU: PIX do split = %', x - a0; END IF;
  RAISE NOTICE 'OK 7 pagamento dividido: 2 parcelas somando 30; caixa +10 (dinheiro), PIX +20 fora do caixa';

  -- 7b) Idempotência: repetir a mesma venda (mesmo id) não duplica pagamento nem saldo
  b0 := pg_temp.saldo(cx); a0 := pg_temp.estoque(p1, la);
  s := pg_temp.vender(v5, cx, op, la, p1, 3, 10, 10, 'DINHEIRO', pg_temp.pg('DINHEIRO', '10', 'PIX', '20'));
  IF s <> 'CONCLUIDA' OR pg_temp.nparc(v5) <> 2 OR pg_temp.saldo(cx) <> b0 OR pg_temp.estoque(p1, la) <> a0 THEN
    RAISE EXCEPTION 'GF-7b FALHOU: replay alterou efeitos (parcelas=% saldo=%)', pg_temp.nparc(v5), pg_temp.saldo(cx); END IF;
  RAISE NOTICE 'OK 7b replay da mesma venda: sem parcela duplicada, sem baixa dupla de estoque ou caixa';

  -- 8) Venda em espera e retomada (espera não baixa estoque; a conversão em venda baixa uma única vez)
  a0 := pg_temp.estoque(p1, la); b0 := pg_temp.saldo(cx);
  SELECT (public.colocar_venda_em_espera(
      jsonb_build_array(jsonb_build_object('produto_id', p1, 'quantidade', 1, 'preco_unitario', 10, 'nome', 'GF Arroz 5kg')),
      jsonb_build_object('totalLiquido', 10, 'totalBruto', 10, 'totalDesconto', 0), cx, 'GF espera 1', NULL, NULL, NULL) ->> 'id')::uuid
    INTO esp_id;
  IF esp_id IS NULL THEN RAISE EXCEPTION 'GF-8 FALHOU: colocar_venda_em_espera não devolveu id'; END IF;
  IF pg_temp.estoque(p1, la) <> a0 OR pg_temp.saldo(cx) <> b0 THEN
    RAISE EXCEPTION 'GF-8 FALHOU: venda em espera alterou estoque ou caixa'; END IF;
  PERFORM public.retomar_venda_em_espera(esp_id);
  PERFORM pg_temp.espera(format('SELECT public.retomar_venda_em_espera(%L)', esp_id), '%venda_em_espera_em_uso%', 'GF-8 retomada dupla');
  PERFORM public.devolver_venda_em_espera(esp_id);
  PERFORM public.retomar_venda_em_espera(esp_id);
  PERFORM public.converter_venda_em_espera(esp_id);
  PERFORM public.converter_venda_em_espera(esp_id);
  IF (SELECT status FROM public.vendas_em_espera WHERE id = esp_id) = 'EM_ESPERA' THEN
    RAISE EXCEPTION 'GF-8 FALHOU: espera continua EM_ESPERA após conversão'; END IF;
  s := pg_temp.vender(v6, cx, op, la, p1, 1, 10, 10, 'DINHEIRO', pg_temp.pg('DINHEIRO', '10'));
  IF s <> 'CONCLUIDA' OR pg_temp.estoque(p1, la) <> a0 - 1 OR pg_temp.saldo(cx) <> b0 + 10 THEN
    RAISE EXCEPTION 'GF-8 FALHOU: conversão da espera não baixou exatamente 1 (estoque=%)', pg_temp.estoque(p1, la); END IF;
  RAISE NOTICE 'OK 8 venda em espera: nada baixado ao salvar; retomada exclusiva; conversão baixa 1 vez';

  -- 9) Pagamento parcial a prazo (FIADO) e crédito de cliente: o servidor desabilitou FIADO nesta versão.
  --    Asserção negativa: a venda a prazo é recusada e nada é gravado. Liquidação de título não é exercitada aqui.
  PERFORM pg_temp.espera(format('SELECT pg_temp.vender(%L,%L,%L,%L,%L,3,10,10,%L,%L,NULL,NULL,%L)', gen_random_uuid(), cx, op, la, p1,
    'FIADO', pg_temp.pg('DINHEIRO', '10', 'FIADO', '20'), cli), 'FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO%', 'GF-9 venda a prazo');
  IF EXISTS (SELECT 1 FROM public.contas_receber WHERE cliente_id = cli) THEN
    RAISE EXCEPTION 'GF-9 FALHOU: título a receber criado apesar de FIADO desabilitado'; END IF;
  RAISE NOTICE 'OK 9 pagamento a prazo: FIADO recusado pelo servidor (FIADO_DESABILITADO), sem título gravado (NÃO SUPORTADO nesta versão)';

  -- 10) Comprovante: não há RPC de comprovante no banco; a emissão é de tela (ver matriz). Não simulado aqui.

  -- 11) Cancelamento de venda pelo gerente: estorna dinheiro, devolve estoque, grava auditoria
  a0 := pg_temp.estoque(p1, la); b0 := pg_temp.saldo(cx);
  PERFORM set_config('request.jwt.claim.sub', ger::text, true);
  SELECT c.status_venda, c.valor_estornado INTO st, x FROM public.cancelar_venda_transacional(v1, 'gf cancelamento', ger) c;
  PERFORM set_config('request.jwt.claim.sub', op::text, true);
  IF st <> 'CANCELADA' OR x <> 20 OR (SELECT status FROM public.vendas WHERE id = v1) <> 'CANCELADA' THEN
    RAISE EXCEPTION 'GF-11 FALHOU: status=% estornado=%', st, x; END IF;
  IF pg_temp.estoque(p1, la) <> a0 + 2 THEN RAISE EXCEPTION 'GF-11 FALHOU: estoque não voltou 2'; END IF;
  IF pg_temp.saldo(cx) <> b0 - 20 THEN RAISE EXCEPTION 'GF-11 FALHOU: caixa não estornou 20 (saldo=%)', pg_temp.saldo(cx); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendas_canceladas_auditoria WHERE venda_id = v1 AND valor_estornado = 20) THEN
    RAISE EXCEPTION 'GF-11 FALHOU: sem auditoria de cancelamento'; END IF;
  IF (SELECT coalesce(sum(valor),0) FROM public.devolucoes WHERE venda_id = v1) <> 20 THEN
    RAISE EXCEPTION 'GF-11 FALHOU: devolucoes sem o estorno de 20'; END IF;
  PERFORM pg_temp.espera(format('SELECT public.cancelar_venda_transacional(%L, %L, %L)', v1, 'repetido', ger), 'CANCELAR_VENDA_JA_CANCELADA%', 'GF-11 cancelamento repetido');
  PERFORM pg_temp.espera(format('SELECT public.cancelar_venda_transacional(%L, %L, %L)', v2, 'operador', op), 'CANCELAR_VENDA_SEM_PERMISSAO%', 'GF-11 operador sem permissão');
  RAISE NOTICE 'OK 11 cancelamento: CANCELADA, estoque +2, caixa -20, auditoria e devolução gravadas; repetição e operador recusados';

  -- 12) Devolução parcial de item (gerente executa) (1 un. da venda v3) com estorno em dinheiro: estoque, caixa e idempotência
  SELECT id INTO it FROM public.itens_venda WHERE venda_id = v3 LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', op::text, true); -- devolução exige gerente: o operador é recusado
  PERFORM pg_temp.espera(format('SELECT * FROM public.devolver_ou_trocar_venda(%L,%L,%L,%L,%L::jsonb,9,%L,NULL,%L,%L)', v3, 'gf-dev-op', 'gf devolucao negativa', 'DEVOLUCAO', jsonb_build_array(jsonb_build_object('item_venda_id', it, 'quantidade', 1))::text, 'DINHEIRO', op, cx), 'DEVOLVER_VENDA_SEM_PERMISSAO%', 'GF-12 operador sem permissão');
  PERFORM set_config('request.jwt.claim.sub', ger::text, true);
  a0 := pg_temp.estoque(p1, la); b0 := pg_temp.saldo(cx);
  SELECT d.operacao_id, d.valor_caixa_estornado INTO dev_id, x FROM public.devolver_ou_trocar_venda(
    v3, 'gf-dev-1', 'gf devolucao', 'DEVOLUCAO', jsonb_build_array(jsonb_build_object('item_venda_id', it, 'quantidade', 1)),
    9, 'DINHEIRO', NULL, ger, cx) d;
  IF dev_id IS NULL OR x <> 9 OR pg_temp.estoque(p1, la) <> a0 + 1 OR pg_temp.saldo(cx) <> b0 - 9 THEN
    RAISE EXCEPTION 'GF-12 FALHOU: operacao=% caixa_estornado=% estoque=% saldo=%', dev_id, x, pg_temp.estoque(p1, la), pg_temp.saldo(cx); END IF;
  SELECT d.operacao_id INTO esp_id FROM public.devolver_ou_trocar_venda(
    v3, 'gf-dev-1', 'gf devolucao', 'DEVOLUCAO', jsonb_build_array(jsonb_build_object('item_venda_id', it, 'quantidade', 1)),
    9, 'DINHEIRO', NULL, ger, cx) d;
  IF esp_id IS DISTINCT FROM dev_id OR pg_temp.estoque(p1, la) <> a0 + 1 OR pg_temp.saldo(cx) <> b0 - 9 THEN
    RAISE EXCEPTION 'GF-12 FALHOU: repetição da devolução com a mesma chave duplicou efeito'; END IF;
  IF (SELECT count(*) FROM public.venda_pos_venda_operacoes WHERE venda_id = v3 AND idempotency_key = 'gf-dev-1') <> 1 THEN
    RAISE EXCEPTION 'GF-12 FALHOU: operação de pós-venda ausente ou duplicada na auditoria'; END IF;
  RAISE NOTICE 'OK 12 devolução parcial: estoque +1, caixa -9 (dinheiro), repetição com mesma chave sem efeito duplo';

  -- 13) Transferência de estoque entre lojas (A -> B) com saldo esperado e idempotência
  a0 := pg_temp.estoque(p1, la); b0 := pg_temp.estoque(p1, lb);
  PERFORM set_config('request.jwt.claim.sub', ger::text, true);
  t_id := public.transferir_estoque_seguro(la, lb, p1, 5, 'gf transferencia', 'gf-tr-1', a0);
  IF t_id IS NULL OR pg_temp.estoque(p1, la) <> a0 - 5 OR pg_temp.estoque(p1, lb) <> b0 + 5 THEN
    RAISE EXCEPTION 'GF-13 FALHOU: transferência não refletiu A-5/B+5'; END IF;
  IF public.transferir_estoque_seguro(la, lb, p1, 5, 'gf transferencia', 'gf-tr-1', a0 - 5) IS DISTINCT FROM t_id
     OR pg_temp.estoque(p1, la) <> a0 - 5 OR pg_temp.estoque(p1, lb) <> b0 + 5 THEN
    RAISE EXCEPTION 'GF-13 FALHOU: repetição da transferência duplicou movimento'; END IF;
  PERFORM pg_temp.espera(format('SELECT public.transferir_estoque_seguro(%L,%L,%L,%s,%L,%L,%s)', la, lb, p1, 1, 'obs', 'gf-tr-stale', 999), '%', 'GF-13 saldo esperado divergente');
  PERFORM pg_temp.espera(format('SELECT public.transferir_estoque_seguro(%L,%L,%L,%s,%L,%L,%s)', la, lc, p1, 1, 'obs', 'gf-tr-iso', pg_temp.estoque(p1, la)), '%', 'GF-13 destino de outra empresa');
  RAISE NOTICE 'OK 13 transferência A->B: A-5, B+5; repetição sem duplicar; saldo divergente e destino de outra empresa recusados';

  -- 14) Ajuste manual de estoque: só gerente; com saldo esperado; operador e saldo defasado recusados
  a0 := pg_temp.estoque(p1, la);
  PERFORM set_config('request.jwt.claim.sub', ger::text, true);
  PERFORM public.ajustar_estoque_manual_seguro(p1, la, a0 - 3, 0, 'ACERTO_INVENTARIO', 'gf ajuste', ger, a0, 0);
  IF pg_temp.estoque(p1, la) <> a0 - 3 THEN RAISE EXCEPTION 'GF-14 FALHOU: ajuste não gravou (estoque=%)', pg_temp.estoque(p1, la); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.movimentos_estoque_log WHERE produto_id = p1 AND loja_id = la AND usuario_id = ger AND observacao ILIKE '%gf ajuste%') THEN
    RAISE EXCEPTION 'GF-14 FALHOU: ajuste sem registro no log de movimentos'; END IF;
  PERFORM set_config('request.jwt.claim.sub', op::text, true);
  PERFORM pg_temp.espera(format('SELECT public.ajustar_estoque_manual_seguro(%L,%L,%s,0,%L,%L,%L,%s,0)', p1, la, 1, 'ACERTO_INVENTARIO', 'op', op, 1), '%', 'GF-14 operador sem permissão');
  PERFORM set_config('request.jwt.claim.sub', ger::text, true);
  PERFORM pg_temp.espera(format('SELECT public.ajustar_estoque_manual_seguro(%L,%L,%s,0,%L,%L,%L,%s,0)', p1, la, 1, 'ACERTO_INVENTARIO', 'stale', ger, a0), '%', 'GF-14 saldo esperado defasado');
  RAISE NOTICE 'OK 14 ajuste manual: gerente ajusta com log; operador e saldo defasado recusados';

  -- 15) Fechamento de caixa com diferença: contado = sistema - 5,00 -> diferença -5,00
  PERFORM set_config('request.jwt.claim.sub', op::text, true);
  SELECT valor_sistema_dinheiro INTO sis FROM public.obter_status_caixa_operador(op);
  SELECT f.o_diferenca, f.o_valor_sistema INTO x, y FROM public.fechar_caixa_atomico(op, sis - 5, 'gf fechamento com diferenca') f;
  SELECT status, valor_fechamento, fechamento_diferenca INTO st, z, n FROM public.caixas WHERE id = cx;
  IF x IS DISTINCT FROM -5 OR st <> 'FECHADO' OR z <> sis - 5 OR n <> -5 THEN
    RAISE EXCEPTION 'GF-15 FALHOU: diferenca=% status=% contado=% gravado=%', x, st, sis - 5, n; END IF;
  PERFORM pg_temp.espera(format('SELECT public.finalizar_venda_transacional_canonica_v4(%L,%L,%L,%L,%L,10,0,10,%L,%L)', gen_random_uuid(), cx, op, la, 'DINHEIRO',
    pg_temp.pg('DINHEIRO', '10'), jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', p1, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10, 'tipo_preco', 'VAREJO'))), '%', 'GF-15 venda em caixa fechado');
  RAISE NOTICE 'OK 15 fechamento: diferença -5,00 gravada, caixa FECHADO, venda em caixa fechado recusada';

  -- 16) Reabertura: gerente autoriza com token de uso único; o caixa fechado mantém o histórico e um turno novo abre
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
    VALUES ('GF-REOPEN-1', now() + interval '1 day', false, ger);
  PERFORM set_config('request.jwt.claim.sub', ger::text, true); -- reabertura exige gerente requisitante
  BEGIN
    SELECT rc.o_novo_caixa_id INTO esp_id FROM public.retomar_caixa_atomico(cx, 'GF-REOPEN-1', 'gf reabertura') rc;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'GF-16 FALHOU: reabertura recusada: %', SQLERRM;
  END;
  IF esp_id IS NULL OR esp_id = cx THEN RAISE EXCEPTION 'GF-16 FALHOU: reabertura não gerou novo caixa'; END IF;
  IF (SELECT status FROM public.caixas WHERE id = cx) <> 'FECHADO' THEN RAISE EXCEPTION 'GF-16 FALHOU: caixa anterior deixou de ser histórico'; END IF;
  IF (SELECT status FROM public.caixas WHERE id = esp_id) <> 'ABERTO' THEN RAISE EXCEPTION 'GF-16 FALHOU: novo turno não está ABERTO'; END IF;
  IF (SELECT usado FROM public.tokens_desconto_gerente WHERE token = 'GF-REOPEN-1') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GF-16 FALHOU: token de reabertura não consumido'; END IF;
  PERFORM pg_temp.espera(format('SELECT * FROM public.retomar_caixa_atomico(%L,%L,%L)', cx, 'GF-REOPEN-1', 'repetido'), '%', 'GF-16 token reutilizado');
  RAISE NOTICE 'OK 16a reabertura com token do gerente: turno novo ABERTO, caixa anterior FECHADO preservado, token consumido, reuso recusado';

  -- 17) Histórico do gerente: vendas do período com status (a cancelada aparece como CANCELADA)
  PERFORM set_config('request.jwt.claim.sub', ger::text, true);
  SELECT count(*), count(*) FILTER (WHERE to_jsonb(h)::text LIKE '%CANCELADA%') INTO n, z
    FROM public.listar_vendas_gerente(la, now() - interval '1 day', now() + interval '1 day', NULL, NULL, 0, 100) h;
  IF n <> 6 OR z < 1 THEN RAISE EXCEPTION 'GF-17 FALHOU: histórico com % vendas e % canceladas (esperado 6 e >=1)', n, z; END IF;

  -- 18) Isolamento entre empresas: operador da empresa C não toca loja/venda/estoque da empresa piloto
  PERFORM set_config('request.jwt.claim.sub', opx::text, true);
  PERFORM pg_temp.espera(format('SELECT public.finalizar_venda_transacional_canonica_v4(%L,%L,%L,%L,%L,10,0,10,%L,%L)', gen_random_uuid(), cx, opx, la, 'DINHEIRO',
    pg_temp.pg('DINHEIRO', '10'), jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', p1, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10, 'tipo_preco', 'VAREJO'))), '%', 'GF-18 venda no caixa de outra empresa');
  PERFORM pg_temp.espera(format('SELECT public.transferir_estoque_seguro(%L,%L,%L,%s,%L,%L,%s)', la, lc, p1, 1, 'iso', 'gf-tr-opx', pg_temp.estoque(p1, la)), '%', 'GF-18 transferência de loja alheia');
  PERFORM pg_temp.espera(format('SELECT count(*) FROM public.listar_vendas_gerente(%L, now() - interval ''1 day'', now() + interval ''1 day'', NULL, NULL, 0, 100)', la), 'ACESSO_LOJA_NEGADO%', 'GF-18 histórico de loja alheia');
  PERFORM set_config('request.jwt.claim.sub', op::text, true);
  RAISE NOTICE 'OK 18 isolamento: venda, transferência e histórico de outra empresa recusados/vazios';

  -- 19) Falha no meio da venda: 2º item inválido -> nada persiste (sem venda, sem parcela, estoque intacto)
  a0 := pg_temp.estoque(p1, la); b0 := pg_temp.saldo(cx);
  BEGIN
    PERFORM public.finalizar_venda_transacional_canonica_v4(v_falha, cx, op, la, 'PIX', 20, 0, 20, pg_temp.pg('PIX', '20'),
      jsonb_build_array(
        jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', p1, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10, 'tipo_preco', 'VAREJO'),
        jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', gen_random_uuid(), 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10, 'tipo_preco', 'VAREJO')));
    RAISE EXCEPTION 'GF-19 FALHOU: venda com item inválido concluiu';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'GF-19 FALHOU%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.vendas WHERE id = v_falha) OR EXISTS (SELECT 1 FROM public.vendas_pagamentos WHERE venda_id = v_falha)
     OR pg_temp.estoque(p1, la) <> a0 OR pg_temp.saldo(cx) <> b0 THEN
    RAISE EXCEPTION 'GF-19 FALHOU: falha parcial deixou resíduo'; END IF;
  RAISE NOTICE 'OK 19 falha no meio da venda: rollback total, sem resíduo';

  RAISE NOTICE 'ESTADO FINAL: %', pg_temp.snap(cx, la, p1);
  RAISE NOTICE 'GOLDEN FLOW PASSOU: blocos de asserção 1 a 19 (com subcasos)';
END
$t$;

ROLLBACK;
