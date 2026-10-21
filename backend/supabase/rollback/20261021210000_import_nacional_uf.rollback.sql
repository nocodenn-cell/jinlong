-- ============================================================================
-- ROLLBACK de 20261021210000_import_nacional_uf.sql. Manual, com autorização.
-- Remove o catálogo por UF e as configurações de importação das empresas (UF, porto, % efetivo,
-- alíquotas informadas). Lançamentos de tributos já registrados NÃO são afetados.
-- O app volta a usar o catálogo embarcado (fallback) automaticamente.
-- ============================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.import_remover_override_tributo(uuid);
DROP FUNCTION IF EXISTS public.import_salvar_override_tributo(jsonb);
DROP FUNCTION IF EXISTS public.import_salvar_parametros_empresa(jsonb);
DROP FUNCTION IF EXISTS public._import_empresa_contexto();
DROP TABLE IF EXISTS public.empresa_tributos_override;
DROP TABLE IF EXISTS public.empresa_parametros_importacao;
DROP TABLE IF EXISTS public.tributos_catalogo_uf;
COMMIT;
