-- 221 — Fecha o gap da 218: funções SECURITY DEFINER com EXECUTE concedido a PUBLIC.
--
-- A 218 revogou EXECUTE de `anon`, mas ~10 funções tinham o grant em PUBLIC (acl `=X/postgres`),
-- e `anon` herda de PUBLIC — então continuavam executáveis sem autenticação. Aqui revogamos de
-- PUBLIC. Todas essas funções já possuem grant EXPLÍCITO para `authenticated` e `service_role`,
-- portanto os papéis legítimos não perdem acesso; só `anon` deixa de herdar.
--
-- Salvaguarda: antes de revogar de PUBLIC, garante grant explícito a authenticated+service_role
-- (idempotente) para o caso de alguma função depender só do PUBLIC para o acesso autenticado.
-- Funções que NÃO têm PUBLIC execute (ex.: registrar_venda_com_itens, decrementar_estoque_*, que
-- tiveram authenticated revogado de propósito em 071/123) não entram no loop e ficam intactas.

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
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;
