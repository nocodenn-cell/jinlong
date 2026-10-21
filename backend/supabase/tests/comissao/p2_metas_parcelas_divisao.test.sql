-- P2 do módulo Comissão: liberação por parcela, divisão entre 2 vendedores, metas com faixas, autoatendimento,
-- exportação contábil (somente leitura), RLS 2 empresas. Dados fictícios, ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
\ir _fixture.sql

DO $t$
DECLARE ea uuid := pg_temp.c('ea'); la uuid := pg_temp.c('la'); comp date := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid(); v3 uuid := gen_random_uuid(); v4 uuid := gen_random_uuid();
  arr numeric[]; j jsonb; n int; s numeric; r record;
BEGIN
  -- 1. Liberação por recebimento (crédito 3x)
  PERFORM pg_temp.como('gea');
  j := public.comissao_salvar_config(la, NULL, 'RECEBIMENTO');
  PERFORM pg_temp.ok(j->>'liberacao' = 'RECEBIMENTO' AND j->>'base' = 'LIQUIDA', 'config: liberação por recebimento');
  PERFORM pg_temp.vender(v1,'ca','opa','la','[{"p":"pa","q":3,"pu":100}]', NULL,
    '[{"forma_pagamento":"DINHEIRO","valor":100},{"forma_pagamento":"CARTAO_CREDITO","valor":200}]');
  UPDATE public.vendas_pagamentos SET parcelas = 3 WHERE venda_id = v1 AND forma_pagamento = 'CARTAO_CREDITO';
  SELECT array_agg(o_valor ORDER BY o_mes, o_valor DESC) INTO arr FROM internal.comissao_liberacoes((SELECT id FROM public.comissoes_vendedores WHERE venda_id = v1));
  PERFORM pg_temp.ok(array_length(arr, 1) = 4 AND arr[1] = 5.00 AND (SELECT sum(x) FROM unnest(arr) x) = 15.00,
    'cronograma: 5,00 à vista + 3 parcelas somando 10,00 (centavos exatos)');
  PERFORM pg_temp.como('gea');
  PERFORM pg_temp.ok((SELECT comissao FROM public.comissao_relatorio_vendedores(la, comp) WHERE operador_id = pg_temp.c('opa')) = 5.00,
    'mês da venda: só a parte à vista (5,00)');
  SELECT sum(comissao) INTO s FROM generate_series(1, 3) k, public.comissao_relatorio_vendedores(la, (comp + make_interval(months => k))::date)
   WHERE operador_id = pg_temp.c('opa');
  PERFORM pg_temp.ok(s = 10.00, 'parcelas liberadas nos meses seguintes somam 10,00');
  PERFORM public.comissao_salvar_config(la, NULL, 'VENDA');
  PERFORM pg_temp.ok((SELECT comissao FROM public.comissao_relatorio_vendedores(la, comp) WHERE operador_id = pg_temp.c('opa')) = 15.00,
    'modo VENDA: comissão inteira no mês');

  -- 2. Divisão 70/30
  PERFORM pg_temp.vender(v2,'ca','opa','la','[{"p":"pa","q":2,"pu":100}]');
  PERFORM pg_temp.como('gea');
  BEGIN PERFORM public.definir_divisao_comissao(v2, pg_temp.c('opb'), 30); RAISE EXCEPTION 'FALHOU div';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'VENDEDOR_FORA_DA_LOJA', 'divisão com vendedor de outra empresa recusada'); END;
  BEGIN PERFORM public.definir_divisao_comissao(v2, pg_temp.c('opa'), 30); RAISE EXCEPTION 'FALHOU div2';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'DIVISAO_MESMO_VENDEDOR', 'divisão consigo mesmo recusada'); END;
  PERFORM public.definir_divisao_comissao(v2, pg_temp.c('vea'), 30);
  SELECT * INTO r FROM public.comissao_relatorio_vendedores(la, comp) WHERE operador_id = pg_temp.c('vea');
  PERFORM pg_temp.ok(r.comissao = 3.00 AND r.base = 60.00 AND r.vendas = 1, 'vendedora secundária: 30% de 10,00 = 3,00');
  PERFORM pg_temp.ok((SELECT comissao FROM public.comissao_relatorio_vendedores(la, comp) WHERE operador_id = pg_temp.c('opa')) = 15.00 + 7.00,
    'principal fica com o restante (7,00)');
  -- venda com valor ímpar: soma das partes = comissão
  PERFORM pg_temp.vender(v3,'ca','opa','la','[{"p":"pa2","q":1,"pu":33.33}]');
  PERFORM pg_temp.como('gea');
  PERFORM public.definir_divisao_comissao(v3, pg_temp.c('veb2'), 50);
  PERFORM pg_temp.ok((SELECT sum(comissao) FROM public.comissao_relatorio_vendedores(la, comp)) =
    (SELECT sum(valor_comissao) FROM public.comissoes_vendedores WHERE loja_id = la), 'divisão não cria nem perde centavos');

  -- 3. Meta: vendedora com base >= 50 ganha 1% da base; >= 1000 ganha 2%
  INSERT INTO public.comissoes_metas (empresa_id, usuario_id, competencia_inicio, faixas)
  VALUES (ea, pg_temp.c('vea'), comp, '[{"a_partir_de":50,"bonus_pct":1},{"a_partir_de":1000,"bonus_pct":2}]');
  INSERT INTO public.comissoes_metas (empresa_id, competencia_inicio, faixas) VALUES (ea, comp, '[{"a_partir_de":100000,"bonus_pct":5}]');
  SELECT * INTO r FROM public.comissao_relatorio_vendedores(la, comp) WHERE operador_id = pg_temp.c('vea');
  PERFORM pg_temp.ok(r.bonus_meta = 0.60 AND r.total = 3.60, 'meta individual: faixa 1% sobre 60,00 = 0,60');
  PERFORM pg_temp.ok((SELECT bonus_meta FROM public.comissao_relatorio_vendedores(la, comp) WHERE operador_id = pg_temp.c('opa')) = 0,
    'meta geral não atingida: sem bônus');
  BEGIN INSERT INTO public.comissoes_metas (empresa_id, competencia_inicio, faixas) VALUES (ea, comp, '[{"a_partir_de":10,"bonus_pct":1},{"a_partir_de":5,"bonus_pct":2}]');
    RAISE EXCEPTION 'FALHOU meta';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'META_FAIXAS_INVALIDAS', 'faixas fora de ordem recusadas'); END;

  -- 4. Exportação só após aprovação; bate com a foto
  BEGIN PERFORM public.comissao_export_contabil(la, comp); RAISE EXCEPTION 'FALHOU exp';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'COMISSAO_PERIODO_NAO_APROVADO', 'export exige período aprovado'); END;
  PERFORM public.comissao_periodo_transicionar(la, comp, 'EM_REVISAO');
  j := public.comissao_periodo_transicionar(la, comp, 'APROVADO');
  PERFORM pg_temp.ok((SELECT sum(total) FROM public.comissao_export_contabil(la, comp)) = (j->>'total')::numeric
    AND (SELECT sum(bonus_meta) FROM public.comissao_export_contabil(la, comp)) = 0.60, 'export = foto aprovada (com bônus)');
  BEGIN PERFORM public.definir_divisao_comissao(v2, NULL); RAISE EXCEPTION 'FALHOU trava';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'COMISSAO_PERIODO_TRAVADO', 'divisão travada após aprovação'); END;
  -- estorno de venda dividida no mês seguinte divide o ajuste
  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = v2;
  PERFORM pg_temp.como('gea');
  PERFORM pg_temp.ok((SELECT ajustes FROM public.comissao_relatorio_vendedores(la, (comp + interval '1 month')::date) WHERE operador_id = pg_temp.c('vea')) = -3.00,
    'estorno dividido: secundária devolve 3,00 no mês seguinte');
