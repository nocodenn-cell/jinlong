-- Teste de RLS de public.funcionario_dados num Postgres local descartável (stub mínimo do schema Supabase).
-- Uso: backend/scripts/test-funcionario-dados-rls.sh
\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.empresas (id uuid PRIMARY KEY);
CREATE TABLE public.lojas (id uuid PRIMARY KEY, empresa_id uuid REFERENCES public.empresas(id), UNIQUE (id, empresa_id));
CREATE TABLE public.usuarios (id uuid PRIMARY KEY, loja_id uuid, ativo boolean DEFAULT true);
CREATE TABLE public.usuario_vinculos (usuario_id uuid, empresa_id uuid, loja_id uuid, papel text, ativo boolean DEFAULT true);
GRANT USAGE ON SCHEMA public TO authenticated;
INSERT INTO public.empresas VALUES ('e1000000-0000-0000-0000-000000000001'),('e2000000-0000-0000-0000-000000000002');
INSERT INTO public.lojas VALUES ('a1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001'),('a2000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002');
-- d1 dono E1, g1 gerente E1, o1 operador E1, g2 gerente E2
INSERT INTO public.usuarios VALUES ('d1000000-0000-0000-0000-000000000001',NULL),('91000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),('01000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),('92000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002');
INSERT INTO public.usuario_vinculos VALUES
 ('d1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001',NULL,'DONO'),
 ('91000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','GERENTE'),
 ('01000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','OPERADOR'),
 ('92000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','GERENTE');

\ir ../migrations/20261021190000_funcionarios_dados_complementares.sql

CREATE OR REPLACE FUNCTION pg_temp.expect(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'FALHOU: %', msg; END IF; RAISE NOTICE 'ok: %', msg; END $$;

SET ROLE authenticated;
-- gerente E1 grava dados do operador (empresa_id forjada é corrigida pelo gatilho)
SELECT set_config('test.uid','91000000-0000-0000-0000-000000000001',false);
INSERT INTO public.funcionario_dados (usuario_id, empresa_id, cpf, telefone) VALUES ('01000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000002','52998224725','81999990000');
SELECT pg_temp.expect((SELECT empresa_id FROM public.funcionario_dados) = 'e1000000-0000-0000-0000-000000000001', 'empresa_id vem do funcionário, não do cliente');
SELECT pg_temp.expect((SELECT count(*) FROM public.funcionario_dados) = 1, 'gerente da mesma empresa lê');
-- dono E1 lê
SELECT set_config('test.uid','d1000000-0000-0000-0000-000000000001',false);
SELECT pg_temp.expect((SELECT count(*) FROM public.funcionario_dados) = 1, 'dono da mesma empresa lê');
-- operador não lê nada (nem o próprio CPF)
SELECT set_config('test.uid','01000000-0000-0000-0000-000000000001',false);
SELECT pg_temp.expect((SELECT count(*) FROM public.funcionario_dados) = 0, 'operador não vê CPF');
DO $$ BEGIN
  INSERT INTO public.funcionario_dados (usuario_id, empresa_id) VALUES ('91000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'FALHOU: operador conseguiu inserir';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: operador não escreve';
END $$;
-- gerente de outra empresa não lê e não escreve
SELECT set_config('test.uid','92000000-0000-0000-0000-000000000002',false);
SELECT pg_temp.expect((SELECT count(*) FROM public.funcionario_dados) = 0, 'outra empresa não lê');
UPDATE public.funcionario_dados SET cargo = 'x';
SELECT set_config('test.uid','91000000-0000-0000-0000-000000000001',false);
SELECT pg_temp.expect((SELECT cargo FROM public.funcionario_dados) IS NULL, 'update de outra empresa não alterou');
-- CPF único por empresa
DO $$ BEGIN
  INSERT INTO public.funcionario_dados (usuario_id, empresa_id, cpf) VALUES ('91000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','52998224725');
  RAISE EXCEPTION 'FALHOU: CPF duplicado aceito';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok: CPF único por empresa';
END $$;
RESET ROLE;
SELECT set_config('test.uid','',false);
\ir ../rollback/20261021190000_funcionarios_dados_complementares.rollback.sql
SELECT pg_temp.expect(to_regclass('public.funcionario_dados') IS NULL, 'rollback remove a tabela');
