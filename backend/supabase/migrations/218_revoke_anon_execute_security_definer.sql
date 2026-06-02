-- 218 — Revoga EXECUTE de `anon` em todas as funções SECURITY DEFINER do schema public.
--
-- Funções SECURITY DEFINER bypassam RLS (rodam como dono). Embora validem o chamador internamente
-- (IF auth.uid() IS NULL RAISE + checagem de perfil), expô-las a `anon` é desnecessário e é WARN no
-- advisor (anon_security_definer_function_executable, ~48 ocorrências). Mantém authenticated e
-- service_role. Corrige também o legado das migrations 071/123, que revogaram `authenticated` mas
-- deixaram `anon` em registrar_venda_com_itens e decrementar_estoque_idempotente.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;
