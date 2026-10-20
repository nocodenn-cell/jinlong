-- Rollback da Fase 4 (desempenho das guardas). Rodar ANTES dos rollbacks das fases 3 e 2.
-- 1) fp_aplicar_guarda volta à definição original (sem o gancho de otimização).
DO $$
BEGIN
  IF to_regclass('internal.fp_fase5_guardas') IS NOT NULL THEN
    RAISE EXCEPTION 'Rode antes o rollback da fase 5 (20261019170000_multiempresa_fase5_catalogo_empresa.rollback.sql).';
  END IF;
END $$;
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('internal.fp_funcoes_reescritas') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT * FROM internal.fp_funcoes_reescritas WHERE assinatura = 'internal.fp_aplicar_guarda(text, text, text, text)' LOOP
    IF r.aplicada THEN EXECUTE r.definicao_original; END IF;
    DELETE FROM internal.fp_funcoes_reescritas WHERE assinatura = r.assinatura;
  END LOOP;
END $$;
-- 2) guardas voltam à expressão original.
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('internal.fp_guardas_originais') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT * FROM internal.fp_guardas_originais WHERE aplicada LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tabela AND policyname = 'tenant_guard') THEN
      IF r.qual IS NOT NULL AND r.with_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY tenant_guard ON public.%I USING (%s) WITH CHECK (%s)', r.tabela, r.qual, r.with_check);
      ELSIF r.qual IS NOT NULL THEN
        EXECUTE format('ALTER POLICY tenant_guard ON public.%I USING (%s)', r.tabela, r.qual);
      ELSIF r.with_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY tenant_guard ON public.%I WITH CHECK (%s)', r.tabela, r.with_check);
      END IF;
    END IF;
  END LOOP;
END $$;
DROP TABLE IF EXISTS internal.fp_guardas_originais;
DROP FUNCTION IF EXISTS internal.fp_otimizar_guarda(text);
DROP FUNCTION IF EXISTS internal.fp_guarda_rapida(text, text);
DROP VIEW IF EXISTS fp_guarda.caixa, fp_guarda.venda, fp_guarda.produto;
DROP SCHEMA IF EXISTS fp_guarda;
DROP FUNCTION IF EXISTS public.fp_lojas_permitidas_arr();
DROP FUNCTION IF EXISTS public.fp_empresas_arr();
DROP INDEX IF EXISTS public.usuario_vinculos_empresa_idx;
DROP INDEX IF EXISTS public.usuario_vinculos_empresa_loja_idx;
