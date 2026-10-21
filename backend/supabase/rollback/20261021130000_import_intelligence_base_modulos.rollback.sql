-- Rollback de 20261021130000 (aplicar DEPOIS dos rollbacks 20261021130300/0200/0100).
BEGIN;
DROP FUNCTION IF EXISTS public.ops_definir_modulo_empresa(uuid, text, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.fp_empresa_contexto_modulo(text, text[], uuid);
DROP FUNCTION IF EXISTS public.fp_lojas_cerca();
DROP FUNCTION IF EXISTS public.fp_pode_operar_loja(uuid, text[]);
DROP FUNCTION IF EXISTS public.fp_pode_modulo(uuid, text, text[]);
DROP FUNCTION IF EXISTS public.fp_modulo_ativo(uuid, text);
DROP TABLE IF EXISTS public.empresa_modulos_historico;
DROP TABLE IF EXISTS public.empresa_modulos;
DROP TABLE IF EXISTS public.modulos_catalogo;
DROP FUNCTION IF EXISTS public.trg_empresa_modulos_historico();
DROP FUNCTION IF EXISTS public.trg_historico_imutavel();
COMMIT;
