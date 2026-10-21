-- Base de módulos (20261021130000) sobre o multiempresa do main. BEGIN … ROLLBACK, dados fictícios.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p boolean, n text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p IS DISTINCT FROM true THEN RAISE EXCEPTION 'BASE FAIL: %', n; END IF; RAISE NOTICE 'BASE OK: %', n; END $$;
INSERT INTO public.empresas (nome) VALUES ('BM A') RETURNING id AS ea \gset
INSERT INTO public.empresas (nome) VALUES ('BM B') RETURNING id AS eb \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('BM A1', 'BM-A1', :'ea') RETURNING id AS la \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('BM B1', 'BM-B1', :'eb') RETURNING id AS lb \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bm.dono.a@t') RETURNING id AS da \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bm.admin@t') RETURNING id AS adm \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES (:'da', 'BM Dono A', 'DONO', :'la', true), (:'adm', 'BM Admin legado', 'ADMIN', :'lb', true);

SELECT set_config('request.jwt.claim.sub', :'da', true) \gset
SELECT pg_temp.ok(NOT public.fp_pode_modulo(:'ea', 'IMPORT_INTELLIGENCE', ARRAY['DONO']), 'módulo desabilitado por padrão');
DO $$ BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM 1 FROM public.empresa_modulos;
  RAISE EXCEPTION 'deveria negar';
EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE 'BASE OK: authenticated não lê empresa_modulos';
END $$;
DO $$ BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM public.ops_definir_modulo_empresa(gen_random_uuid(), 'IMPORT_INTELLIGENCE', true, 'x', 'tentativa indevida');
  RAISE EXCEPTION 'deveria negar';
EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE 'BASE OK: authenticated não habilita módulo';
END $$;
SELECT public.ops_definir_modulo_empresa(:'ea', 'IMPORT_INTELLIGENCE', true, 'contrato demo', 'habilitação de teste');
SELECT pg_temp.ok(public.fp_pode_modulo(:'ea', 'IMPORT_INTELLIGENCE', ARRAY['DONO']), 'DONO A acessa após habilitar');
SELECT pg_temp.ok(NOT public.fp_pode_modulo(:'eb', 'IMPORT_INTELLIGENCE', ARRAY['DONO']), 'DONO A não acessa empresa B');
SELECT pg_temp.ok(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE', ARRAY['DONO']) = :'ea', 'contexto derivado do usuário');
SELECT pg_temp.ok(NOT (:'lb'::uuid = ANY (public.fp_lojas_cerca())), 'cerca não inclui loja de B');
SELECT set_config('request.jwt.claim.sub', :'adm', true) \gset
SELECT pg_temp.ok(NOT public.fp_pode_modulo(:'ea', 'IMPORT_INTELLIGENCE', ARRAY['DONO','GERENTE']), 'ADMIN legado sem vínculo NÃO herda o módulo');
SELECT pg_temp.ok(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE', ARRAY['DONO']) IS NULL, 'ADMIN legado sem contexto de módulo');
SELECT pg_temp.ok((SELECT count(*) FROM public.empresa_modulos_historico WHERE empresa_id = :'ea' AND acao = 'HABILITAR' AND motivo = 'habilitação de teste') = 1, 'histórico de habilitação gravado');
DO $$ BEGIN
  UPDATE public.empresa_modulos_historico SET motivo = 'x';
  RAISE EXCEPTION 'deveria negar';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'HISTORICO_IMUTAVEL%' THEN RAISE; END IF; RAISE NOTICE 'BASE OK: histórico append-only';
END $$;
UPDATE public.empresas SET status = 'SUSPENSA' WHERE id = :'ea';
SELECT set_config('request.jwt.claim.sub', :'da', true) \gset
SELECT pg_temp.ok(NOT public.fp_pode_modulo(:'ea', 'IMPORT_INTELLIGENCE', ARRAY['DONO']), 'empresa suspensa: módulo inativo');
ROLLBACK;
