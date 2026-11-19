\set QUIET 1
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
\echo == anon v_vendas_dia (esperado: sem privilegio)
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT a; select 'anon v_vendas_dia', count(*) from public.v_vendas_dia; ROLLBACK TO a;
SAVEPOINT b; select 'anon vendas', count(*) from public.vendas; ROLLBACK TO b;
ROLLBACK;
\echo == OPERADOR a1 (user 4)
BEGIN; SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000004","role":"authenticated"}', true), set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000004', true);
SAVEPOINT a; select 'op estoque (esperado 1 a1)', count(*), string_agg(distinct loja_id::text, ',') from public.estoque; ROLLBACK TO a;
SAVEPOINT b; select 'op v_vendas_dia (esperado 0 linhas de outra empresa)', count(*), coalesce(sum(num_vendas),0) from public.v_vendas_dia; ROLLBACK TO b;
SAVEPOINT c; select 'op v_top_produtos (esperado 0)', count(*) from public.v_top_produtos; ROLLBACK TO c;
SAVEPOINT d; select 'op v_venda_consistencia (esperado 0)', count(*) from public.v_venda_consistencia_anomalias; ROLLBACK TO d;
SAVEPOINT e; select 'op texto_sem_acento (esperado acao)', public.texto_sem_acento('ação'); ROLLBACK TO e;
SAVEPOINT f; select 'op trigger direto (esperado erro de trigger; permissao negada seria regressao)', public.trg_caixas_fechado_imutavel(); ROLLBACK TO f;
ROLLBACK;
\echo == DONO e1 (user 1)
BEGIN; SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000001","role":"authenticated"}', true), set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000001', true);
SAVEPOINT a; select 'dono estoque (esperado 6)', count(*) from public.estoque; ROLLBACK TO a;
SAVEPOINT b; select 'dono v_vendas_dia (esperado so e1)', count(*), coalesce(sum(num_vendas),0) from public.v_vendas_dia; ROLLBACK TO b;
SAVEPOINT c; select 'dono lojas', count(*), string_agg(distinct empresa_id::text, ',') from public.lojas; ROLLBACK TO c;
ROLLBACK;
\echo == GERENTE e2 (user 5)
BEGIN; SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000005","role":"authenticated"}', true), set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000005', true);
SAVEPOINT a; select 'g5 v_vendas_dia (esperado 0 da e1)', count(*), coalesce(sum(num_vendas),0) from public.v_vendas_dia; ROLLBACK TO a;
SAVEPOINT b; select 'g5 estoque e1 (esperado 0)', count(*) from public.estoque where loja_id in ('f5100000-0000-4000-8000-0000000000a1','f5100000-0000-4000-8000-0000000000b1'); ROLLBACK TO b;
ROLLBACK;
