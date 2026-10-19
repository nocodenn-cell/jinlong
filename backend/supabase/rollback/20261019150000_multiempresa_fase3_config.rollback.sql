-- Rollback de 20261019150000_multiempresa_fase3_config.sql
-- ATENÇÃO: volta a configuração a ser GLOBAL. Linhas de configuração de outras empresas que não a
-- Empresa 1 (configuracoes_gerais, relatorio_settings, linha padrão de pdv_config, versão de pricing ativa)
-- são APAGADAS/desativadas — exportar antes se a Empresa 2 já estiver configurada.
-- Rodar ANTES do rollback da fase 2.
BEGIN;

DO $$
DECLARE r record;
BEGIN
  IF to_regclass('internal.fp_funcoes_reescritas') IS NOT NULL THEN
    FOR r IN SELECT * FROM internal.fp_funcoes_reescritas WHERE aplicada ORDER BY created_at DESC, assinatura LOOP
      EXECUTE r.definicao_original;
    END LOOP;
  END IF;
  IF to_regclass('internal.fp_comentarios_originais') IS NOT NULL THEN
    FOR r IN SELECT * FROM internal.fp_comentarios_originais LOOP
      IF to_regprocedure(r.assinatura) IS NOT NULL THEN
        EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.assinatura, r.comentario);
      END IF;
    END LOOP;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_empresa_semear_config ON public.empresas;
DROP FUNCTION IF EXISTS internal.tg_empresa_semear_config();
DROP FUNCTION IF EXISTS internal.fp_semear_config_empresa(uuid);
DROP TRIGGER IF EXISTS trg_pdv_config_empresa ON public.pdv_config;
DROP FUNCTION IF EXISTS internal.tg_pdv_config_empresa();

-- guarda do pdv_config volta à da fase 2
SELECT internal.fp_aplicar_guarda('pdv_config', 'L?', 'public.fp_pode_loja_nula(loja_id::uuid)', 'loja_id');

DO $$
BEGIN
  DELETE FROM public.configuracoes_gerais WHERE empresa_id <> 'e0000001-0000-4000-8000-000000000001';
  ALTER TABLE public.configuracoes_gerais DROP CONSTRAINT IF EXISTS configuracoes_gerais_empresa_chave_key;
  ALTER TABLE public.configuracoes_gerais ALTER COLUMN empresa_id DROP NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'configuracoes_gerais_chave_key') THEN
    ALTER TABLE public.configuracoes_gerais ADD CONSTRAINT configuracoes_gerais_chave_key UNIQUE (chave);
  END IF;

  UPDATE public.pricing_config_versions SET is_active = false
   WHERE is_active AND empresa_id <> 'e0000001-0000-4000-8000-000000000001';
  DROP INDEX IF EXISTS public.pricing_config_versions_ativa_por_empresa;
  ALTER TABLE public.pricing_config_versions ALTER COLUMN empresa_id DROP NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS pricing_config_versions_single_active
    ON public.pricing_config_versions (is_active) WHERE is_active = true;

  DELETE FROM public.relatorio_settings WHERE id <> 1;
  DROP INDEX IF EXISTS public.relatorio_settings_empresa_uniq;
  ALTER TABLE public.relatorio_settings ALTER COLUMN id SET DEFAULT 1;
  DROP SEQUENCE IF EXISTS public.relatorio_settings_id_seq;
  ALTER TABLE public.relatorio_settings ALTER COLUMN empresa_id DROP NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relatorio_settings_singleton') THEN
    ALTER TABLE public.relatorio_settings ADD CONSTRAINT relatorio_settings_singleton CHECK (id = 1);
  END IF;

  DELETE FROM public.pdv_config WHERE loja_id IS NULL AND empresa_id <> 'e0000001-0000-4000-8000-000000000001';
  DROP INDEX IF EXISTS public.pdv_config_padrao_por_empresa;
  ALTER TABLE public.pdv_config DROP COLUMN IF EXISTS empresa_id;
END $$;

-- a guarda do pdv_config referenciava loja_id apenas; reaplicada acima antes do DROP COLUMN.
DROP FUNCTION IF EXISTS public.fp_pdv_config_id(uuid);
DROP FUNCTION IF EXISTS public.fp_empresa_contexto(uuid);
DROP FUNCTION IF EXISTS internal.fp_empresa_selecionada();
DROP FUNCTION IF EXISTS internal.fp_reescrever(text, jsonb);
DROP TABLE IF EXISTS internal.fp_comentarios_originais;
DROP TABLE IF EXISTS internal.fp_funcoes_reescritas;

COMMIT;
