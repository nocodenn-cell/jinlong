-- Simulação de papel e JWT (sem senha). Cada bloco termina em ROLLBACK.
-- Usuários de teste da homologação (IDs): 1=DONO e1; 2,3=GERENTE a1 (e1); 4=OPERADOR a1 (e1); 5=GERENTE c1 (e2)
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
\echo == anon (sem JWT)
BEGIN; SET LOCAL ROLE anon;
select 'anon vendas', count(*) from public.vendas;
select 'anon estoque', count(*) from public.estoque;
select 'anon caixas', count(*) from public.caixas;
select 'anon usuarios', count(*) from public.usuarios;
select 'anon lojas', count(*) from public.lojas;
select 'anon produtos', count(*) from public.produtos;
select 'anon importacoes_nfe', count(*) from public.importacoes_nfe;
ROLLBACK;
\echo == OPERADOR a1 (user 4)
BEGIN; SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000004","role":"authenticated"}', true), set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000004', true);
select 'op auth.uid', auth.uid();
select 'op estoque (esperado so a1=1)', count(*), string_agg(distinct loja_id::text, ',') from public.estoque;
select 'op estoque matriz (esperado 0)', count(*) from public.estoque where loja_id='e0000001-0000-4000-8000-000000000001';
select 'op estoque e2 (esperado 0)', count(*) from public.estoque where loja_id='f5100000-0000-4000-8000-0000000000c1';
select 'op lojas visiveis', count(*), string_agg(distinct empresa_id::text, ',') from public.lojas;
select 'op usuarios visiveis', count(*) from public.usuarios;
select 'op caixas visiveis', count(*) from public.caixas;
select 'op importacoes_nfe (esperado 0)', count(*) from public.importacoes_nfe;
select 'op contas_pagar (esperado 0)', count(*) from public.contas_pagar;
ROLLBACK;
\echo == GERENTE c1 empresa e2 (user 5)
BEGIN; SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000005","role":"authenticated"}', true), set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000005', true);
select 'g5 estoque e1 (esperado 0)', count(*) from public.estoque where loja_id in ('f5100000-0000-4000-8000-0000000000a1','f5100000-0000-4000-8000-0000000000b1','f5100000-0000-4000-8000-0000000000e5');
select 'g5 estoque matriz (esperado 0)', count(*) from public.estoque where loja_id='e0000001-0000-4000-8000-000000000001';
select 'g5 usuarios e1 (esperado 0)', count(*) from public.usuarios where loja_id in ('f5100000-0000-4000-8000-0000000000a1','f5100000-0000-4000-8000-0000000000b1');
select 'g5 lojas visiveis', count(*), string_agg(distinct empresa_id::text, ',') from public.lojas;
ROLLBACK;
\echo == DONO e1 (user 1)
BEGIN; SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000001","role":"authenticated"}', true), set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000001', true);
select 'dono estoque e1 (esperado 9)', count(*) from public.estoque;
select 'dono estoque matriz (esperado 0)', count(*) from public.estoque where loja_id='e0000001-0000-4000-8000-000000000001';
select 'dono lojas visiveis', count(*), string_agg(distinct empresa_id::text, ',') from public.lojas;
ROLLBACK;
