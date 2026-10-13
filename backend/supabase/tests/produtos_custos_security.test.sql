-- Local disposable stack + seed only. supabase test db --workdir backend
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

INSERT INTO public.lojas (id, nome, codigo)
VALUES ('b0000001-0000-4000-8000-000000000001', 'Cost security B', 'COSTSEC_B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.produtos (id, loja_id, nome, preco_varejo, preco_custo, preco_custo_medio, origem)
VALUES
 ('f0000001-0000-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', 'Cost security A', 20, 7, 6, 'brasil_sem_nf'),
 ('f0000001-0000-4000-8000-000000000002', 'b0000001-0000-4000-8000-000000000001', 'Cost security B', 30, 9, 8, 'brasil_sem_nf');

SELECT ok((SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid = 'public.produtos_custos'::regclass), 'public view is invoker');
SELECT ok(NOT has_table_privilege('anon', 'public.produtos_custos', 'SELECT'), 'anon has no view grant');
SELECT ok(NOT has_column_privilege('authenticated', 'public.produtos', 'preco_custo', 'SELECT'), 'direct cost grant stays revoked');
SELECT ok(NOT has_column_privilege('authenticated', 'public.produtos', 'preco_custo_medio', 'SELECT'), 'direct average cost grant stays revoked');
SELECT ok(NOT has_function_privilege('anon', 'jinlong_security.produtos_custos_autorizados()', 'EXECUTE'), 'anon cannot invoke private boundary');

-- Reuse a seed identity, changing its application profile only inside this rollback.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.produtos_custos WHERE produto_id IN ('f0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000002')), 1::bigint, 'GERENTE sees own store only');
SELECT is((SELECT count(*) FROM public.produtos_custos WHERE produto_id = 'f0000001-0000-4000-8000-000000000002'), 0::bigint, 'GERENTE cannot see other store');
SELECT is((SELECT preco_custo FROM public.produtos_custos WHERE produto_id = 'f0000001-0000-4000-8000-000000000001'), 7::numeric, 'authorized cost value preserved');
SELECT is((SELECT preco_custo_medio FROM public.produtos_custos WHERE produto_id = 'f0000001-0000-4000-8000-000000000001'), 6::numeric, 'average cost value preserved');
SELECT throws_ok('SELECT preco_custo FROM public.produtos', '42501', NULL, 'direct sensitive column denied');
SELECT throws_ok('SELECT id FROM public.produtos WHERE preco_custo > 0', '42501', NULL, 'cost inference through filter denied');
SELECT lives_ok('SELECT id, nome, preco_varejo FROM public.produtos', 'catalog non-sensitive projection still works');
RESET ROLE;

UPDATE public.usuarios SET perfil = 'DONO' WHERE id = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.produtos_custos WHERE produto_id IN ('f0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000002')), 1::bigint, 'DONO preserves existing own-store scope');
RESET ROLE;
UPDATE public.usuarios SET perfil = 'ADMIN' WHERE id = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.produtos_custos WHERE produto_id IN ('f0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000002')), 2::bigint, 'ADMIN preserves global scope');
SELECT throws_ok('SELECT preco_custo_medio FROM public.produtos', '42501', NULL, 'ADMIN also uses authorized boundary for costs');
RESET ROLE;
UPDATE public.usuarios SET ativo = false WHERE id = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.produtos_custos), 0::bigint, 'inactive ADMIN with valid uid denied');
RESET ROLE;
UPDATE public.usuarios SET perfil = 'OPERADOR', ativo = true WHERE id = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.produtos_custos), 0::bigint, 'OPERADOR cannot see costs');
SELECT is((SELECT count(*) FROM jinlong_security.produtos_custos_autorizados()), 0::bigint, 'private SQL invocation cannot bypass application authorization');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*) FROM public.produtos_custos), 0::bigint, 'authenticated role without uid cannot see costs');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.produtos_custos', '42501', NULL, 'anonymous query denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
