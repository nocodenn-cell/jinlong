-- Rollback de 20261019140000_multiempresa_fase2_guardas.sql
-- Ordem: envelopes de RPC → guardas → colunas/triggers empresa_id → funções/tabelas novas.
-- Atenção: remove empresa_id das tabelas de empresa (categorias, marcas, ...). Se a Empresa 2 já
-- tiver dados, NÃO rodar sem antes exportar/isolar esses dados (o vínculo de empresa se perde).
-- As guardas da fase 1 (fornecedores, contas_receber, itens_venda) são preservadas.
BEGIN;
DO $$
BEGIN
  IF to_regclass('internal.fp_guardas_originais') IS NOT NULL THEN
    RAISE EXCEPTION 'Rode antes o rollback da fase 4 (20261019160000_multiempresa_fase4_desempenho_guardas.rollback.sql).';
  END IF;
END $$;

DO $$
DECLARE r record; g text;
BEGIN
  IF to_regclass('internal.fp_rpc_envelopes') IS NOT NULL THEN
    FOR r IN SELECT * FROM internal.fp_rpc_envelopes LOOP
      EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s)', r.nome, r.identidade);
      EXECUTE format('ALTER FUNCTION internal.%I(%s) SET SCHEMA public', r.nome, r.identidade);
      FOREACH g IN ARRAY r.grantees LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO %I', r.nome, r.identidade, g);
      END LOOP;
    END LOOP;
  END IF;

  IF to_regclass('internal.fp_tenant_guardas') IS NOT NULL THEN
    FOR r IN SELECT tabela FROM internal.fp_tenant_guardas WHERE aplicada LOOP
      IF to_regclass('public.' || r.tabela) IS NOT NULL THEN
        EXECUTE format('DROP POLICY IF EXISTS tenant_guard ON public.%I', r.tabela);
      END IF;
    END LOOP;
  END IF;

  FOREACH g IN ARRAY ARRAY['categorias', 'marcas', 'regras_preco', 'categorias_financeiras',
                           'pricing_config_versions', 'configuracoes_gerais', 'relatorio_settings', 'lojas'] LOOP
    IF to_regclass('public.' || g) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_preenche_empresa_id ON public.%I', g);
      IF g <> 'lojas' THEN
        EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS empresa_id', g);
      END IF;
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.ativar_dispositivo_pdv_v2(text, text, text, text);
DROP TABLE IF EXISTS public.pdv_ativacao_tentativas;
DROP FUNCTION IF EXISTS public.vincular_usuario_loja(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.fp_usuario_pode_loja(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS internal.fp_aplicar_guarda(text, text, text, text);
DROP TABLE IF EXISTS internal.fp_tenant_guardas;
DROP TABLE IF EXISTS internal.fp_rpc_envelopes;
DROP FUNCTION IF EXISTS internal.tg_preenche_empresa_id();
DROP FUNCTION IF EXISTS internal.fp_empresa_padrao();
DROP FUNCTION IF EXISTS public.fp_assert_mesma_empresa(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fp_assert_loja(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.fp_loja_de(text, uuid);
DROP FUNCTION IF EXISTS public.fp_pode_empresa(uuid);
DROP FUNCTION IF EXISTS public.fp_pode_loja_nula(uuid);
DROP FUNCTION IF EXISTS public.fp_admin_legado();
DROP FUNCTION IF EXISTS internal.fp_contexto_servidor();

COMMIT;
