-- P1 do módulo Comissão: regras (funcionário/cargo/produto/categoria/canal, % ou fixo, vigência), prévia,
-- fechamento mensal com trava e transporte de devoluções, relatório, RLS 2 empresas. Dados fictícios, ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
\ir _fixture.sql
-- Simula a tabela do PR #606 se ela ainda não existir nesta base.
DO $s$ BEGIN
  IF to_regclass('public.funcionario_dados') IS NULL THEN
    CREATE TABLE public.funcionario_dados (usuario_id uuid PRIMARY KEY, cargo text);
  END IF;
  INSERT INTO public.funcionario_dados (usuario_id, cargo) VALUES ('c2000000-0000-4000-8000-000000000004', 'Vendedor Externo')
    ON CONFLICT (usuario_id) DO UPDATE SET cargo = excluded.cargo;
END $s$;

DO $t$
DECLARE ea uuid := pg_temp.c('ea'); la uuid := pg_temp.c('la'); r record; v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid();
  v3 uuid := gen_random_uuid(); v4 uuid := gen_random_uuid(); cv record; j jsonb; comp date := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
  rg_cargo uuid; n int;
BEGIN
  PERFORM pg_temp.ok(internal.comissao_regra_nivel(gen_random_uuid(), NULL, gen_random_uuid(), NULL) = 1
    AND internal.comissao_regra_nivel(NULL, 'x', NULL, NULL) = 6 AND internal.comissao_regra_nivel(NULL, NULL, NULL, NULL) = 9, 'níveis de especificidade');
  -- Regras: loja geral 3%, categoria cat 4%, cargo "vendedor externo" 6%, cargo+atacado 2%, usuário vea+produto pa fixo 7/un
  INSERT INTO public.comissoes_regras (empresa_id, tipo_calculo, valor) VALUES (ea, 'percentual', 3);
  INSERT INTO public.comissoes_regras (empresa_id, categoria_id, tipo_calculo, valor) VALUES (ea, pg_temp.c('cat'), 'percentual', 4);
  INSERT INTO public.comissoes_regras (empresa_id, cargo, tipo_calculo, valor) VALUES (ea, 'vendedor externo', 'percentual', 6) RETURNING id INTO rg_cargo;
  INSERT INTO public.comissoes_regras (empresa_id, cargo, canal, tipo_calculo, valor) VALUES (ea, 'vendedor externo', 'ATACADO', 'percentual', 2);
  -- regra futura não vale hoje
  INSERT INTO public.comissoes_regras (empresa_id, usuario_id, tipo_calculo, valor, vigencia_inicio) VALUES (ea, pg_temp.c('vea'), 'percentual', 50, current_date + 30);

  PERFORM pg_temp.como('gea');
  SELECT * INTO r FROM public.comissao_simular_regra(la, pg_temp.c('opa'), pg_temp.c('pa'));
  PERFORM pg_temp.ok(r.nivel = 8 AND r.valor = 4, 'prévia: operador sem cargo, produto da cat => categoria 4%');
  SELECT * INTO r FROM public.comissao_simular_regra(la, pg_temp.c('opa'), pg_temp.c('pa2'));
  PERFORM pg_temp.ok(r.nivel = 9 AND r.valor = 3, 'prévia: sem categoria => regra geral da empresa 3%');
  SELECT * INTO r FROM public.comissao_simular_regra(la, pg_temp.c('vea'), pg_temp.c('pa'));
  PERFORM pg_temp.ok(r.regra_id = rg_cargo AND r.cargo = 'vendedor externo', 'prévia: cargo (funcionario_dados, sem caixa/acentos) vence categoria; regra futura ignorada');
  SELECT * INTO r FROM public.comissao_simular_regra(la, pg_temp.c('vea'), pg_temp.c('pa'), 'ATACADO');
  PERFORM pg_temp.ok(r.valor = 2, 'prévia: canal ATACADO específico vence');

  -- Venda real aplica a regra (base líquida do P0)
  PERFORM pg_temp.vender(v1,'ca','opa','la','[{"p":"pa","q":1,"pu":100},{"p":"pa2","q":1,"pu":33.33}]');
  PERFORM pg_temp.ok((SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id = v1) = 5.00,
    'venda: 4% de 100 + 3% de 33,33 = 4,00 + 1,00');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.comissoes_itens WHERE venda_id = v1 AND origem_regra = 'REGRA_EMPRESA' AND regra_empresa_id IS NOT NULL) = 2,
    'snapshot por item guarda a regra da empresa');
  INSERT INTO public.comissoes_regras (empresa_id, usuario_id, produto_id, tipo_calculo, valor) VALUES (ea, pg_temp.c('opa'), pg_temp.c('pa'), 'fixo', 7);
  PERFORM pg_temp.vender(v2,'ca','opa','la','[{"p":"pa","q":2,"pu":100}]');
  PERFORM pg_temp.ok((SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id = v2) = 14.00, 'usuário+produto fixo 7/un x2 = 14,00');
  PERFORM pg_temp.vender(v3,'ca','opa','la','[{"p":"pa","q":5,"pu":90,"tp":"ATACADO"}]');
  PERFORM public.definir_vendedor_venda(v3, pg_temp.c('vea'));
  PERFORM pg_temp.ok((SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id = v3) = 9.00, 'atacado + cargo => 2% de 450');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.comissoes_regras_log WHERE empresa_id = ea) >= 6, 'log de regras');

  -- Integridade multiempresa
  BEGIN INSERT INTO public.comissoes_regras (empresa_id, produto_id, tipo_calculo, valor) VALUES (ea, pg_temp.c('pb'), 'percentual', 1);
    RAISE EXCEPTION 'FALHOU int';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'COMISSAO_REGRA_PRODUTO_OUTRA_EMPRESA', 'produto de outra empresa recusado'); END;
  BEGIN INSERT INTO public.comissoes_regras (empresa_id, tipo_calculo, valor) VALUES (ea, 'percentual', 150); RAISE EXCEPTION 'FALHOU pct';
  EXCEPTION WHEN check_violation THEN PERFORM pg_temp.ok(true, 'percentual > 100 recusado'); END;

  -- Fechamento
  PERFORM pg_temp.como('gea');
  BEGIN PERFORM public.comissao_periodo_transicionar(la, comp, 'APROVADO'); RAISE EXCEPTION 'FALHOU tr';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM LIKE 'COMISSAO_TRANSICAO_INVALIDA%', 'aberto não pula para aprovado'); END;
  j := public.comissao_periodo_transicionar(la, comp, 'EM_REVISAO');
  PERFORM pg_temp.ok(j->>'status' = 'EM_REVISAO' AND (j->>'total')::numeric = 28.00, 'em revisão: total 5+14+9 = 28,00');
  j := public.comissao_periodo_transicionar(la, comp, 'APROVADO');
  PERFORM pg_temp.ok(j->>'status' = 'APROVADO', 'aprovado');
  -- período travado: reatribuir recusa; venda nova cai no mês seguinte; cancelamento vira ajuste no mês seguinte
  BEGIN PERFORM public.definir_vendedor_venda(v2, pg_temp.c('vea')); RAISE EXCEPTION 'FALHOU trava';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'COMISSAO_PERIODO_TRAVADO', 'reatribuição recusada em período aprovado'); END;
  BEGIN UPDATE public.comissoes_vendedores SET valor_comissao = 1 WHERE venda_id = v2; RAISE EXCEPTION 'FALHOU trava2';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'COMISSAO_PERIODO_TRAVADO', 'valor travado'); END;
  PERFORM pg_temp.vender(v4,'ca','opa','la','[{"p":"pa2","q":1,"pu":33.33}]');
  PERFORM pg_temp.ok((SELECT competencia FROM public.comissoes_vendedores WHERE venda_id = v4) = (comp + interval '1 month')::date,
    'venda após aprovação vai para a próxima competência');
  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = v2;
  SELECT count(*) INTO n FROM public.comissoes_ajustes WHERE venda_id = v2 AND competencia = (comp + interval '1 month')::date;
  PERFORM pg_temp.ok(n = 1, 'estorno de venda de período aprovado entra no mês seguinte');
  PERFORM pg_temp.como('gea');
  PERFORM pg_temp.ok((SELECT total FROM public.comissoes_periodos WHERE loja_id = la AND competencia = comp) = 28.00, 'foto aprovada não muda');
  PERFORM pg_temp.ok((SELECT sum(total) FROM public.comissao_relatorio_vendedores(la, comp)) = 28.00, 'relatório do mês aprovado = foto');
  PERFORM pg_temp.ok((SELECT total FROM public.comissao_relatorio_vendedores(la, (comp + interval '1 month')::date) WHERE operador_id = pg_temp.c('opa')) = 1.00 - 14.00,
    'mês seguinte: 1,00 de venda nova − 14,00 de estorno');
  j := public.comissao_periodo_transicionar(la, comp, 'PAGO');
  PERFORM pg_temp.ok(j->>'status' = 'PAGO', 'marcado como pago (sem lançamento financeiro)');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.comissao_relatorio_itens(la, comp, pg_temp.c('opa'))) = 3, 'drill-down: 3 itens do operador no mês');
