-- Preserve the cost-column revocations from N1 phase B. Never grant costs on produtos.
-- The existing authorized query moves, unchanged, into a non-API function.
-- No authorization predicate is copied or broadened; the public view becomes invoker.
BEGIN;

CREATE SCHEMA IF NOT EXISTS jinlong_security AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA jinlong_security FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA jinlong_security TO authenticated, service_role;

DO $migration$
DECLARE
  original_query text;
  result_columns text;
  projection text;
  column_names text[];
BEGIN
  IF has_column_privilege('authenticated', 'public.produtos', 'preco_custo', 'SELECT')
     OR has_column_privilege('authenticated', 'public.produtos', 'preco_custo_medio', 'SELECT') THEN
    RAISE EXCEPTION 'N1 phase B is required: direct cost access must already be revoked';
  END IF;
  -- pg_get_viewdef must qualify public relations in the captured query.
  PERFORM set_config('search_path', 'pg_catalog', true);
  SELECT array_agg(attname::text ORDER BY attnum),
         string_agg(format('%I %s', attname, format_type(atttypid, atttypmod)), ', ' ORDER BY attnum),
         string_agg(format('f.%I::%s AS %I', attname, format_type(atttypid, atttypmod), attname), ', ' ORDER BY attnum)
    INTO column_names, result_columns, projection
    FROM pg_attribute
   WHERE attrelid = 'public.produtos_custos'::regclass
     AND attnum > 0 AND NOT attisdropped;
  IF column_names IS DISTINCT FROM ARRAY['produto_id', 'loja_id', 'preco_custo', 'preco_custo_medio'] THEN
    RAISE EXCEPTION 'Unexpected produtos_custos contract; migration aborted';
  END IF;
  original_query := pg_get_viewdef('public.produtos_custos'::regclass, true);
  -- CREATE (not REPLACE) aborts on an unexpected existing privileged function.
  EXECUTE format(
    'CREATE FUNCTION jinlong_security.produtos_custos_autorizados() RETURNS TABLE (%s) '
    'LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS %L',
    result_columns, original_query);
  EXECUTE format(
    'CREATE OR REPLACE VIEW public.produtos_custos WITH (security_invoker = true) AS '
    'SELECT %s FROM jinlong_security.produtos_custos_autorizados() f', projection);
END
$migration$;

ALTER FUNCTION jinlong_security.produtos_custos_autorizados() OWNER TO postgres;
REVOKE ALL ON FUNCTION jinlong_security.produtos_custos_autorizados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION jinlong_security.produtos_custos_autorizados() TO authenticated, service_role;
REVOKE ALL ON public.produtos_custos FROM PUBLIC, anon;
GRANT SELECT ON public.produtos_custos TO authenticated, service_role;
COMMENT ON FUNCTION jinlong_security.produtos_custos_autorizados() IS
  'Private cost boundary: original produtos_custos query, including active profile and store authorization. No parameters; no direct API exposure.';

NOTIFY pgrst, 'reload schema';
COMMIT;
