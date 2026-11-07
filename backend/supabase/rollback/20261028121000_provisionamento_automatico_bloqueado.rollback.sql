-- Rollback de 20261028121000_provisionamento_automatico_bloqueado.sql (somente com autorização do dono).
-- Devolve o núcleo ao nome público original (corpo intacto). Mantém a trilha de contingência e o parâmetro.
BEGIN;
DROP FUNCTION IF EXISTS public.plataforma_provisionar_empresa(jsonb, uuid);
ALTER FUNCTION internal.plataforma_provisionar_empresa_nucleo(jsonb, uuid) RENAME TO plataforma_provisionar_empresa;
ALTER FUNCTION internal.plataforma_provisionar_empresa(jsonb, uuid) SET SCHEMA public;
REVOKE ALL ON FUNCTION public.plataforma_provisionar_empresa(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plataforma_provisionar_empresa(jsonb, uuid) TO service_role;
COMMIT;