END $t$;

-- Nada foi lançado em caixa/contas a pagar pelo fechamento
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname IN ('comissao_periodo_transicionar','comissao_periodo_snapshot')
  AND (p.prosrc ILIKE '%contas_pagar%' OR p.prosrc ILIKE '%movimentacoes_caixa%' OR p.prosrc ILIKE '%folha%')), 'fechamento não lança em caixa/contas a pagar/folha');

SET LOCAL ROLE authenticated;
SELECT pg_temp.como('geb');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_regras) = 0 AND (SELECT count(*) FROM public.comissoes_periodos) = 0, 'gerente B não vê regras/períodos de A');
DO $r$ BEGIN
  BEGIN INSERT INTO public.comissoes_regras (empresa_id, tipo_calculo, valor) VALUES (pg_temp.c('ea'), 'percentual', 1); RAISE EXCEPTION 'FALHOU rls';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(true, 'gerente B não cria regra em A'); END;
  BEGIN PERFORM public.comissao_periodo_transicionar(pg_temp.c('la'), current_date, 'EM_REVISAO'); RAISE EXCEPTION 'FALHOU rls2';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'SEM_PERMISSAO', 'gerente B não fecha A'); END;
END $r$;
SELECT pg_temp.como('opa');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_regras) = 0, 'operador não vê regras');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissao_relatorio_vendedores(pg_temp.c('la'), current_date)) = 1
  AND (SELECT operador_id FROM public.comissao_relatorio_vendedores(pg_temp.c('la'), current_date)) = pg_temp.c('opa'), 'vendedor vê só a própria linha');
DO $r$ BEGIN
  BEGIN PERFORM public.comissao_relatorio_itens(pg_temp.c('la'), current_date, pg_temp.c('vea')); RAISE EXCEPTION 'FALHOU rls3';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'SEM_PERMISSAO', 'vendedor não abre itens de outro'); END;
  BEGIN UPDATE public.comissoes_regras SET valor = 99; PERFORM pg_temp.ok(true, 'operador: update sem efeito'); END;
END $r$;
SELECT pg_temp.como('gea');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_regras) >= 5, 'gerente A vê regras de A');
ROLLBACK;
