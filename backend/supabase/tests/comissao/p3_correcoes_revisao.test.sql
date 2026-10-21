-- Regressões das correções da revisão do PR #607 (migration 20261021231000). Dados fictícios, ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
\ir _fixture.sql

DO $t$
DECLARE ea uuid := pg_temp.c('ea'); la uuid := pg_temp.c('la'); comp date := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid(); v3 uuid := gen_random_uuid(); j jsonb; n int; adm uuid := 'c2000000-0000-4000-8000-0000000000ad';
BEGIN
  -- 1a. Reprocessar AJUSTE: estorno que falhou é refeito de verdade
  PERFORM pg_temp.vender(v1,'ca','opa','la','[{"p":"pa","q":2,"pu":100}]');
  PERFORM set_config('session_replication_role', 'replica', true);   -- simula o estorno não ter rodado
  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = v1;
  PERFORM set_config('session_replication_role', 'origin', true);
  UPDATE public.configuracoes_gerais SET valor = 'abc' WHERE chave = 'comissao_padrao_percentual' AND empresa_id = ea;
  PERFORM public.processar_ajuste_comissao_venda(v1, 'CANCELAMENTO', NULL);
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.comissoes_falhas WHERE venda_id = v1 AND etapa = 'AJUSTE' AND resolvida_em IS NULL
    AND contexto->>'tipo' = 'CANCELAMENTO') AND NOT EXISTS (SELECT 1 FROM public.comissoes_ajustes WHERE venda_id = v1),
    'falha de AJUSTE gravada com contexto (tipo)');
  UPDATE public.configuracoes_gerais SET valor = '5' WHERE chave = 'comissao_padrao_percentual' AND empresa_id = ea;
  PERFORM pg_temp.como('gea');
  j := public.reprocessar_comissao_venda(v1);
  PERFORM pg_temp.ok((j->>'ok')::boolean AND (SELECT sum(valor) FROM public.comissoes_ajustes WHERE venda_id = v1) = 10.00
    AND NOT EXISTS (SELECT 1 FROM public.comissoes_falhas WHERE venda_id = v1 AND resolvida_em IS NULL),
    'reprocessar AJUSTE grava o estorno de 10,00 e resolve a falha');

  -- 1b. Reprocessar REATRIBUICAO: reaplica o vendedor pedido
  PERFORM pg_temp.vender(v2,'ca','opa','la','[{"p":"pa","q":1,"pu":100}]');
  j := public.definir_vendedor_venda_pdv(v2, pg_temp.c('opb'));   -- vendedor de outra empresa: falha com contexto
  PERFORM pg_temp.ok(NOT (j->>'ok')::boolean AND EXISTS (SELECT 1 FROM public.comissoes_falhas WHERE venda_id = v2 AND etapa = 'REATRIBUICAO'
    AND contexto->>'vendedor_id' = pg_temp.c('opb')::text), 'falha de REATRIBUICAO grava vendedor pedido');
  PERFORM pg_temp.como('gea');
  j := public.reprocessar_comissao_venda(v2);
  PERFORM pg_temp.ok(NOT (j->>'ok')::boolean AND j->>'falha' LIKE 'REATRIBUICAO:%', 'reprocessar não finge sucesso se a reatribuição continua inválida');
  UPDATE public.comissoes_falhas SET contexto = jsonb_build_object('vendedor_id', pg_temp.c('vea')) WHERE venda_id = v2 AND resolvida_em IS NULL;
  j := public.reprocessar_comissao_venda(v2);
  PERFORM pg_temp.ok((j->>'ok')::boolean AND (SELECT operador_id FROM public.comissoes_vendedores WHERE venda_id = v2) = pg_temp.c('vea')
    AND (SELECT vendedor_id FROM public.vendas WHERE id = v2) = pg_temp.c('vea'), 'reprocessar REATRIBUICAO aplica a vendedora e resolve');

  -- 2. Divisão bloqueada em comissão paga
  PERFORM pg_temp.vender(v3,'ca','opa','la','[{"p":"pa","q":1,"pu":100}]');
  UPDATE public.comissoes_vendedores SET status = 'pago', pago_em = now() WHERE venda_id = v3;
  PERFORM pg_temp.como('gea');
  BEGIN PERFORM public.definir_divisao_comissao(v3, pg_temp.c('vea'), 30); RAISE EXCEPTION 'FALHOU pago';
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.ok(SQLERRM = 'COMISSAO_JA_PAGA', 'divisão recusada em comissão paga'); END;

  -- 3. Serialização: venda pega lock compartilhado; transição pega exclusivo (mesma chave por loja)
  PERFORM internal.comissao_competencia_aberta(la, now());
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND mode = 'ShareLock'),
    'competência: advisory lock compartilhado');
  PERFORM public.comissao_periodo_transicionar(la, comp, 'EM_REVISAO');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND mode = 'ExclusiveLock'),
    'transição: advisory lock exclusivo');

  -- 4. ADMIN legado (sem vínculo) gerencia regras/config/metas
  INSERT INTO auth.users (id) VALUES (adm) ON CONFLICT DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES (adm, 'Admin Legado', 'ADMIN', true, la);
  INSERT INTO _ctx VALUES ('adm', adm);
END $t$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.como('adm');
INSERT INTO public.comissoes_regras (empresa_id, tipo_calculo, valor) VALUES (pg_temp.c('ea'), 'percentual', 2);
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_regras WHERE empresa_id = pg_temp.c('ea')) = 1, 'ADMIN legado cria e vê regra');
SELECT pg_temp.ok((public.comissao_salvar_config(pg_temp.c('la'), NULL, 'VENDA'))->>'liberacao' = 'VENDA', 'ADMIN legado salva configuração');
INSERT INTO public.comissoes_metas (empresa_id, competencia_inicio, faixas) VALUES (pg_temp.c('ea'), date_trunc('month', now())::date, '[{"a_partir_de":1,"bonus_pct":1}]');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_metas) = 1, 'ADMIN legado cria meta');
SELECT pg_temp.como('opa');
SELECT pg_temp.ok((SELECT count(*) FROM public.comissoes_regras) = 0, 'operador continua sem ver regras');
-- 5. Cargo vazio nunca vira regra geral (constraint do banco)
RESET ROLE;
DO $c$ BEGIN
  BEGIN INSERT INTO public.comissoes_regras (empresa_id, cargo, tipo_calculo, valor) VALUES (pg_temp.c('ea'), '', 'percentual', 1); RAISE EXCEPTION 'FALHOU cargo';
  EXCEPTION WHEN check_violation THEN PERFORM pg_temp.ok(true, 'cargo vazio recusado pelo banco'); END;
END $c$;
ROLLBACK;
