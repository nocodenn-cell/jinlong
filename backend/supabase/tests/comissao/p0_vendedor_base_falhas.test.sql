-- P0 do módulo Comissão: vendedor da venda, base líquida (rateio em centavos), falhas + reprocessar, cabeçalho, RLS 2 empresas.
-- Roda contra a cadeia real de migrations (RPC canônica v4). Tudo em transação com ROLLBACK. Dados fictícios.
\set ON_ERROR_STOP on
BEGIN;
\ir _fixture.sql

-- Rateio puro (determinístico)
SELECT pg_temp.ok(internal.comissao_ratear_centavos(ARRAY[100,33.33,66.66]::numeric[], 10) = ARRAY[5.00,1.67,3.33]::numeric[], 'rateio 10,00 em 100/33,33/66,66 = 5,00/1,67/3,33');
SELECT pg_temp.ok(internal.comissao_ratear_centavos(ARRAY[1,1,1]::numeric[], 0.02) = ARRAY[0.01,0.01,0]::numeric[], 'empate de resto vai para o menor índice');
SELECT pg_temp.ok(internal.comissao_ratear_centavos(ARRAY[10]::numeric[], 50) = ARRAY[10]::numeric[], 'desconto limitado à base');
SELECT pg_temp.ok(internal.comissao_ratear_centavos(ARRAY[0,0]::numeric[], 5) = ARRAY[0,0]::numeric[], 'base zero => zero');

DO $t$
DECLARE v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid(); v3 uuid := gen_random_uuid(); v4 uuid := gen_random_uuid();
  v5 uuid := gen_random_uuid(); v6 uuid := gen_random_uuid(); cv record; n int; j jsonb; s numeric;
