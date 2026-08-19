-- P1-2 real: diagnósticos SECURITY DEFINER fora do alcance de authenticated.
--
-- A 20260818000001 só revogou a sobrecarga de 4 args de `authenticated`.
-- Ficaram dois furos, o segundo mascarado no GATE9 (REVOKE no setup do teste):
--
-- 1) Sobrecarga de 3 args (`uuid, timestamptz, timestamptz`, migration 244):
--    SECURITY DEFINER, GRANT authenticated, sem predicado de loja.
--    Provado: GERENTE da loja B, com 0 linhas em `vendas` pela RLS, obteve
--    via RPC a contagem agregada das vendas da loja A.
-- 2) Sobrecarga de 4 args: CREATE FUNCTION concede EXECUTE a PUBLIC por
--    padrão; REVOKE authenticated não remove PUBLIC. authenticated herda.
--
-- Nenhuma das duas tem consumidor de produto. Mantém só service_role.

DROP FUNCTION IF EXISTS public.relatorio_consistencia_vendas(uuid, timestamptz, timestamptz);

REVOKE EXECUTE ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid)
  TO service_role;

COMMENT ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) IS
  'Diagnóstico administrativo (service_role). Sem guarda de loja — não expor a authenticated.';

COMMENT ON FUNCTION public.verificar_consistencia_venda(uuid) IS
  'Diagnóstico administrativo (service_role). Sem guarda de loja — não expor a authenticated.';
