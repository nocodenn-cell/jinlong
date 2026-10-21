-- Rollback de 20261021190000_funcionarios_dados_complementares.sql (apaga os dados complementares).
BEGIN;
DROP TABLE IF EXISTS public.funcionario_dados;
DROP FUNCTION IF EXISTS public.trg_fn_funcionario_dados_empresa();
DROP FUNCTION IF EXISTS public.fp_empresas_gerenciais_do_usuario();
COMMIT;