BEGIN
  -- 1. compatível: sem vendedor => operador, 5% sobre 200
  PERFORM pg_temp.vender(v1,'ca','opa','la','[{"p":"pa","q":2,"pu":100}]');
  SELECT * INTO cv FROM public.comissoes_vendedores WHERE venda_id = v1;
  PERFORM pg_temp.ok(cv.operador_id = pg_temp.c('opa') AND cv.valor_comissao = 10.00 AND cv.base_calculo = 200 AND NOT cv.regra_mista
    AND cv.percentual_aplicado = 5, 'sem vendedor: comissão do operador, 10,00 sobre 200,00 (igual ao legado)');

  -- 2. operador define a vendedora (mesma loja) => comissão migra
  PERFORM pg_temp.como('opa');
  j := public.definir_vendedor_venda(v1, pg_temp.c('vea'));
  SELECT * INTO cv FROM public.comissoes_vendedores WHERE venda_id = v1;
  PERFORM pg_temp.ok((j->>'alterado')::boolean AND cv.operador_id = pg_temp.c('vea') AND cv.valor_comissao = 10.00
    AND (SELECT vendedor_id FROM public.vendas WHERE id = v1) = pg_temp.c('vea'), 'definir_vendedor_venda: comissão vai para a vendedora');
  SELECT count(*) INTO n FROM public.comissoes_vendedores WHERE venda_id = v1;
  PERFORM pg_temp.ok(n = 1, 'uma linha de comissão por venda após reatribuir');
  -- voltar ao operador grava NULL
  j := public.definir_vendedor_venda(v1, pg_temp.c('opa'));
  PERFORM pg_temp.ok((SELECT vendedor_id FROM public.vendas WHERE id = v1) IS NULL, 'vendedor = operador grava NULL');
  PERFORM public.definir_vendedor_venda(v1, pg_temp.c('vea'));

  -- 3. vendedor de outra empresa recusado; operador de outra empresa sem permissão
  BEGIN PERFORM public.definir_vendedor_venda(v1, pg_temp.c('opb')); RAISE EXCEPTION 'FALHOU 3a';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'VENDEDOR_FORA_DA_LOJA', 'vendedor de outra empresa recusado'); END;
  PERFORM pg_temp.como('geb');
  BEGIN PERFORM public.definir_vendedor_venda(v1, pg_temp.c('opa')); RAISE EXCEPTION 'FALHOU 3b';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'SEM_PERMISSAO', 'gerente de outra empresa não reatribui'); END;

  -- 4. base líquida: desconto de 10,00 na venda (100 + 33,33 + 2x33,33 = 199,99)
  PERFORM pg_temp.vender(v2,'ca','opa','la','[{"p":"pa","q":1,"pu":100},{"p":"pa2","q":1,"pu":33.33},{"p":"pa2","q":2,"pu":33.33}]', 5);
  SELECT * INTO cv FROM public.comissoes_vendedores WHERE venda_id = v2;
  SELECT sum(desconto_rateado) INTO s FROM public.comissoes_itens WHERE venda_id = v2;
  PERFORM pg_temp.ok(s = 10.00 AND cv.base_calculo = 189.99, 'desconto de 5% (10,00) rateado nos itens; base 189,99');
  PERFORM pg_temp.ok(cv.valor_comissao = (SELECT sum(round(base_elegivel * 0.05, 2)) FROM public.comissoes_itens WHERE venda_id = v2)
    AND cv.valor_comissao = 9.50, 'comissão sobre base líquida = 9,50 (não 10,00)');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.comissoes_itens ci WHERE ci.venda_id = v2
    AND abs(ci.desconto_rateado - 10 * round(ci.quantidade*ci.preco_unitario,2) / 199.99) >= 0.01), 'rateio proporcional (erro < 1 centavo)');

  -- 4b. empresa configurada BRUTA => sem rateio
  INSERT INTO public.comissoes_config (empresa_id, base) VALUES (pg_temp.c('ea'), 'BRUTA');
  PERFORM pg_temp.vender(v3,'ca','opa','la','[{"p":"pa","q":1,"pu":100}]', 10);
  PERFORM pg_temp.ok((SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id = v3) = 5.00, 'comissao_base=BRUTA mantém base cheia');
  DELETE FROM public.comissoes_config;

  -- 5. cabeçalho honesto: itens com 5% e 10%
  UPDATE public.produtos SET comissao_tipo = 'percentual', comissao_valor = 10 WHERE id = pg_temp.c('pa2');
  PERFORM pg_temp.vender(v4,'ca','opa','la','[{"p":"pa","q":1,"pu":100},{"p":"pa2","q":3,"pu":33.33}]');
  SELECT * INTO cv FROM public.comissoes_vendedores WHERE venda_id = v4;
  PERFORM pg_temp.ok(cv.regra_mista AND cv.regra_id IS NULL AND cv.valor_comissao = 15.00 AND cv.percentual_aplicado = round(15.00/199.99*100, 4),
    'regras diferentes: regra_mista, regra NULL, taxa efetiva 7,5004%');
  UPDATE public.produtos SET comissao_tipo = NULL, comissao_valor = NULL WHERE id = pg_temp.c('pa2');

  -- 6. falha registrada (config corrompida) sem derrubar a venda; reprocessar pelo gerente resolve
  UPDATE public.configuracoes_gerais SET valor = 'abc' WHERE chave = 'comissao_padrao_percentual' AND empresa_id = pg_temp.c('ea');
  PERFORM pg_temp.ok(pg_temp.vender(v5,'ca','opa','la','[{"p":"pa","q":1,"pu":100}]') = 'CONCLUIDA', 'venda conclui mesmo com apuração falhando');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores WHERE venda_id = v5)
    AND EXISTS (SELECT 1 FROM public.comissoes_falhas WHERE venda_id = v5 AND etapa = 'APURACAO' AND resolvida_em IS NULL AND sqlstate = '22P02'),
    'falha gravada em comissoes_falhas (22P02)');
  UPDATE public.configuracoes_gerais SET valor = '5' WHERE chave = 'comissao_padrao_percentual' AND empresa_id = pg_temp.c('ea');
END $t$;