END $t$;

SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname IN ('comissao_export_contabil','minhas_comissoes','definir_divisao_comissao','comissao_salvar_config')
  AND (p.prosrc ILIKE '%contas_pagar%' OR p.prosrc ILIKE '%movimentacoes_caixa%' OR p.prosrc ~* 'insert into public\.(folha|lancament)')), 'P2 não lança em caixa/contas a pagar/folha');

-- Autoatendimento e RLS
SET LOCAL ROLE authenticated;
SELECT pg_temp.como('vea');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_vendedores) = (SELECT count(*) FROM public.comissoes_vendedores WHERE operador_id = pg_temp.c('vea')),
  'vendedora só enxerga as próprias comissões');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_metas) = 1, 'vendedora vê só a própria meta');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.minhas_comissoes(3) WHERE total = 3.60) , 'minhas_comissoes: mês aprovado com 3,60');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.comissoes_periodos), 'vendedora não vê a tabela de períodos');
DO $r$ BEGIN
  BEGIN PERFORM public.comissao_export_contabil(pg_temp.c('la'), current_date); RAISE EXCEPTION 'FALHOU x';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'SEM_PERMISSAO', 'vendedora não exporta'); END;
  BEGIN PERFORM public.comissao_salvar_config(pg_temp.c('la'), 'BRUTA', NULL); RAISE EXCEPTION 'FALHOU y';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'SEM_PERMISSAO', 'vendedora não altera configuração'); END;
END $r$;
SELECT pg_temp.como('geb');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_metas) = 0 AND (SELECT count(*) FROM public.comissoes_divisoes) = 0
  AND NOT EXISTS (SELECT 1 FROM public.minhas_comissoes(3)), 'gerente B não vê metas/divisões de A');
DO $r$ BEGIN
  BEGIN PERFORM public.comissao_export_contabil(pg_temp.c('la'), current_date); RAISE EXCEPTION 'FALHOU z';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'SEM_PERMISSAO', 'gerente B não exporta A'); END;
END $r$;
ROLLBACK;
