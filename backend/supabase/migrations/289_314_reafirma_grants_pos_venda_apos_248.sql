-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 289
-- name: 314_reafirma_grants_pos_venda_apos_248
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

DO $reafirma_grants_314$
DECLARE
  v_devolver text :=
    'public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid)';
  v_quantidade text := 'public.quantidade_devolvida_item_venda(uuid)';
BEGIN
  IF to_regprocedure(v_devolver) IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION_314: devolver_ou_trocar_venda ausente — a 248 deveria ter rodado antes desta migration';
  END IF;
  IF to_regprocedure(v_quantidade) IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION_314: quantidade_devolvida_item_venda ausente — a 248 deveria ter rodado antes desta migration';
  END IF;

  EXECUTE 'REVOKE ALL ON FUNCTION ' || v_devolver || ' FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || v_devolver || ' FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_devolver || ' TO authenticated, service_role';

  EXECUTE 'REVOKE ALL ON FUNCTION ' || v_quantidade || ' FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || v_quantidade || ' FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_quantidade || ' TO authenticated, service_role';
END
$reafirma_grants_314$;

DO $verify_314$
DECLARE
  v_devolver text :=
    'public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid)';
  v_quantidade text := 'public.quantidade_devolvida_item_venda(uuid)';
BEGIN
  IF has_function_privilege('anon', v_devolver, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_314: anon ainda executa devolver_ou_trocar_venda';
  END IF;
  IF has_function_privilege('anon', v_quantidade, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_314: anon ainda executa quantidade_devolvida_item_venda';
  END IF;
  IF NOT has_function_privilege('authenticated', v_devolver, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_314: authenticated perdeu EXECUTE em devolver_ou_trocar_venda';
  END IF;
  IF NOT has_function_privilege('authenticated', v_quantidade, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_314: authenticated perdeu EXECUTE em quantidade_devolvida_item_venda';
  END IF;
END
$verify_314$;

NOTIFY pgrst, 'reload schema';