-- RLS e permissões como authenticated
SET LOCAL ROLE authenticated;
SELECT pg_temp.como('geb');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_falhas) = 0, 'gerente B não vê falhas da empresa A');
SELECT pg_temp.ok((SELECT count(*) FROM public.listar_vendedores_loja(pg_temp.c('la'))) = 0, 'gerente B não lista vendedores da loja A');
SELECT pg_temp.como('opa');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_falhas) = 0, 'operador não vê falhas');
SELECT pg_temp.ok((SELECT count(*) FROM public.listar_vendedores_loja(pg_temp.c('la'))) = 5, 'operador A lista os 5 usuários da loja A');
DO $$ BEGIN
  PERFORM public.reprocessar_comissao_venda((SELECT venda_id FROM public.comissoes_falhas LIMIT 1));
  RAISE EXCEPTION 'FALHOU: operador reprocessou';
EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM IN ('SEM_PERMISSAO'), 'operador não reprocessa'); END $$;
DO $$ BEGIN PERFORM public.definir_vendedor_venda_pdv(gen_random_uuid(), NULL); RAISE EXCEPTION 'FALHOU pdv';
EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(true, 'definir_vendedor_venda_pdv negado a authenticated'); END $$;
SELECT pg_temp.como('gea');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_falhas WHERE resolvida_em IS NULL) = 1, 'gerente A vê a falha');
SELECT pg_temp.ok((public.reprocessar_comissao_venda((SELECT venda_id FROM public.comissoes_falhas LIMIT 1))->>'ok')::boolean, 'gerente reprocessa');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_falhas WHERE resolvida_em IS NULL) = 0, 'falha marcada como resolvida');
RESET ROLE;

-- Desktop: registrar_venda_com_itens (service_role, sem vendedor = PDV antigo) + definir_vendedor_venda_pdv (edge nova)
DO $d$
DECLARE v uuid := gen_random_uuid(); it jsonb; j jsonb;
BEGIN
  it := jsonb_build_array(jsonb_build_object('item_id',gen_random_uuid(),'produto_id',pg_temp.c('pa'),'nome','x','quantidade',1,'preco_original',100,'preco_unitario',100));
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM public.registrar_venda_com_itens(v, pg_temp.c('ca'), pg_temp.c('opa'), 'PIX', 100, 0, 100, it, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ok((SELECT operador_id FROM public.comissoes_vendedores WHERE venda_id = v) = pg_temp.c('opa'), 'desktop antigo (sem vendedor_id): comissão do operador');
  j := public.definir_vendedor_venda_pdv(v, pg_temp.c('veb2'));
  PERFORM pg_temp.ok((SELECT operador_id FROM public.comissoes_vendedores WHERE venda_id = v) = pg_temp.c('veb2'), 'desktop novo: vendedor_id aplicado');
  j := public.definir_vendedor_venda_pdv(v, pg_temp.c('opb'));
  PERFORM pg_temp.ok(NOT (j->>'ok')::boolean AND EXISTS (SELECT 1 FROM public.comissoes_falhas WHERE venda_id = v AND etapa = 'REATRIBUICAO'),
    'desktop com vendedor inválido: não quebra o sync, registra falha');
  EXECUTE 'RESET ROLE';
END $d$;

-- Ajuste por cancelamento continua funcionando e bloqueia reatribuição
DO $c$
DECLARE v uuid := gen_random_uuid();
BEGIN
  PERFORM pg_temp.vender(v,'ca','opa','la','[{"p":"pa","q":1,"pu":100}]');
  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = v;
  PERFORM pg_temp.ok((SELECT sum(valor) FROM public.comissoes_ajustes WHERE venda_id = v) = 5.00, 'cancelamento gera ajuste de 5,00 (gatilho existente)');
  PERFORM pg_temp.ok(internal.comissao_bloqueio_reatribuicao(v) = 'COMISSAO_COM_AJUSTE', 'venda com ajuste não pode trocar vendedor');
END $c$;

SELECT 'COMISSAO P0 (SQL): OK' AS resultado;
ROLLBACK;
