-- golive-final-584 :: 20261019150000 multiempresa_fase3_config :: sha256 1da80a714c49cbb08485a950267c987b056d1bebd29b49ca5ec14dda34aef6a6
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019150000') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261019150000'; END IF; END $g$;
-- 20261019150000_multiempresa_fase3_config.sql
-- Multiempresa Fase 3 — configuração por empresa (D12/D13), revisão das RPCs pendentes e seleção de empresa.
-- ADITIVA E REVERSÍVEL. Rollback: backend/supabase/rollback/20261019150000_multiempresa_fase3_config.rollback.sql
--
--  1. contexto de empresa: fp_empresa_contexto(loja) e seleção explícita pelo header `x-fp-empresa`
--     (usuário com vínculo em 2+ empresas escolhe UMA; o header só ESTREITA o escopo, nunca amplia);
--  2. configuracoes_gerais UNIQUE(empresa_id, chave); pricing ativa por empresa; relatorio_settings por empresa;
--     pdv_config com empresa_id e linha padrão por empresa (loja_id NULL); empresa nova recebe config padrão;
--  3. funções que liam a config global (`id = 1`, `chave = ...`, `is_active`) passam a ler a da empresa
--     da operação — reescrita textual registrada (corpo original guardado para o rollback);
--  4. RPCs antes pendentes revisadas: categorias_financeiras por empresa no financeiro; diagnóstico só nas
--     lojas permitidas; demais com escopo por auth.uid documentado (COMMENT 'Multiempresa revisado').
-- Cliente 1 (uma empresa): todas as leituras resolvem para exatamente as mesmas linhas de antes
-- (pdv_config id=1, as chaves atuais, a versão ativa atual, relatorio_settings id=1).


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Registro de reescritas (rollback restaura o corpo original)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.fp_funcoes_reescritas (
  assinatura text PRIMARY KEY,
  definicao_original text NOT NULL,
  aplicada boolean NOT NULL,
  motivo text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- p_trocas: [[de, para], ...]. Todas as trocas precisam casar; senão nada é alterado (NOTICE + aplicada=false).
CREATE OR REPLACE FUNCTION internal.fp_reescrever(p_assinatura text, p_trocas jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_oid oid; v_def text; v_nova text; t jsonb;
BEGIN
  v_oid := to_regprocedure(p_assinatura);
  IF v_oid IS NULL THEN
    RAISE NOTICE 'multiempresa fase3: % ausente, pulando', p_assinatura;
    RETURN false;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  v_nova := v_def;
  FOR t IN SELECT * FROM jsonb_array_elements(p_trocas) LOOP
    IF strpos(v_nova, t->>0) = 0 THEN
      RAISE NOTICE 'multiempresa fase3: % sem o trecho esperado [%] (drift) — não alterada', p_assinatura, left(t->>0, 60);
      INSERT INTO internal.fp_funcoes_reescritas (assinatura, definicao_original, aplicada, motivo)
      VALUES (p_assinatura, v_def, false, 'trecho ausente: ' || left(t->>0, 120))
      ON CONFLICT (assinatura) DO NOTHING;
      RETURN false;
    END IF;
    v_nova := replace(v_nova, t->>0, t->>1);
  END LOOP;
  INSERT INTO internal.fp_funcoes_reescritas (assinatura, definicao_original, aplicada)
  VALUES (p_assinatura, v_def, true)
  ON CONFLICT (assinatura) DO NOTHING;
  EXECUTE v_nova;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION internal.fp_reescrever(text, jsonb) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Contexto de empresa
-- ─────────────────────────────────────────────────────────────────────────────
-- Empresa escolhida pelo usuário (header x-fp-empresa repassado pelo PostgREST). NULL se ausente/inválido.
CREATE OR REPLACE FUNCTION internal.fp_empresa_selecionada()
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-fp-empresa';
  IF v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN v::uuid; END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION internal.fp_empresa_selecionada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.fp_empresa_selecionada() TO anon, authenticated, service_role;

-- Seleção estreita os helpers de escopo (empresa fora dos vínculos ⇒ conjunto vazio ⇒ nega).
SELECT internal.fp_reescrever('public.fp_empresas_do_usuario()', jsonb_build_array(jsonb_build_array(
  'WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo;',
  'WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo
     AND (internal.fp_empresa_selecionada() IS NULL OR v.empresa_id = internal.fp_empresa_selecionada());')));
SELECT internal.fp_reescrever('public.fp_lojas_permitidas(text[])', jsonb_build_array(jsonb_build_array(
  'AND (p_papeis IS NULL OR v.papel = ANY (p_papeis));',
  'AND (p_papeis IS NULL OR v.papel = ANY (p_papeis))
     AND (internal.fp_empresa_selecionada() IS NULL OR v.empresa_id = internal.fp_empresa_selecionada());')));

-- Empresa da operação: da loja informada; senão a selecionada (se o usuário pertence a ela); senão a
-- da loja do usuário; senão a única empresa do sistema (cliente 1); senão NULL (lê nada ⇒ defaults).
CREATE OR REPLACE FUNCTION public.fp_empresa_contexto(p_loja uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    (SELECT l.empresa_id FROM public.lojas l WHERE l.id = p_loja),
    (SELECT s.e FROM (SELECT internal.fp_empresa_selecionada() AS e) s
      WHERE s.e IS NOT NULL AND s.e IN (SELECT public.fp_empresas_do_usuario())),
    (SELECT l.empresa_id FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id
      WHERE u.id = (SELECT auth.uid()) AND u.ativo),
    (SELECT CASE WHEN count(*) = 1 THEN (array_agg(e.id))[1] END FROM public.empresas e)
  );
$$;
REVOKE ALL ON FUNCTION public.fp_empresa_contexto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_empresa_contexto(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabelas de configuração por empresa
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- configuracoes_gerais: UNIQUE(chave) → UNIQUE(empresa_id, chave)
  UPDATE public.configuracoes_gerais SET empresa_id = 'e0000001-0000-4000-8000-000000000001' WHERE empresa_id IS NULL;
  ALTER TABLE public.configuracoes_gerais ALTER COLUMN empresa_id SET NOT NULL;
  ALTER TABLE public.configuracoes_gerais DROP CONSTRAINT IF EXISTS configuracoes_gerais_chave_key;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'configuracoes_gerais_empresa_chave_key') THEN
    ALTER TABLE public.configuracoes_gerais ADD CONSTRAINT configuracoes_gerais_empresa_chave_key UNIQUE (empresa_id, chave);
  END IF;

  -- pricing: uma versão ativa POR EMPRESA
  UPDATE public.pricing_config_versions SET empresa_id = 'e0000001-0000-4000-8000-000000000001' WHERE empresa_id IS NULL;
  ALTER TABLE public.pricing_config_versions ALTER COLUMN empresa_id SET NOT NULL;
  DROP INDEX IF EXISTS public.pricing_config_versions_single_active;
  CREATE UNIQUE INDEX IF NOT EXISTS pricing_config_versions_ativa_por_empresa
    ON public.pricing_config_versions (empresa_id) WHERE is_active = true;

  -- relatorio_settings: deixa de ser singleton
  UPDATE public.relatorio_settings SET empresa_id = 'e0000001-0000-4000-8000-000000000001' WHERE empresa_id IS NULL;
  ALTER TABLE public.relatorio_settings ALTER COLUMN empresa_id SET NOT NULL;
  ALTER TABLE public.relatorio_settings DROP CONSTRAINT IF EXISTS relatorio_settings_singleton;
  CREATE SEQUENCE IF NOT EXISTS public.relatorio_settings_id_seq START 2 OWNED BY public.relatorio_settings.id;
  PERFORM setval('public.relatorio_settings_id_seq', greatest((SELECT coalesce(max(id), 1) FROM public.relatorio_settings), 1));
  ALTER TABLE public.relatorio_settings ALTER COLUMN id SET DEFAULT nextval('public.relatorio_settings_id_seq');
  CREATE UNIQUE INDEX IF NOT EXISTS relatorio_settings_empresa_uniq ON public.relatorio_settings (empresa_id);

  -- pdv_config: empresa_id; linha com loja_id NULL = padrão da empresa (a id=1 atual = Empresa 1)
  ALTER TABLE public.pdv_config ADD COLUMN IF NOT EXISTS empresa_id uuid NULL REFERENCES public.empresas(id);
  UPDATE public.pdv_config pc SET empresa_id = l.empresa_id FROM public.lojas l
   WHERE pc.loja_id = l.id AND pc.empresa_id IS NULL;
  UPDATE public.pdv_config SET empresa_id = 'e0000001-0000-4000-8000-000000000001'
   WHERE empresa_id IS NULL AND loja_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS pdv_config_padrao_por_empresa ON public.pdv_config (empresa_id) WHERE loja_id IS NULL;
END $$;

CREATE OR REPLACE FUNCTION internal.tg_pdv_config_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.loja_id IS NOT NULL THEN
    NEW.empresa_id := (SELECT empresa_id FROM public.lojas WHERE id = NEW.loja_id);
  ELSIF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := internal.fp_empresa_padrao();
  END IF;
  IF NEW.empresa_id IS NULL AND EXISTS (SELECT 1 FROM public.empresas) THEN
    RAISE EXCEPTION 'EMPRESA_ID_OBRIGATORIA: pdv_config' USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_pdv_config_empresa() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_pdv_config_empresa ON public.pdv_config;
CREATE TRIGGER trg_pdv_config_empresa BEFORE INSERT OR UPDATE OF loja_id, empresa_id ON public.pdv_config
  FOR EACH ROW EXECUTE FUNCTION internal.tg_pdv_config_empresa();

-- guarda do pdv_config: linha de loja ⇒ loja; linha padrão ⇒ empresa
SELECT internal.fp_aplicar_guarda('pdv_config', 'L|E',
  'CASE WHEN loja_id IS NOT NULL THEN public.fp_pode_loja(loja_id::uuid, NULL) ELSE public.fp_pode_empresa(empresa_id) END',
  'empresa_id');

-- Linha de pdv_config a usar: a padrão da empresa da operação (cliente 1 ⇒ id = 1, como antes).
CREATE OR REPLACE FUNCTION public.fp_pdv_config_id(p_loja uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT pc.id FROM public.pdv_config pc
   WHERE pc.loja_id IS NULL AND pc.empresa_id = public.fp_empresa_contexto(p_loja)
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fp_pdv_config_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_pdv_config_id(uuid) TO authenticated, service_role;

-- Configuração padrão para empresa nova (provisionamento) — valores do seed original, nunca os do cliente 1.
CREATE OR REPLACE FUNCTION internal.fp_semear_config_empresa(p_empresa uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id integer;
BEGIN
  INSERT INTO public.configuracoes_gerais (empresa_id, chave, valor, tipo_dado, descricao) VALUES
    (p_empresa, 'comissao_padrao_percentual', '5.00', 'percent', 'Comissão padrão para vendedores (%)'),
    (p_empresa, 'desconto_maximo_operador_percentual', '10.00', 'percent', 'Desconto máximo na venda sem validação de gerente (somatório linhas, %)'),
    (p_empresa, 'cancelamento_maximo_valor_sem_gerente', '500.00', 'money', 'Reservado: limite de cancelamento de venda sem gerente (R$)'),
    (p_empresa, 'estoque_minimo_padrao', '10', 'integer', 'Estoque mínimo padrão'),
    (p_empresa, 'lead_time_min_dias', '30', 'integer', 'Lead time mínimo de importação (dias)'),
    (p_empresa, 'lead_time_max_dias', '60', 'integer', 'Lead time máximo de importação (dias)'),
    (p_empresa, 'vendas_suspensas', 'false', 'text', 'Vendas suspensas'),
    (p_empresa, 'motivo_suspensao', '', 'text', 'Motivo da suspensão')
  ON CONFLICT (empresa_id, chave) DO NOTHING;
  INSERT INTO public.relatorio_settings (empresa_id) VALUES (p_empresa) ON CONFLICT (empresa_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE empresa_id = p_empresa AND loja_id IS NULL) THEN
    LOCK TABLE public.pdv_config IN SHARE ROW EXCLUSIVE MODE;
    SELECT coalesce(max(id), 0) + 1 INTO v_id FROM public.pdv_config;
    INSERT INTO public.pdv_config (id, empresa_id, loja_id, gerente_id, gerente_senha_sha256)
    VALUES (v_id, p_empresa, NULL, 'empresa-' || left(p_empresa::text, 8), '');
  END IF;
END $$;
REVOKE ALL ON FUNCTION internal.fp_semear_config_empresa(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION internal.tg_empresa_semear_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM internal.fp_semear_config_empresa(NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_empresa_semear_config() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_empresa_semear_config ON public.empresas;
CREATE TRIGGER trg_empresa_semear_config AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION internal.tg_empresa_semear_config();

-- empresas já existentes além da 1 (staging/homologação)
DO $$ DECLARE e uuid; BEGIN
  FOR e IN SELECT id FROM public.empresas WHERE id <> 'e0000001-0000-4000-8000-000000000001' LOOP
    PERFORM internal.fp_semear_config_empresa(e);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Leituras de config passam a ser da empresa da operação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  cfg_ctx constant text := 'FROM public.configuracoes_gerais c JOIN (SELECT public.fp_empresa_contexto(NULL) AS e) fp_ctx ON c.empresa_id = fp_ctx.e';
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- pdv_config (linha padrão da empresa)
    ('public.obter_limite_sangria_sem_gerente()',
      '[["WHERE pc.id = 1", "WHERE pc.id = public.fp_pdv_config_id(NULL)"]]'),
    ('public.pdv_config_para_caixa_web()',
      '[["WHERE p.id = 1", "WHERE p.id = public.fp_pdv_config_id(NULL)"]]'),
    ('public.pdv_config_flags_visuais()',
      '[["WHERE p.id = 1", "WHERE p.id = public.fp_pdv_config_id(NULL)"]]'),
    ('internal.registrar_movimentacao(uuid, text, text, numeric, text, text, text, uuid, text, inet, text, text, text, uuid, uuid)',
      '[["WHERE pc.id = 1;", "WHERE pc.id = public.fp_pdv_config_id(public.fp_loja_de(''caixa'', p_caixa_id));"]]'),
    ('internal.obter_status_caixa_operador(uuid)',
      '[["FROM public.pdv_config p WHERE p.id = 1", "FROM public.pdv_config p WHERE p.id = public.fp_pdv_config_id(public.fp_loja_de(''usuario'', p_operador_id))"]]'),
    ('internal.pdv_registrar_alertas_margem_venda(uuid)',
      '[["FROM public.pdv_config p WHERE p.id = 1", "FROM public.pdv_config p WHERE p.id = public.fp_pdv_config_id(public.fp_loja_de(''venda'', p_venda_id))"]]'),
    ('public.trg_fn_itens_venda_limite_desconto()',
      '[["WHERE  id = 1;", "WHERE  id = public.fp_pdv_config_id(public.fp_loja_de(''venda'', NEW.venda_id));"]]'),
    -- configuracoes_gerais
    ('internal.apurar_comissao_original(uuid)',
      '[["WHERE cg.chave = ''comissao_padrao_percentual'' LIMIT 1", "WHERE cg.chave = ''comissao_padrao_percentual'' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''venda'', p_venda_id)) LIMIT 1"]]'),
    ('internal.resolver_comissao_itens_venda(uuid)',
      '[["WHERE cg.chave = ''comissao_padrao_percentual'' LIMIT 1", "WHERE cg.chave = ''comissao_padrao_percentual'' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''venda'', p_venda_id)) LIMIT 1"]]'),
    ('internal.calcular_comissao_venda(uuid, boolean)',
      '[["WHERE cg.chave = ''comissao_padrao_percentual'' LIMIT 1", "WHERE cg.chave = ''comissao_padrao_percentual'' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''venda'', p_venda_id)) LIMIT 1"]]'),
    ('public.trg_fn_vendas_caixa_aberto()',
      '[["WHERE c.chave = ''vendas_suspensas'';", "WHERE c.chave = ''vendas_suspensas'' AND c.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''caixa'', NEW.caixa_id));"]]'),
    -- pricing
    ('public.obter_pricing_version_ativa()',
      '[["WHERE is_active = true", "WHERE is_active = true AND empresa_id = public.fp_empresa_contexto(NULL)"]]'),
    ('internal.registrar_pricing_version_venda(uuid, uuid)',
      '[["AND pcv.is_active = true;", "AND pcv.is_active = true AND pcv.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''venda'', p_venda_id));"]]'),
    -- revisão das pendentes
    ('public.financeiro_comando_v1(text, jsonb, uuid)',
      '[["FROM public.categorias_financeiras WHERE ", "FROM public.categorias_financeiras WHERE categorias_financeiras.empresa_id = public.fp_empresa_da_loja(l) AND "]]'),
    ('public.financeiro_painel(date, date, integer)',
      '[["FROM public.categorias_financeiras ORDER BY nome", "FROM public.categorias_financeiras WHERE empresa_id = public.fp_empresa_da_loja(l) ORDER BY nome"]]'),
    ('public.pdv_diagnostico_pre_producao(text)',
      '[["FROM public.produtos p", "FROM public.produtos p JOIN public.fp_lojas_permitidas(NULL) fp_perm(lj) ON fp_perm.lj = p.loja_id"],
        ["FROM public.configuracoes_gerais c", "FROM public.configuracoes_gerais c JOIN (SELECT public.fp_empresa_contexto(NULL) AS e) fp_ctx ON c.empresa_id = fp_ctx.e"]]'),
    -- venda / estoque com loja explícita
    ('public.finalizar_venda_transacional_canonica_v4_unscoped(' || (SELECT oidvectortypes(p.proargtypes) FROM pg_proc p
        WHERE p.proname = 'finalizar_venda_transacional_canonica_v4_unscoped' AND p.pronamespace = 'public'::regnamespace LIMIT 1) || ')',
      '[["FROM public.pdv_config WHERE id = 1;", "FROM public.pdv_config WHERE id = public.fp_pdv_config_id(p_loja_id);"]]'),
    ('public.finalizar_venda_transacional(uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric)',
      '[["WHERE  id = 1;", "WHERE  id = public.fp_pdv_config_id(public.fp_loja_de(''caixa'', p_caixa_id));"]]'),
    ('internal.obter_estoque_disponivel_transferencia(' || (SELECT oidvectortypes(p.proargtypes) FROM pg_proc p
        WHERE p.proname = 'obter_estoque_disponivel_transferencia' AND p.pronamespace = 'internal'::regnamespace LIMIT 1) || ')',
      '[["CROSS JOIN public.pdv_config pc", "LEFT JOIN public.pdv_config pc ON pc.id = public.fp_pdv_config_id(p_loja_id)"]]'),
    ('internal.transferir_estoque_seguro(' || (SELECT oidvectortypes(p.proargtypes) FROM pg_proc p
        WHERE p.proname = 'transferir_estoque_seguro' AND p.pronamespace = 'internal'::regnamespace LIMIT 1) || ')',
      '[["CROSS JOIN public.pdv_config pc", "LEFT JOIN public.pdv_config pc ON pc.id = public.fp_pdv_config_id(p_loja_origem)"]]')
  ) AS x(assinatura, trocas) LOOP
    PERFORM internal.fp_reescrever(r.assinatura, r.trocas::jsonb);
  END LOOP;

  -- alias `c` + contexto do chamador
  PERFORM internal.fp_reescrever('public.configuracoes_para_caixa_web()',
    jsonb_build_array(jsonb_build_array('FROM public.configuracoes_gerais c', cfg_ctx)));
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Revisão documentada (o teste de cobertura exige envelope OU este comentário)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.fp_comentarios_originais (
  assinatura text PRIMARY KEY,
  comentario text NULL
);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.financeiro_comando(text, jsonb, uuid)', 'loja = internal.financeiro_loja() (usuarios.loja_id do auth.uid, perfil gerencial); toda entidade do payload filtrada por essa loja; categorias por empresa (financeiro_comando_v1)'),
    ('public.financeiro_comando_operacional(text, jsonb, uuid)', 'loja = internal.financeiro_loja(); conta/caixa do payload filtrados por loja_id = loja do usuário'),
    ('public.financeiro_painel(date, date, integer)', 'loja = internal.financeiro_loja(); categorias_financeiras filtradas pela empresa da loja'),
    ('public.listar_caixas_elegiveis_desembolso()', 'caixas da loja do próprio usuário (usuarios.loja_id do auth.uid)'),
    ('public.listar_vendas_em_espera()', 'só vendas em espera do próprio operador (operador_id = auth.uid)'),
    ('public.pdv_diagnostico_pre_producao(text)', 'produtos só das lojas permitidas; config da empresa do usuário; restante é metadado do banco'),
    ('public.configuracoes_para_caixa_web()', 'configuracoes_gerais da empresa do usuário (fp_empresa_contexto)'),
    ('public.pdv_config_para_caixa_web()', 'pdv_config padrão da empresa do usuário (fp_pdv_config_id)'),
    ('public.pdv_config_flags_visuais()', 'pdv_config padrão da empresa do usuário (fp_pdv_config_id)'),
    ('public.obter_limite_sangria_sem_gerente()', 'pdv_config padrão da empresa do usuário (fp_pdv_config_id)'),
    ('public.obter_pricing_version_ativa()', 'versão ativa da empresa do usuário (índice único por empresa)'),
    ('public.is_feature_enabled(text)', 'feature flag global da plataforma, sem dado de cliente')
  ) AS x(assinatura, motivo) LOOP
    IF to_regprocedure(r.assinatura) IS NOT NULL THEN
      INSERT INTO internal.fp_comentarios_originais (assinatura, comentario)
      VALUES (r.assinatura, obj_description(to_regprocedure(r.assinatura), 'pg_proc'))
      ON CONFLICT (assinatura) DO NOTHING;
      EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.assinatura, 'Multiempresa revisado (20261019150000): ' || r.motivo);
    ELSE
      RAISE NOTICE 'multiempresa fase3: % ausente para comentário', r.assinatura;
    END IF;
  END LOOP;
END $$;

;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261019150000', 'multiempresa_fase3_config', ARRAY[$golive_stmt_1da80a714c49$-- 20261019150000_multiempresa_fase3_config.sql
-- Multiempresa Fase 3 — configuração por empresa (D12/D13), revisão das RPCs pendentes e seleção de empresa.
-- ADITIVA E REVERSÍVEL. Rollback: backend/supabase/rollback/20261019150000_multiempresa_fase3_config.rollback.sql
--
--  1. contexto de empresa: fp_empresa_contexto(loja) e seleção explícita pelo header `x-fp-empresa`
--     (usuário com vínculo em 2+ empresas escolhe UMA; o header só ESTREITA o escopo, nunca amplia);
--  2. configuracoes_gerais UNIQUE(empresa_id, chave); pricing ativa por empresa; relatorio_settings por empresa;
--     pdv_config com empresa_id e linha padrão por empresa (loja_id NULL); empresa nova recebe config padrão;
--  3. funções que liam a config global (`id = 1`, `chave = ...`, `is_active`) passam a ler a da empresa
--     da operação — reescrita textual registrada (corpo original guardado para o rollback);
--  4. RPCs antes pendentes revisadas: categorias_financeiras por empresa no financeiro; diagnóstico só nas
--     lojas permitidas; demais com escopo por auth.uid documentado (COMMENT 'Multiempresa revisado').
-- Cliente 1 (uma empresa): todas as leituras resolvem para exatamente as mesmas linhas de antes
-- (pdv_config id=1, as chaves atuais, a versão ativa atual, relatorio_settings id=1).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Registro de reescritas (rollback restaura o corpo original)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.fp_funcoes_reescritas (
  assinatura text PRIMARY KEY,
  definicao_original text NOT NULL,
  aplicada boolean NOT NULL,
  motivo text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- p_trocas: [[de, para], ...]. Todas as trocas precisam casar; senão nada é alterado (NOTICE + aplicada=false).
CREATE OR REPLACE FUNCTION internal.fp_reescrever(p_assinatura text, p_trocas jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_oid oid; v_def text; v_nova text; t jsonb;
BEGIN
  v_oid := to_regprocedure(p_assinatura);
  IF v_oid IS NULL THEN
    RAISE NOTICE 'multiempresa fase3: % ausente, pulando', p_assinatura;
    RETURN false;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  v_nova := v_def;
  FOR t IN SELECT * FROM jsonb_array_elements(p_trocas) LOOP
    IF strpos(v_nova, t->>0) = 0 THEN
      RAISE NOTICE 'multiempresa fase3: % sem o trecho esperado [%] (drift) — não alterada', p_assinatura, left(t->>0, 60);
      INSERT INTO internal.fp_funcoes_reescritas (assinatura, definicao_original, aplicada, motivo)
      VALUES (p_assinatura, v_def, false, 'trecho ausente: ' || left(t->>0, 120))
      ON CONFLICT (assinatura) DO NOTHING;
      RETURN false;
    END IF;
    v_nova := replace(v_nova, t->>0, t->>1);
  END LOOP;
  INSERT INTO internal.fp_funcoes_reescritas (assinatura, definicao_original, aplicada)
  VALUES (p_assinatura, v_def, true)
  ON CONFLICT (assinatura) DO NOTHING;
  EXECUTE v_nova;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION internal.fp_reescrever(text, jsonb) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Contexto de empresa
-- ─────────────────────────────────────────────────────────────────────────────
-- Empresa escolhida pelo usuário (header x-fp-empresa repassado pelo PostgREST). NULL se ausente/inválido.
CREATE OR REPLACE FUNCTION internal.fp_empresa_selecionada()
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-fp-empresa';
  IF v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN v::uuid; END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION internal.fp_empresa_selecionada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.fp_empresa_selecionada() TO anon, authenticated, service_role;

-- Seleção estreita os helpers de escopo (empresa fora dos vínculos ⇒ conjunto vazio ⇒ nega).
SELECT internal.fp_reescrever('public.fp_empresas_do_usuario()', jsonb_build_array(jsonb_build_array(
  'WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo;',
  'WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo
     AND (internal.fp_empresa_selecionada() IS NULL OR v.empresa_id = internal.fp_empresa_selecionada());')));
SELECT internal.fp_reescrever('public.fp_lojas_permitidas(text[])', jsonb_build_array(jsonb_build_array(
  'AND (p_papeis IS NULL OR v.papel = ANY (p_papeis));',
  'AND (p_papeis IS NULL OR v.papel = ANY (p_papeis))
     AND (internal.fp_empresa_selecionada() IS NULL OR v.empresa_id = internal.fp_empresa_selecionada());')));

-- Empresa da operação: da loja informada; senão a selecionada (se o usuário pertence a ela); senão a
-- da loja do usuário; senão a única empresa do sistema (cliente 1); senão NULL (lê nada ⇒ defaults).
CREATE OR REPLACE FUNCTION public.fp_empresa_contexto(p_loja uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    (SELECT l.empresa_id FROM public.lojas l WHERE l.id = p_loja),
    (SELECT s.e FROM (SELECT internal.fp_empresa_selecionada() AS e) s
      WHERE s.e IS NOT NULL AND s.e IN (SELECT public.fp_empresas_do_usuario())),
    (SELECT l.empresa_id FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id
      WHERE u.id = (SELECT auth.uid()) AND u.ativo),
    (SELECT CASE WHEN count(*) = 1 THEN (array_agg(e.id))[1] END FROM public.empresas e)
  );
$$;
REVOKE ALL ON FUNCTION public.fp_empresa_contexto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_empresa_contexto(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabelas de configuração por empresa
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- configuracoes_gerais: UNIQUE(chave) → UNIQUE(empresa_id, chave)
  UPDATE public.configuracoes_gerais SET empresa_id = 'e0000001-0000-4000-8000-000000000001' WHERE empresa_id IS NULL;
  ALTER TABLE public.configuracoes_gerais ALTER COLUMN empresa_id SET NOT NULL;
  ALTER TABLE public.configuracoes_gerais DROP CONSTRAINT IF EXISTS configuracoes_gerais_chave_key;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'configuracoes_gerais_empresa_chave_key') THEN
    ALTER TABLE public.configuracoes_gerais ADD CONSTRAINT configuracoes_gerais_empresa_chave_key UNIQUE (empresa_id, chave);
  END IF;

  -- pricing: uma versão ativa POR EMPRESA
  UPDATE public.pricing_config_versions SET empresa_id = 'e0000001-0000-4000-8000-000000000001' WHERE empresa_id IS NULL;
  ALTER TABLE public.pricing_config_versions ALTER COLUMN empresa_id SET NOT NULL;
  DROP INDEX IF EXISTS public.pricing_config_versions_single_active;
  CREATE UNIQUE INDEX IF NOT EXISTS pricing_config_versions_ativa_por_empresa
    ON public.pricing_config_versions (empresa_id) WHERE is_active = true;

  -- relatorio_settings: deixa de ser singleton
  UPDATE public.relatorio_settings SET empresa_id = 'e0000001-0000-4000-8000-000000000001' WHERE empresa_id IS NULL;
  ALTER TABLE public.relatorio_settings ALTER COLUMN empresa_id SET NOT NULL;
  ALTER TABLE public.relatorio_settings DROP CONSTRAINT IF EXISTS relatorio_settings_singleton;
  CREATE SEQUENCE IF NOT EXISTS public.relatorio_settings_id_seq START 2 OWNED BY public.relatorio_settings.id;
  PERFORM setval('public.relatorio_settings_id_seq', greatest((SELECT coalesce(max(id), 1) FROM public.relatorio_settings), 1));
  ALTER TABLE public.relatorio_settings ALTER COLUMN id SET DEFAULT nextval('public.relatorio_settings_id_seq');
  CREATE UNIQUE INDEX IF NOT EXISTS relatorio_settings_empresa_uniq ON public.relatorio_settings (empresa_id);

  -- pdv_config: empresa_id; linha com loja_id NULL = padrão da empresa (a id=1 atual = Empresa 1)
  ALTER TABLE public.pdv_config ADD COLUMN IF NOT EXISTS empresa_id uuid NULL REFERENCES public.empresas(id);
  UPDATE public.pdv_config pc SET empresa_id = l.empresa_id FROM public.lojas l
   WHERE pc.loja_id = l.id AND pc.empresa_id IS NULL;
  UPDATE public.pdv_config SET empresa_id = 'e0000001-0000-4000-8000-000000000001'
   WHERE empresa_id IS NULL AND loja_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS pdv_config_padrao_por_empresa ON public.pdv_config (empresa_id) WHERE loja_id IS NULL;
END $$;

CREATE OR REPLACE FUNCTION internal.tg_pdv_config_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.loja_id IS NOT NULL THEN
    NEW.empresa_id := (SELECT empresa_id FROM public.lojas WHERE id = NEW.loja_id);
  ELSIF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := internal.fp_empresa_padrao();
  END IF;
  IF NEW.empresa_id IS NULL AND EXISTS (SELECT 1 FROM public.empresas) THEN
    RAISE EXCEPTION 'EMPRESA_ID_OBRIGATORIA: pdv_config' USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_pdv_config_empresa() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_pdv_config_empresa ON public.pdv_config;
CREATE TRIGGER trg_pdv_config_empresa BEFORE INSERT OR UPDATE OF loja_id, empresa_id ON public.pdv_config
  FOR EACH ROW EXECUTE FUNCTION internal.tg_pdv_config_empresa();

-- guarda do pdv_config: linha de loja ⇒ loja; linha padrão ⇒ empresa
SELECT internal.fp_aplicar_guarda('pdv_config', 'L|E',
  'CASE WHEN loja_id IS NOT NULL THEN public.fp_pode_loja(loja_id::uuid, NULL) ELSE public.fp_pode_empresa(empresa_id) END',
  'empresa_id');

-- Linha de pdv_config a usar: a padrão da empresa da operação (cliente 1 ⇒ id = 1, como antes).
CREATE OR REPLACE FUNCTION public.fp_pdv_config_id(p_loja uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT pc.id FROM public.pdv_config pc
   WHERE pc.loja_id IS NULL AND pc.empresa_id = public.fp_empresa_contexto(p_loja)
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fp_pdv_config_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_pdv_config_id(uuid) TO authenticated, service_role;

-- Configuração padrão para empresa nova (provisionamento) — valores do seed original, nunca os do cliente 1.
CREATE OR REPLACE FUNCTION internal.fp_semear_config_empresa(p_empresa uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id integer;
BEGIN
  INSERT INTO public.configuracoes_gerais (empresa_id, chave, valor, tipo_dado, descricao) VALUES
    (p_empresa, 'comissao_padrao_percentual', '5.00', 'percent', 'Comissão padrão para vendedores (%)'),
    (p_empresa, 'desconto_maximo_operador_percentual', '10.00', 'percent', 'Desconto máximo na venda sem validação de gerente (somatório linhas, %)'),
    (p_empresa, 'cancelamento_maximo_valor_sem_gerente', '500.00', 'money', 'Reservado: limite de cancelamento de venda sem gerente (R$)'),
    (p_empresa, 'estoque_minimo_padrao', '10', 'integer', 'Estoque mínimo padrão'),
    (p_empresa, 'lead_time_min_dias', '30', 'integer', 'Lead time mínimo de importação (dias)'),
    (p_empresa, 'lead_time_max_dias', '60', 'integer', 'Lead time máximo de importação (dias)'),
    (p_empresa, 'vendas_suspensas', 'false', 'text', 'Vendas suspensas'),
    (p_empresa, 'motivo_suspensao', '', 'text', 'Motivo da suspensão')
  ON CONFLICT (empresa_id, chave) DO NOTHING;
  INSERT INTO public.relatorio_settings (empresa_id) VALUES (p_empresa) ON CONFLICT (empresa_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE empresa_id = p_empresa AND loja_id IS NULL) THEN
    LOCK TABLE public.pdv_config IN SHARE ROW EXCLUSIVE MODE;
    SELECT coalesce(max(id), 0) + 1 INTO v_id FROM public.pdv_config;
    INSERT INTO public.pdv_config (id, empresa_id, loja_id, gerente_id, gerente_senha_sha256)
    VALUES (v_id, p_empresa, NULL, 'empresa-' || left(p_empresa::text, 8), '');
  END IF;
END $$;
REVOKE ALL ON FUNCTION internal.fp_semear_config_empresa(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION internal.tg_empresa_semear_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM internal.fp_semear_config_empresa(NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_empresa_semear_config() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_empresa_semear_config ON public.empresas;
CREATE TRIGGER trg_empresa_semear_config AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION internal.tg_empresa_semear_config();

-- empresas já existentes além da 1 (staging/homologação)
DO $$ DECLARE e uuid; BEGIN
  FOR e IN SELECT id FROM public.empresas WHERE id <> 'e0000001-0000-4000-8000-000000000001' LOOP
    PERFORM internal.fp_semear_config_empresa(e);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Leituras de config passam a ser da empresa da operação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  cfg_ctx constant text := 'FROM public.configuracoes_gerais c JOIN (SELECT public.fp_empresa_contexto(NULL) AS e) fp_ctx ON c.empresa_id = fp_ctx.e';
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- pdv_config (linha padrão da empresa)
    ('public.obter_limite_sangria_sem_gerente()',
      '[["WHERE pc.id = 1", "WHERE pc.id = public.fp_pdv_config_id(NULL)"]]'),
    ('public.pdv_config_para_caixa_web()',
      '[["WHERE p.id = 1", "WHERE p.id = public.fp_pdv_config_id(NULL)"]]'),
    ('public.pdv_config_flags_visuais()',
      '[["WHERE p.id = 1", "WHERE p.id = public.fp_pdv_config_id(NULL)"]]'),
    ('internal.registrar_movimentacao(uuid, text, text, numeric, text, text, text, uuid, text, inet, text, text, text, uuid, uuid)',
      '[["WHERE pc.id = 1;", "WHERE pc.id = public.fp_pdv_config_id(public.fp_loja_de(''caixa'', p_caixa_id));"]]'),
    ('internal.obter_status_caixa_operador(uuid)',
      '[["FROM public.pdv_config p WHERE p.id = 1", "FROM public.pdv_config p WHERE p.id = public.fp_pdv_config_id(public.fp_loja_de(''usuario'', p_operador_id))"]]'),
    ('internal.pdv_registrar_alertas_margem_venda(uuid)',
      '[["FROM public.pdv_config p WHERE p.id = 1", "FROM public.pdv_config p WHERE p.id = public.fp_pdv_config_id(public.fp_loja_de(''venda'', p_venda_id))"]]'),
    ('public.trg_fn_itens_venda_limite_desconto()',
      '[["WHERE  id = 1;", "WHERE  id = public.fp_pdv_config_id(public.fp_loja_de(''venda'', NEW.venda_id));"]]'),
    -- configuracoes_gerais
    ('internal.apurar_comissao_original(uuid)',
      '[["WHERE cg.chave = ''comissao_padrao_percentual'' LIMIT 1", "WHERE cg.chave = ''comissao_padrao_percentual'' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''venda'', p_venda_id)) LIMIT 1"]]'),
    ('internal.resolver_comissao_itens_venda(uuid)',
      '[["WHERE cg.chave = ''comissao_padrao_percentual'' LIMIT 1", "WHERE cg.chave = ''comissao_padrao_percentual'' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''venda'', p_venda_id)) LIMIT 1"]]'),
    ('internal.calcular_comissao_venda(uuid, boolean)',
      '[["WHERE cg.chave = ''comissao_padrao_percentual'' LIMIT 1", "WHERE cg.chave = ''comissao_padrao_percentual'' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''venda'', p_venda_id)) LIMIT 1"]]'),
    ('public.trg_fn_vendas_caixa_aberto()',
      '[["WHERE c.chave = ''vendas_suspensas'';", "WHERE c.chave = ''vendas_suspensas'' AND c.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''caixa'', NEW.caixa_id));"]]'),
    -- pricing
    ('public.obter_pricing_version_ativa()',
      '[["WHERE is_active = true", "WHERE is_active = true AND empresa_id = public.fp_empresa_contexto(NULL)"]]'),
    ('internal.registrar_pricing_version_venda(uuid, uuid)',
      '[["AND pcv.is_active = true;", "AND pcv.is_active = true AND pcv.empresa_id = public.fp_empresa_contexto(public.fp_loja_de(''venda'', p_venda_id));"]]'),
    -- revisão das pendentes
    ('public.financeiro_comando_v1(text, jsonb, uuid)',
      '[["FROM public.categorias_financeiras WHERE ", "FROM public.categorias_financeiras WHERE categorias_financeiras.empresa_id = public.fp_empresa_da_loja(l) AND "]]'),
    ('public.financeiro_painel(date, date, integer)',
      '[["FROM public.categorias_financeiras ORDER BY nome", "FROM public.categorias_financeiras WHERE empresa_id = public.fp_empresa_da_loja(l) ORDER BY nome"]]'),
    ('public.pdv_diagnostico_pre_producao(text)',
      '[["FROM public.produtos p", "FROM public.produtos p JOIN public.fp_lojas_permitidas(NULL) fp_perm(lj) ON fp_perm.lj = p.loja_id"],
        ["FROM public.configuracoes_gerais c", "FROM public.configuracoes_gerais c JOIN (SELECT public.fp_empresa_contexto(NULL) AS e) fp_ctx ON c.empresa_id = fp_ctx.e"]]'),
    -- venda / estoque com loja explícita
    ('public.finalizar_venda_transacional_canonica_v4_unscoped(' || (SELECT oidvectortypes(p.proargtypes) FROM pg_proc p
        WHERE p.proname = 'finalizar_venda_transacional_canonica_v4_unscoped' AND p.pronamespace = 'public'::regnamespace LIMIT 1) || ')',
      '[["FROM public.pdv_config WHERE id = 1;", "FROM public.pdv_config WHERE id = public.fp_pdv_config_id(p_loja_id);"]]'),
    ('public.finalizar_venda_transacional(uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric)',
      '[["WHERE  id = 1;", "WHERE  id = public.fp_pdv_config_id(public.fp_loja_de(''caixa'', p_caixa_id));"]]'),
    ('internal.obter_estoque_disponivel_transferencia(' || (SELECT oidvectortypes(p.proargtypes) FROM pg_proc p
        WHERE p.proname = 'obter_estoque_disponivel_transferencia' AND p.pronamespace = 'internal'::regnamespace LIMIT 1) || ')',
      '[["CROSS JOIN public.pdv_config pc", "LEFT JOIN public.pdv_config pc ON pc.id = public.fp_pdv_config_id(p_loja_id)"]]'),
    ('internal.transferir_estoque_seguro(' || (SELECT oidvectortypes(p.proargtypes) FROM pg_proc p
        WHERE p.proname = 'transferir_estoque_seguro' AND p.pronamespace = 'internal'::regnamespace LIMIT 1) || ')',
      '[["CROSS JOIN public.pdv_config pc", "LEFT JOIN public.pdv_config pc ON pc.id = public.fp_pdv_config_id(p_loja_origem)"]]')
  ) AS x(assinatura, trocas) LOOP
    PERFORM internal.fp_reescrever(r.assinatura, r.trocas::jsonb);
  END LOOP;

  -- alias `c` + contexto do chamador
  PERFORM internal.fp_reescrever('public.configuracoes_para_caixa_web()',
    jsonb_build_array(jsonb_build_array('FROM public.configuracoes_gerais c', cfg_ctx)));
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Revisão documentada (o teste de cobertura exige envelope OU este comentário)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.fp_comentarios_originais (
  assinatura text PRIMARY KEY,
  comentario text NULL
);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.financeiro_comando(text, jsonb, uuid)', 'loja = internal.financeiro_loja() (usuarios.loja_id do auth.uid, perfil gerencial); toda entidade do payload filtrada por essa loja; categorias por empresa (financeiro_comando_v1)'),
    ('public.financeiro_comando_operacional(text, jsonb, uuid)', 'loja = internal.financeiro_loja(); conta/caixa do payload filtrados por loja_id = loja do usuário'),
    ('public.financeiro_painel(date, date, integer)', 'loja = internal.financeiro_loja(); categorias_financeiras filtradas pela empresa da loja'),
    ('public.listar_caixas_elegiveis_desembolso()', 'caixas da loja do próprio usuário (usuarios.loja_id do auth.uid)'),
    ('public.listar_vendas_em_espera()', 'só vendas em espera do próprio operador (operador_id = auth.uid)'),
    ('public.pdv_diagnostico_pre_producao(text)', 'produtos só das lojas permitidas; config da empresa do usuário; restante é metadado do banco'),
    ('public.configuracoes_para_caixa_web()', 'configuracoes_gerais da empresa do usuário (fp_empresa_contexto)'),
    ('public.pdv_config_para_caixa_web()', 'pdv_config padrão da empresa do usuário (fp_pdv_config_id)'),
    ('public.pdv_config_flags_visuais()', 'pdv_config padrão da empresa do usuário (fp_pdv_config_id)'),
    ('public.obter_limite_sangria_sem_gerente()', 'pdv_config padrão da empresa do usuário (fp_pdv_config_id)'),
    ('public.obter_pricing_version_ativa()', 'versão ativa da empresa do usuário (índice único por empresa)'),
    ('public.is_feature_enabled(text)', 'feature flag global da plataforma, sem dado de cliente')
  ) AS x(assinatura, motivo) LOOP
    IF to_regprocedure(r.assinatura) IS NOT NULL THEN
      INSERT INTO internal.fp_comentarios_originais (assinatura, comentario)
      VALUES (r.assinatura, obj_description(to_regprocedure(r.assinatura), 'pg_proc'))
      ON CONFLICT (assinatura) DO NOTHING;
      EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.assinatura, 'Multiempresa revisado (20261019150000): ' || r.motivo);
    ELSE
      RAISE NOTICE 'multiempresa fase3: % ausente para comentário', r.assinatura;
    END IF;
  END LOOP;
END $$;

COMMIT;
$golive_stmt_1da80a714c49$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:260:5c1f5a5067490828724c7e6793e90486itens_venda:265:8c5a0c68d26d3683324ab4398a339663vendas_pagamentos:108:0a473fb3507497a004a8939017d6b319caixas:56:a6e57b48a99c3bfdc2ababb690273a69movimentacoes_caixa:11:2b75d41eb7791147043b68015c89c0bdestoque:152:8f192671704ed300a97bf971f5aee4a9produtos:155:ce12eba23be390e38a178815fc4775c7usuarios:11:c3771aebcbf5642fa549d05fcb882a47clientes:2:88eb3c9ee632ac0dbbe5a6eb00b1f5b0lojas:1:c9488d2a43396d63bb7b482208a72fceformas_pagamento:4:7e3fee7650f570993c242c9513012e19contas_financeiras:0:-contas_pagar:9:541b1dc81dc7b94c4658301b64af6585contas_receber:3:a8c78e9630e752753334b8b4bbf76cadpdv_config:2:56a096d60214c463df2cfcc6b5b9ef23documentos_fiscais_pendentes:42:638d9052af1666def9bd7513e9d8b809totais:b5381bb6313900060b277d41cd1d490c|260|19364.60|11048.90|14053.10|32304.095$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261019150000: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261019150000', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019150000' AND name='multiempresa_fase3_config') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261019150000'; END IF;
END $chk$;
COMMIT;
