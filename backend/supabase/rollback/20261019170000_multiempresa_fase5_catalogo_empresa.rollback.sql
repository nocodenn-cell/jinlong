-- Rollback de 20261019170000_multiempresa_fase5_catalogo_empresa.sql (rodar ANTES do rollback da fase 4).
BEGIN;
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('internal.fp_fase5_envelopes') IS NOT NULL THEN
    FOR r IN SELECT * FROM internal.fp_fase5_envelopes LOOP EXECUTE r.definicao_original; END LOOP;
  END IF;
  IF to_regclass('internal.fp_fase5_guardas') IS NOT NULL THEN
    FOR r IN SELECT * FROM internal.fp_fase5_guardas LOOP
      EXECUTE format('ALTER POLICY tenant_guard ON public.%I USING (%s)%s', r.tabela, r.qual,
        CASE WHEN r.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', r.with_check) ELSE '' END);
    END LOOP;
  END IF;
END $$;
DROP TABLE IF EXISTS internal.fp_fase5_envelopes;
DROP TABLE IF EXISTS internal.fp_fase5_guardas;
DROP FUNCTION IF EXISTS public.fp_assert_produto(uuid, text);
DROP VIEW IF EXISTS fp_guarda.produto_empresa;
COMMIT;
