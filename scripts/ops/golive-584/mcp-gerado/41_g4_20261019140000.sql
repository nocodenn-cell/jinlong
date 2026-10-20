-- golive-final-584 :: 20261019140000 multiempresa_fase2_guardas :: sha256 69e276b3cc5ab4d0d09b743ee1d721bc3f96dba303fb1e15b7b72bbfb3badfae
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019140000') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261019140000'; END IF; END $g$;
-- 20261019140000_multiempresa_fase2_guardas.sql
-- Multiempresa Fase 2 — ESPEC_MULTIEMPRESA_V1 etapas 5–8 (+ apoio às etapas 9 e D6).
-- ADITIVA E REVERSÍVEL. Rollback: backend/supabase/rollback/20261019140000_multiempresa_fase2_guardas.rollback.sql
--
--  1. helpers de escopo para linhas sem loja e para resolver a loja de uma entidade (venda, caixa, ...);
--  2. empresa_id + backfill (Empresa 1) + preenchimento automático nas tabelas de EMPRESA
--     (categorias, marcas, regras_preco, categorias_financeiras, pricing_config_versions,
--      configuracoes_gerais, relatorio_settings) e em lojas;
--  3. guarda RESTRICTIVE `tenant_guard` em TODAS as tabelas de dados de cliente (L, L-nulável, J, E, R, V);
--  4. RPCs SECURITY DEFINER expostas a `authenticated` que recebem loja/entidade: envelope que exige
--     escopo (fp_pode_loja) antes de executar o corpo original (movido para o schema `internal`, intacto);
--     transferência exige origem permitida E mesma empresa no destino (P0);
--  5. vincular_usuario_loja (cadastro de funcionário grava vínculo) e fp_usuario_pode_loja (sync valida operador);
--  6. ativação do PDV com limite de tentativas (ativar_dispositivo_pdv_v2).
-- Tolerante a drift: tabela/coluna/função inexistente no ambiente ⇒ NOTICE e segue.
-- Cliente 1 (uma empresa): linhas sem loja continuam visíveis para quem é da Empresa 1; chamadas
-- "todas as lojas" (p_loja_id NULL) continuam aceitas enquanto só existir UMA empresa (D10).


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- Contexto de servidor confiável (service_role ou conexão sem JWT, ex.: cron/migração) — igual à RLS,
-- que já não se aplica a esses papéis.
CREATE OR REPLACE FUNCTION internal.fp_contexto_servidor()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
         ) = 'service_role'
      OR (auth.uid() IS NULL
          AND coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                       (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')
              NOT IN ('anon', 'authenticated'));
$$;

CREATE OR REPLACE FUNCTION public.fp_admin_legado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = (SELECT auth.uid()) AND u.ativo AND u.perfil = 'ADMIN');
$$;

-- Linha/chamada SEM loja: dado legado do cliente 1. Visível só para quem é da Empresa 1 (ou ADMIN legado).
-- Nunca "global" para outra empresa (D18).
CREATE OR REPLACE FUNCTION public.fp_pode_loja_nula(p_loja uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_loja IS NOT NULL THEN public.fp_pode_loja(p_loja, NULL)
    ELSE public.fp_admin_legado()
      OR 'e0000001-0000-4000-8000-000000000001'::uuid IN (SELECT public.fp_empresas_do_usuario())
  END;
$$;

CREATE OR REPLACE FUNCTION public.fp_pode_empresa(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fp_admin_legado()
      OR (p_empresa IS NOT NULL AND p_empresa IN (SELECT public.fp_empresas_do_usuario()));
$$;

-- Loja dona de uma entidade. NULL se não existe / sem loja.
CREATE OR REPLACE FUNCTION public.fp_loja_de(p_tipo text, p_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid;
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  CASE p_tipo
    WHEN 'loja' THEN v := p_id;
    WHEN 'caixa' THEN SELECT loja_id INTO v FROM public.caixas WHERE id = p_id;
    WHEN 'venda' THEN SELECT c.loja_id INTO v FROM public.vendas x JOIN public.caixas c ON c.id = x.caixa_id WHERE x.id = p_id;
    WHEN 'produto' THEN SELECT loja_id INTO v FROM public.produtos WHERE id = p_id;
    WHEN 'documento_fiscal' THEN
      SELECT c.loja_id INTO v FROM public.documentos_fiscais_pendentes d
        JOIN public.vendas x ON x.id = d.venda_id JOIN public.caixas c ON c.id = x.caixa_id WHERE d.id = p_id;
    WHEN 'operacao_pos_venda' THEN
      SELECT c.loja_id INTO v FROM public.venda_pos_venda_operacoes o
        JOIN public.vendas x ON x.id = o.venda_id JOIN public.caixas c ON c.id = x.caixa_id WHERE o.id = p_id;
    WHEN 'comissao' THEN SELECT loja_id INTO v FROM public.comissoes_vendedores WHERE id = p_id;
    WHEN 'comissao_pagamento' THEN SELECT loja_id INTO v FROM public.comissoes_pagamentos WHERE id = p_id;
    WHEN 'comissao_regra' THEN SELECT loja_id INTO v FROM public.comissoes_regras_funcionario WHERE id = p_id;
    WHEN 'importacao_nfe' THEN SELECT loja_id INTO v FROM public.importacoes_nfe WHERE id = p_id;
    WHEN 'ordem_compra' THEN SELECT loja_id INTO v FROM public.ordens_compra WHERE id = p_id;
    WHEN 'remessa' THEN SELECT loja_id INTO v FROM public.remessas WHERE id = p_id;
    WHEN 'movimento_estoque' THEN SELECT loja_id INTO v FROM public.movimentos_estoque_log WHERE id = p_id;
    WHEN 'conta_pagar' THEN SELECT loja_id INTO v FROM public.contas_pagar WHERE id = p_id;
    WHEN 'conta_receber' THEN SELECT loja_id INTO v FROM public.contas_receber WHERE id = p_id;
    WHEN 'liquidacao_receber' THEN SELECT loja_id INTO v FROM public.liquidacoes_receber WHERE id = p_id;
    WHEN 'pagamento_conta_pagar' THEN SELECT loja_id INTO v FROM public.contas_pagar_pagamentos WHERE id = p_id;
    WHEN 'venda_em_espera' THEN SELECT loja_id INTO v FROM public.vendas_em_espera WHERE id = p_id;
    WHEN 'extrato' THEN SELECT loja_id INTO v FROM public.extratos_financeiros WHERE id = p_id;
    WHEN 'usuario' THEN SELECT loja_id INTO v FROM public.usuarios WHERE id = p_id;
    WHEN 'movimentacao_caixa' THEN
      SELECT coalesce(m.loja_id, c.loja_id) INTO v FROM public.movimentacoes_caixa m
        LEFT JOIN public.caixas c ON c.id = m.caixa_id WHERE m.id = p_id;
    ELSE RAISE EXCEPTION 'FP_LOJA_DE_TIPO_INVALIDO: %', p_tipo;
  END CASE;
  RETURN v;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RETURN NULL; -- drift: tabela/coluna ausente no ambiente
END $$;

-- Asserções usadas pelos envelopes de RPC (§8). Contexto de servidor passa direto.
CREATE OR REPLACE FUNCTION public.fp_assert_loja(p_loja uuid, p_direta boolean, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF internal.fp_contexto_servidor() THEN RETURN true; END IF;
  IF p_loja IS NULL THEN
    IF NOT p_direta THEN RETURN true; END IF; -- entidade inexistente: o corpo original decide (não-encontrado)
    -- "todas as lojas": só enquanto houver UMA empresa (cliente 1) ou ADMIN legado.
    IF public.fp_admin_legado() OR ((SELECT count(*) FROM public.empresas) <= 1 AND public.fp_pode_loja_nula(NULL)) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'ACESSO_LOJA_OBRIGATORIA: %', p_rotulo USING ERRCODE = '42501';
  END IF;
  IF NOT public.fp_pode_loja(p_loja, NULL) THEN
    RAISE EXCEPTION 'ACESSO_LOJA_NEGADO: %', p_rotulo USING ERRCODE = '42501';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fp_assert_mesma_empresa(p_a uuid, p_b uuid, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF internal.fp_contexto_servidor() OR p_a IS NULL OR p_b IS NULL THEN RETURN true; END IF;
  IF NOT public.fp_mesma_empresa(p_a, p_b) THEN
    RAISE EXCEPTION 'ACESSO_EMPRESA_INVALIDA: %', p_rotulo USING ERRCODE = '42501';
  END IF;
  RETURN true;
END $$;

-- Empresa para INSERT sem empresa_id: a única empresa do usuário; em contexto de servidor, a única
-- empresa do sistema (cliente 1). Ambíguo ⇒ NULL ⇒ a guarda recusa (falha fechada).
CREATE OR REPLACE FUNCTION internal.fp_empresa_padrao()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid[];
BEGIN
  v := ARRAY(SELECT public.fp_empresas_do_usuario());
  IF array_length(v, 1) = 1 THEN RETURN v[1]; END IF;
  IF (SELECT count(*) FROM public.empresas) = 1 THEN RETURN (SELECT id FROM public.empresas LIMIT 1); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION internal.tg_preenche_empresa_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN NEW.empresa_id := internal.fp_empresa_padrao(); END IF;
  IF NEW.empresa_id IS NULL AND EXISTS (SELECT 1 FROM public.empresas) THEN
    -- Mais de uma empresa e nenhuma dedutível (ex.: service_role sem empresa_id): erro explícito
    -- em vez de linha órfã invisível.
    RAISE EXCEPTION 'EMPRESA_ID_OBRIGATORIA: %', TG_TABLE_NAME USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END $$;

-- Serviço: o usuário (não o chamador) pode atuar na loja? Usado pelo sync (operador da venda)
-- e por vincular_usuario_loja (ator do cadastro).
CREATE OR REPLACE FUNCTION public.fp_usuario_pode_loja(p_usuario uuid, p_loja uuid, p_papeis text[] DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_usuario IS NOT NULL AND p_loja IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.usuario_vinculos v
      JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
      JOIN public.lojas l ON l.id = p_loja AND l.empresa_id = v.empresa_id
     WHERE v.usuario_id = p_usuario AND v.ativo
       AND (v.papel = 'DONO' OR v.loja_id = p_loja)
       AND (p_papeis IS NULL OR v.papel = ANY (p_papeis)));
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.fp_admin_legado()', 'public.fp_pode_loja_nula(uuid)', 'public.fp_pode_empresa(uuid)',
    'public.fp_loja_de(text, uuid)', 'public.fp_assert_loja(uuid, boolean, text)',
    'public.fp_assert_mesma_empresa(uuid, uuid, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  REVOKE ALL ON FUNCTION public.fp_usuario_pode_loja(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.fp_usuario_pode_loja(uuid, uuid, text[]) TO service_role;
  REVOKE ALL ON FUNCTION internal.fp_contexto_servidor() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION internal.fp_contexto_servidor() TO authenticated, service_role, anon;
  REVOKE ALL ON FUNCTION internal.fp_empresa_padrao(), internal.tg_preenche_empresa_id() FROM PUBLIC;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. empresa_id nas tabelas de EMPRESA (D4/D12/D13) + lojas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categorias', 'marcas', 'regras_preco', 'categorias_financeiras',
                           'pricing_config_versions', 'configuracoes_gerais', 'relatorio_settings'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'multiempresa fase2: tabela % ausente, pulando empresa_id', t; CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_id uuid NULL REFERENCES public.empresas(id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (empresa_id)', t || '_empresa_id_idx', t);
    EXECUTE format('UPDATE public.%I SET empresa_id = %L WHERE empresa_id IS NULL AND EXISTS (SELECT 1 FROM public.empresas WHERE id = %L)',
                   t, 'e0000001-0000-4000-8000-000000000001', 'e0000001-0000-4000-8000-000000000001');
    EXECUTE format('DROP TRIGGER IF EXISTS trg_preenche_empresa_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_preenche_empresa_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION internal.tg_preenche_empresa_id()', t);
  END LOOP;
  DROP TRIGGER IF EXISTS trg_preenche_empresa_id ON public.lojas;
  CREATE TRIGGER trg_preenche_empresa_id BEFORE INSERT ON public.lojas
    FOR EACH ROW EXECUTE FUNCTION internal.tg_preenche_empresa_id();
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Guardas RESTRICTIVE. Registro em internal.fp_tenant_guardas (fonte do teste de cobertura e do rollback).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.fp_tenant_guardas (
  tabela text PRIMARY KEY,
  classe text NOT NULL,
  expressao text NOT NULL,
  aplicada boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION internal.fp_aplicar_guarda(p_tabela text, p_classe text, p_expr text, p_coluna text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF to_regclass('public.' || p_tabela) IS NULL
     OR (p_coluna IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = p_tabela AND column_name = p_coluna)) THEN
    RAISE NOTICE 'multiempresa fase2: %.% ausente, guarda não aplicada', p_tabela, coalesce(p_coluna, '*');
    INSERT INTO internal.fp_tenant_guardas (tabela, classe, expressao, aplicada) VALUES (p_tabela, p_classe, p_expr, false)
      ON CONFLICT (tabela) DO UPDATE SET classe = EXCLUDED.classe, expressao = EXCLUDED.expressao, aplicada = false;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_tabela);
  EXECUTE format('DROP POLICY IF EXISTS tenant_guard ON public.%I', p_tabela);
  EXECUTE format('CREATE POLICY tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
                 p_tabela, p_expr, p_expr);
  INSERT INTO internal.fp_tenant_guardas (tabela, classe, expressao, aplicada) VALUES (p_tabela, p_classe, p_expr, true)
    ON CONFLICT (tabela) DO UPDATE SET classe = EXCLUDED.classe, expressao = EXCLUDED.expressao, aplicada = true;
END $$;
REVOKE ALL ON FUNCTION internal.fp_aplicar_guarda(text, text, text, text) FROM PUBLIC;

DO $$
DECLARE t text; r record;
BEGIN
  -- L — loja direta (NOT NULL). fornecedores, contas_receber e itens_venda já têm guarda desde a fase 1.
  FOREACH t IN ARRAY ARRAY['caixas', 'clientes', 'comissoes_ajustes', 'comissoes_pagamentos', 'comissoes_regras_funcionario',
    'comissoes_vendedores', 'conciliacoes_financeiras', 'contas_financeiras', 'contas_pagar',
    'entrada_documentos', 'estoque', 'extratos_financeiros', 'financeiro_comandos', 'financeiro_contas_forma',
    'financeiro_recebiveis_venda', 'fiscal_provider_config', 'formas_pagamento', 'funcionarios',
    'funcionarios_meta', 'implantacao_checklist_itens', 'implantacao_checklists', 'importacoes_nfe',
    'movimentos_estoque_log', 'movimentos_financeiros', 'ordens_compra', 'ordens_compra_recebimentos',
    'produto_create_requests', 'produtos', 'remessas', 'tokens_autorizacao_operacao', 'venda_eventos',
    'vendas_em_espera', 'vinculos_fornecedor_produto'] LOOP
    PERFORM internal.fp_aplicar_guarda(t, 'L', 'public.fp_pode_loja(loja_id::uuid, NULL)', 'loja_id');
  END LOOP;

  -- L nulável — NULL = legado do cliente 1 (§12)
  FOREACH t IN ARRAY ARRAY['cadastro_produto_telemetry_events', 'contas_pagar_pagamentos', 'liquidacoes_receber',
    'pdv_config', 'system_alerts', 'tokens_desconto_gerente'] LOOP
    PERFORM internal.fp_aplicar_guarda(t, 'L?', 'public.fp_pode_loja_nula(loja_id::uuid)', 'loja_id');
  END LOOP;

  -- J — loja pela entidade-pai (sem coluna nova)
  FOR r IN SELECT * FROM (VALUES
    ('vendas', 'caixa', 'caixa_id'), ('movimentacoes_caixa', 'caixa', 'caixa_id'), ('movimentos_caixa', 'caixa', 'caixa_id'),
    ('caixas_fechamento_formas', 'caixa', 'caixa_id'), ('vendas_canceladas_auditoria', 'caixa', 'caixa_id'),
    ('descontos_venda', 'venda', 'venda_id'), ('devolucoes', 'venda', 'venda_id'),
    ('documentos_fiscais_pendentes', 'venda', 'venda_id'), ('estoque_baixas', 'venda', 'venda_id'),
    ('estoque_reposicoes_cancelamento', 'venda', 'venda_id'), ('vendas_pagamentos', 'venda', 'venda_id'),
    ('venda_pos_venda_operacoes', 'venda', 'venda_id'),
    ('documentos_fiscais_dlq', 'documento_fiscal', 'documento_id'), ('documentos_fiscais_eventos', 'documento_fiscal', 'documento_id'),
    ('estoque_reposicoes_devolucao', 'operacao_pos_venda', 'operacao_id'), ('venda_pos_venda_itens', 'operacao_pos_venda', 'operacao_id'),
    ('comissoes_itens', 'comissao', 'comissao_id'), ('comissoes_pagamentos_ajustes', 'comissao_pagamento', 'pagamento_id'),
    ('comissoes_regras_historico', 'comissao_regra', 'regra_id'),
    ('importacoes_nfe_duplicatas', 'importacao_nfe', 'importacao_nfe_id'), ('importacoes_nfe_itens', 'importacao_nfe', 'importacao_nfe_id'),
    ('ordens_compra_itens', 'ordem_compra', 'ordem_id'), ('remessa_itens', 'remessa', 'remessa_id'),
    ('historico_precos_produto', 'produto', 'produto_id'), ('historico_tiers_crud', 'produto', 'produto_id'),
    ('transferencias_idempotencia', 'movimento_estoque', 'transferencia_id')
  ) AS x(tabela, tipo, coluna) LOOP
    PERFORM internal.fp_aplicar_guarda(r.tabela, 'J:' || r.tipo,
      format('public.fp_pode_loja_nula(public.fp_loja_de(%L, %I::uuid))', r.tipo, r.coluna), r.coluna);
  END LOOP;

  -- precos_atacado (D15): produto visível E (padrão da empresa OU override de loja permitida)
  PERFORM internal.fp_aplicar_guarda('precos_atacado', 'L+produto',
    'public.fp_pode_loja(public.fp_loja_de(''produto'', produto_id::uuid), NULL) AND (loja_id IS NULL OR public.fp_pode_loja(loja_id::uuid, NULL))',
    'produto_id');

  -- E — empresa
  FOREACH t IN ARRAY ARRAY['categorias', 'marcas', 'regras_preco', 'categorias_financeiras',
                           'pricing_config_versions', 'configuracoes_gerais', 'relatorio_settings'] LOOP
    PERFORM internal.fp_aplicar_guarda(t, 'E', 'public.fp_pode_empresa(empresa_id)', 'empresa_id');
  END LOOP;

  -- R — lojas (raiz)
  PERFORM internal.fp_aplicar_guarda('lojas', 'R',
    'public.fp_pode_empresa(empresa_id) OR public.fp_pode_loja(id, NULL)', 'empresa_id');

  -- V — usuarios: o próprio, ADMIN legado, ou quem pode a loja do usuário
  PERFORM internal.fp_aplicar_guarda('usuarios', 'V',
    'id = (SELECT auth.uid()) OR public.fp_pode_loja_nula(loja_id::uuid)', 'loja_id');
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Envelopes de escopo nas RPCs SECURITY DEFINER expostas a authenticated (§8, etapas 5 e 8)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.fp_rpc_envelopes (
  assinatura text PRIMARY KEY,            -- public.nome(identity args)
  nome text NOT NULL,
  identidade text NOT NULL,
  grantees text[] NOT NULL,               -- roles com EXECUTE antes (para o rollback)
  checagens text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  f record; a record;
  v_tipo text; v_checks text[]; v_call text[]; v_body text; v_grants text[]; v_role text;
  v_origem text; v_destino text; v_out boolean; v_ident text; v_sig text;
  v_mapa constant jsonb := '{
    "p_loja_id":"loja","p_loja_origem":"loja","p_loja_destino":"loja","p_loja_origem_id":"loja","p_loja_destino_id":"loja",
    "p_caixa_id":"caixa","p_caixa_fechado_id":"caixa","p_venda_id":"venda","p_venda_substituta_id":"venda",
    "p_produto_id":"produto","p_remessa_id":"remessa","p_remessa":"remessa","p_ordem_compra_id":"ordem_compra",
    "p_ordem_id":"ordem_compra","p_importacao_id":"importacao_nfe","p_importacao":"importacao_nfe",
    "p_importacao_nfe_id":"importacao_nfe","p_documento_id":"documento_fiscal","p_conta_id":"conta_pagar",
    "p_titulo_id":"conta_receber","p_movimentacao_id":"movimentacao_caixa",
    "p_movimentacao_origem_id":"movimentacao_caixa","p_oc_id":"ordem_compra","p_liquidacao_id":"liquidacao_receber",
    "p_extrato":"extrato","p_operador_id":"usuario",
    "estornar_pagamento_contas_pagar.p_pagamento_id":"pagamento_conta_pagar",
    "converter_venda_em_espera.p_id":"venda_em_espera","descartar_venda_em_espera.p_id":"venda_em_espera",
    "devolver_venda_em_espera.p_id":"venda_em_espera","retomar_venda_em_espera.p_id":"venda_em_espera"}';
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, p.proretset, p.proargnames, p.proargmodes, p.provariadic,
           pg_get_function_identity_arguments(p.oid) AS ident,
           pg_get_function_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS res
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND p.proname !~ '^(fp_|auth_|tg_|trg_)'
       AND p.proargnames IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(p.proargnames) an
                    WHERE v_mapa ? an OR v_mapa ? (p.proname || '.' || an))
     ORDER BY p.proname
  LOOP
    IF f.provariadic <> 0 THEN RAISE NOTICE 'envelope: % variádica, pulando', f.proname; CONTINUE; END IF;
    v_checks := ARRAY[]::text[]; v_call := ARRAY[]::text[]; v_origem := NULL; v_destino := NULL; v_out := false;
    FOR a IN SELECT u.nome, u.ord, coalesce(f.proargmodes[u.ord], 'i') AS modo
               FROM unnest(f.proargnames) WITH ORDINALITY AS u(nome, ord) LOOP
      IF a.modo IN ('o', 't') THEN v_out := true; CONTINUE; END IF;
      IF a.nome IS NULL OR a.nome = '' THEN v_call := NULL; EXIT; END IF;
      v_call := v_call || format('%1$I => %1$I', a.nome);
      v_tipo := coalesce(v_mapa ->> (f.proname || '.' || a.nome), v_mapa ->> a.nome);
      IF v_tipo = 'loja' THEN
        v_checks := v_checks || format('public.fp_assert_loja(%I, true, %L)', a.nome, f.proname || '.' || a.nome);
        IF a.nome IN ('p_loja_origem', 'p_loja_origem_id') THEN v_origem := a.nome; END IF;
        IF a.nome IN ('p_loja_destino', 'p_loja_destino_id') THEN v_destino := a.nome; END IF;
      ELSIF v_tipo IS NOT NULL THEN
        v_checks := v_checks || format('public.fp_assert_loja(public.fp_loja_de(%L, %I), false, %L)',
                                       v_tipo, a.nome, f.proname || '.' || a.nome);
      END IF;
    END LOOP;
    IF v_call IS NULL THEN RAISE NOTICE 'envelope: % com argumento sem nome, pulando', f.proname; CONTINUE; END IF;
    IF v_origem IS NOT NULL AND v_destino IS NOT NULL THEN
      v_checks := v_checks || format('public.fp_assert_mesma_empresa(%I, %I, %L)', v_origem, v_destino, f.proname);
    END IF;

    v_grants := ARRAY[]::text[];
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_function_privilege(v_role, f.oid, 'EXECUTE') THEN v_grants := v_grants || v_role; END IF;
    END LOOP;

    v_sig := format('public.%I(%s)', f.proname, f.ident);
    v_ident := f.ident;
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA internal', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION internal.%I(%s) FROM PUBLIC, anon, authenticated', f.proname, v_ident);

    v_body := 'SELECT ' || array_to_string(v_checks, ' AND ') || ';' || chr(10) ||
      CASE WHEN f.proretset OR v_out OR f.res ~ '^TABLE\('
           THEN format('SELECT * FROM internal.%I(%s);', f.proname, array_to_string(v_call, ', '))
           ELSE format('SELECT internal.%I(%s);', f.proname, array_to_string(v_call, ', ')) END;

    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS %L',
      f.proname, f.args, f.res, v_body);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    FOREACH v_role IN ARRAY v_grants LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_sig, v_role);
    END LOOP;
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', v_sig,
      'Envelope multiempresa (20261019140000): exige escopo de loja/empresa e delega para internal.' || f.proname);

    INSERT INTO internal.fp_rpc_envelopes (assinatura, nome, identidade, grantees, checagens)
    VALUES (v_sig, f.proname, v_ident, v_grants, array_to_string(v_checks, ' AND '))
    ON CONFLICT (assinatura) DO NOTHING;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cadastro de funcionário grava vínculo (servidor) — §11
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vincular_usuario_loja(p_usuario uuid, p_loja uuid, p_papel text, p_ator uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_emp uuid; v_id uuid;
BEGIN
  IF p_papel NOT IN ('GERENTE', 'OPERADOR') THEN RAISE EXCEPTION 'VINCULO_PAPEL_INVALIDO'; END IF;
  SELECT empresa_id INTO v_emp FROM public.lojas WHERE id = p_loja;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'VINCULO_LOJA_SEM_EMPRESA'; END IF;
  IF NOT (public.fp_usuario_pode_loja(p_ator, p_loja, ARRAY['DONO', 'GERENTE'])
          OR EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_ator AND ativo AND perfil = 'ADMIN')) THEN
    RAISE EXCEPTION 'VINCULO_ATOR_SEM_ACESSO_LOJA';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = p_usuario AND ativo AND empresa_id <> v_emp) THEN
    RAISE EXCEPTION 'VINCULO_USUARIO_DE_OUTRA_EMPRESA';
  END IF;
  IF p_papel = 'OPERADOR' THEN
    UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = p_usuario AND empresa_id = v_emp AND papel = 'OPERADOR' AND loja_id <> p_loja AND ativo;
  END IF;
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, created_by)
  VALUES (p_usuario, v_emp, p_loja, p_papel, p_ator)
  ON CONFLICT (usuario_id, empresa_id, papel, COALESCE(loja_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET ativo = true
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.vincular_usuario_loja(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_usuario_loja(uuid, uuid, text, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Ativação do PDV com limite de tentativas (10 falhas / 15 min por computador ou IP)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pdv_ativacao_tentativas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_fingerprint text NOT NULL,
  ip text NULL,
  ok boolean NOT NULL,
  erro text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pdv_ativacao_tentativas_fp_idx ON public.pdv_ativacao_tentativas (device_fingerprint, created_at);
CREATE INDEX IF NOT EXISTS pdv_ativacao_tentativas_ip_idx ON public.pdv_ativacao_tentativas (ip, created_at);
ALTER TABLE public.pdv_ativacao_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_ativacao_tentativas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pdv_ativacao_tentativas TO service_role;

CREATE OR REPLACE FUNCTION public.ativar_dispositivo_pdv_v2(p_codigo text, p_device_fingerprint text, p_nome text DEFAULT NULL, p_ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fp text := lower(btrim(coalesce(p_device_fingerprint, '')));
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_res jsonb; v_err text;
BEGIN
  DELETE FROM public.pdv_ativacao_tentativas WHERE created_at < now() - interval '1 day';
  IF (SELECT count(*) FROM public.pdv_ativacao_tentativas
       WHERE NOT ok AND created_at > now() - interval '15 minutes'
         AND (device_fingerprint = v_fp OR (v_ip IS NOT NULL AND ip = v_ip))) >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ATIVACAO_PDV_BLOQUEADA');
  END IF;
  BEGIN
    v_res := public.ativar_dispositivo_pdv(p_codigo, p_device_fingerprint, p_nome);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  INSERT INTO public.pdv_ativacao_tentativas (device_fingerprint, ip, ok, erro)
  VALUES (left(v_fp, 200), left(v_ip, 64), v_err IS NULL, left(v_err, 200));
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      CASE WHEN v_err LIKE '%ATIVACAO_PDV_FINGERPRINT_INVALIDO%' THEN 'ATIVACAO_PDV_FINGERPRINT_INVALIDO'
           WHEN v_err LIKE '%EMPRESA_NAO_OPERACIONAL%' THEN 'EMPRESA_NAO_OPERACIONAL'
           ELSE 'ATIVACAO_PDV_CODIGO_INVALIDO' END);
  END IF;
  RETURN v_res || jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.ativar_dispositivo_pdv_v2(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_dispositivo_pdv_v2(text, text, text, text) TO service_role;

;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261019140000', 'multiempresa_fase2_guardas', ARRAY[$golive_stmt_69e276b3cc5a$-- 20261019140000_multiempresa_fase2_guardas.sql
-- Multiempresa Fase 2 — ESPEC_MULTIEMPRESA_V1 etapas 5–8 (+ apoio às etapas 9 e D6).
-- ADITIVA E REVERSÍVEL. Rollback: backend/supabase/rollback/20261019140000_multiempresa_fase2_guardas.rollback.sql
--
--  1. helpers de escopo para linhas sem loja e para resolver a loja de uma entidade (venda, caixa, ...);
--  2. empresa_id + backfill (Empresa 1) + preenchimento automático nas tabelas de EMPRESA
--     (categorias, marcas, regras_preco, categorias_financeiras, pricing_config_versions,
--      configuracoes_gerais, relatorio_settings) e em lojas;
--  3. guarda RESTRICTIVE `tenant_guard` em TODAS as tabelas de dados de cliente (L, L-nulável, J, E, R, V);
--  4. RPCs SECURITY DEFINER expostas a `authenticated` que recebem loja/entidade: envelope que exige
--     escopo (fp_pode_loja) antes de executar o corpo original (movido para o schema `internal`, intacto);
--     transferência exige origem permitida E mesma empresa no destino (P0);
--  5. vincular_usuario_loja (cadastro de funcionário grava vínculo) e fp_usuario_pode_loja (sync valida operador);
--  6. ativação do PDV com limite de tentativas (ativar_dispositivo_pdv_v2).
-- Tolerante a drift: tabela/coluna/função inexistente no ambiente ⇒ NOTICE e segue.
-- Cliente 1 (uma empresa): linhas sem loja continuam visíveis para quem é da Empresa 1; chamadas
-- "todas as lojas" (p_loja_id NULL) continuam aceitas enquanto só existir UMA empresa (D10).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- Contexto de servidor confiável (service_role ou conexão sem JWT, ex.: cron/migração) — igual à RLS,
-- que já não se aplica a esses papéis.
CREATE OR REPLACE FUNCTION internal.fp_contexto_servidor()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
         ) = 'service_role'
      OR (auth.uid() IS NULL
          AND coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                       (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')
              NOT IN ('anon', 'authenticated'));
$$;

CREATE OR REPLACE FUNCTION public.fp_admin_legado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = (SELECT auth.uid()) AND u.ativo AND u.perfil = 'ADMIN');
$$;

-- Linha/chamada SEM loja: dado legado do cliente 1. Visível só para quem é da Empresa 1 (ou ADMIN legado).
-- Nunca "global" para outra empresa (D18).
CREATE OR REPLACE FUNCTION public.fp_pode_loja_nula(p_loja uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_loja IS NOT NULL THEN public.fp_pode_loja(p_loja, NULL)
    ELSE public.fp_admin_legado()
      OR 'e0000001-0000-4000-8000-000000000001'::uuid IN (SELECT public.fp_empresas_do_usuario())
  END;
$$;

CREATE OR REPLACE FUNCTION public.fp_pode_empresa(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fp_admin_legado()
      OR (p_empresa IS NOT NULL AND p_empresa IN (SELECT public.fp_empresas_do_usuario()));
$$;

-- Loja dona de uma entidade. NULL se não existe / sem loja.
CREATE OR REPLACE FUNCTION public.fp_loja_de(p_tipo text, p_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid;
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  CASE p_tipo
    WHEN 'loja' THEN v := p_id;
    WHEN 'caixa' THEN SELECT loja_id INTO v FROM public.caixas WHERE id = p_id;
    WHEN 'venda' THEN SELECT c.loja_id INTO v FROM public.vendas x JOIN public.caixas c ON c.id = x.caixa_id WHERE x.id = p_id;
    WHEN 'produto' THEN SELECT loja_id INTO v FROM public.produtos WHERE id = p_id;
    WHEN 'documento_fiscal' THEN
      SELECT c.loja_id INTO v FROM public.documentos_fiscais_pendentes d
        JOIN public.vendas x ON x.id = d.venda_id JOIN public.caixas c ON c.id = x.caixa_id WHERE d.id = p_id;
    WHEN 'operacao_pos_venda' THEN
      SELECT c.loja_id INTO v FROM public.venda_pos_venda_operacoes o
        JOIN public.vendas x ON x.id = o.venda_id JOIN public.caixas c ON c.id = x.caixa_id WHERE o.id = p_id;
    WHEN 'comissao' THEN SELECT loja_id INTO v FROM public.comissoes_vendedores WHERE id = p_id;
    WHEN 'comissao_pagamento' THEN SELECT loja_id INTO v FROM public.comissoes_pagamentos WHERE id = p_id;
    WHEN 'comissao_regra' THEN SELECT loja_id INTO v FROM public.comissoes_regras_funcionario WHERE id = p_id;
    WHEN 'importacao_nfe' THEN SELECT loja_id INTO v FROM public.importacoes_nfe WHERE id = p_id;
    WHEN 'ordem_compra' THEN SELECT loja_id INTO v FROM public.ordens_compra WHERE id = p_id;
    WHEN 'remessa' THEN SELECT loja_id INTO v FROM public.remessas WHERE id = p_id;
    WHEN 'movimento_estoque' THEN SELECT loja_id INTO v FROM public.movimentos_estoque_log WHERE id = p_id;
    WHEN 'conta_pagar' THEN SELECT loja_id INTO v FROM public.contas_pagar WHERE id = p_id;
    WHEN 'conta_receber' THEN SELECT loja_id INTO v FROM public.contas_receber WHERE id = p_id;
    WHEN 'liquidacao_receber' THEN SELECT loja_id INTO v FROM public.liquidacoes_receber WHERE id = p_id;
    WHEN 'pagamento_conta_pagar' THEN SELECT loja_id INTO v FROM public.contas_pagar_pagamentos WHERE id = p_id;
    WHEN 'venda_em_espera' THEN SELECT loja_id INTO v FROM public.vendas_em_espera WHERE id = p_id;
    WHEN 'extrato' THEN SELECT loja_id INTO v FROM public.extratos_financeiros WHERE id = p_id;
    WHEN 'usuario' THEN SELECT loja_id INTO v FROM public.usuarios WHERE id = p_id;
    WHEN 'movimentacao_caixa' THEN
      SELECT coalesce(m.loja_id, c.loja_id) INTO v FROM public.movimentacoes_caixa m
        LEFT JOIN public.caixas c ON c.id = m.caixa_id WHERE m.id = p_id;
    ELSE RAISE EXCEPTION 'FP_LOJA_DE_TIPO_INVALIDO: %', p_tipo;
  END CASE;
  RETURN v;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RETURN NULL; -- drift: tabela/coluna ausente no ambiente
END $$;

-- Asserções usadas pelos envelopes de RPC (§8). Contexto de servidor passa direto.
CREATE OR REPLACE FUNCTION public.fp_assert_loja(p_loja uuid, p_direta boolean, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF internal.fp_contexto_servidor() THEN RETURN true; END IF;
  IF p_loja IS NULL THEN
    IF NOT p_direta THEN RETURN true; END IF; -- entidade inexistente: o corpo original decide (não-encontrado)
    -- "todas as lojas": só enquanto houver UMA empresa (cliente 1) ou ADMIN legado.
    IF public.fp_admin_legado() OR ((SELECT count(*) FROM public.empresas) <= 1 AND public.fp_pode_loja_nula(NULL)) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'ACESSO_LOJA_OBRIGATORIA: %', p_rotulo USING ERRCODE = '42501';
  END IF;
  IF NOT public.fp_pode_loja(p_loja, NULL) THEN
    RAISE EXCEPTION 'ACESSO_LOJA_NEGADO: %', p_rotulo USING ERRCODE = '42501';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fp_assert_mesma_empresa(p_a uuid, p_b uuid, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF internal.fp_contexto_servidor() OR p_a IS NULL OR p_b IS NULL THEN RETURN true; END IF;
  IF NOT public.fp_mesma_empresa(p_a, p_b) THEN
    RAISE EXCEPTION 'ACESSO_EMPRESA_INVALIDA: %', p_rotulo USING ERRCODE = '42501';
  END IF;
  RETURN true;
END $$;

-- Empresa para INSERT sem empresa_id: a única empresa do usuário; em contexto de servidor, a única
-- empresa do sistema (cliente 1). Ambíguo ⇒ NULL ⇒ a guarda recusa (falha fechada).
CREATE OR REPLACE FUNCTION internal.fp_empresa_padrao()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid[];
BEGIN
  v := ARRAY(SELECT public.fp_empresas_do_usuario());
  IF array_length(v, 1) = 1 THEN RETURN v[1]; END IF;
  IF (SELECT count(*) FROM public.empresas) = 1 THEN RETURN (SELECT id FROM public.empresas LIMIT 1); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION internal.tg_preenche_empresa_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN NEW.empresa_id := internal.fp_empresa_padrao(); END IF;
  IF NEW.empresa_id IS NULL AND EXISTS (SELECT 1 FROM public.empresas) THEN
    -- Mais de uma empresa e nenhuma dedutível (ex.: service_role sem empresa_id): erro explícito
    -- em vez de linha órfã invisível.
    RAISE EXCEPTION 'EMPRESA_ID_OBRIGATORIA: %', TG_TABLE_NAME USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END $$;

-- Serviço: o usuário (não o chamador) pode atuar na loja? Usado pelo sync (operador da venda)
-- e por vincular_usuario_loja (ator do cadastro).
CREATE OR REPLACE FUNCTION public.fp_usuario_pode_loja(p_usuario uuid, p_loja uuid, p_papeis text[] DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_usuario IS NOT NULL AND p_loja IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.usuario_vinculos v
      JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
      JOIN public.lojas l ON l.id = p_loja AND l.empresa_id = v.empresa_id
     WHERE v.usuario_id = p_usuario AND v.ativo
       AND (v.papel = 'DONO' OR v.loja_id = p_loja)
       AND (p_papeis IS NULL OR v.papel = ANY (p_papeis)));
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.fp_admin_legado()', 'public.fp_pode_loja_nula(uuid)', 'public.fp_pode_empresa(uuid)',
    'public.fp_loja_de(text, uuid)', 'public.fp_assert_loja(uuid, boolean, text)',
    'public.fp_assert_mesma_empresa(uuid, uuid, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  REVOKE ALL ON FUNCTION public.fp_usuario_pode_loja(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.fp_usuario_pode_loja(uuid, uuid, text[]) TO service_role;
  REVOKE ALL ON FUNCTION internal.fp_contexto_servidor() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION internal.fp_contexto_servidor() TO authenticated, service_role, anon;
  REVOKE ALL ON FUNCTION internal.fp_empresa_padrao(), internal.tg_preenche_empresa_id() FROM PUBLIC;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. empresa_id nas tabelas de EMPRESA (D4/D12/D13) + lojas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categorias', 'marcas', 'regras_preco', 'categorias_financeiras',
                           'pricing_config_versions', 'configuracoes_gerais', 'relatorio_settings'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'multiempresa fase2: tabela % ausente, pulando empresa_id', t; CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_id uuid NULL REFERENCES public.empresas(id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (empresa_id)', t || '_empresa_id_idx', t);
    EXECUTE format('UPDATE public.%I SET empresa_id = %L WHERE empresa_id IS NULL AND EXISTS (SELECT 1 FROM public.empresas WHERE id = %L)',
                   t, 'e0000001-0000-4000-8000-000000000001', 'e0000001-0000-4000-8000-000000000001');
    EXECUTE format('DROP TRIGGER IF EXISTS trg_preenche_empresa_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_preenche_empresa_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION internal.tg_preenche_empresa_id()', t);
  END LOOP;
  DROP TRIGGER IF EXISTS trg_preenche_empresa_id ON public.lojas;
  CREATE TRIGGER trg_preenche_empresa_id BEFORE INSERT ON public.lojas
    FOR EACH ROW EXECUTE FUNCTION internal.tg_preenche_empresa_id();
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Guardas RESTRICTIVE. Registro em internal.fp_tenant_guardas (fonte do teste de cobertura e do rollback).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.fp_tenant_guardas (
  tabela text PRIMARY KEY,
  classe text NOT NULL,
  expressao text NOT NULL,
  aplicada boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION internal.fp_aplicar_guarda(p_tabela text, p_classe text, p_expr text, p_coluna text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF to_regclass('public.' || p_tabela) IS NULL
     OR (p_coluna IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = p_tabela AND column_name = p_coluna)) THEN
    RAISE NOTICE 'multiempresa fase2: %.% ausente, guarda não aplicada', p_tabela, coalesce(p_coluna, '*');
    INSERT INTO internal.fp_tenant_guardas (tabela, classe, expressao, aplicada) VALUES (p_tabela, p_classe, p_expr, false)
      ON CONFLICT (tabela) DO UPDATE SET classe = EXCLUDED.classe, expressao = EXCLUDED.expressao, aplicada = false;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_tabela);
  EXECUTE format('DROP POLICY IF EXISTS tenant_guard ON public.%I', p_tabela);
  EXECUTE format('CREATE POLICY tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
                 p_tabela, p_expr, p_expr);
  INSERT INTO internal.fp_tenant_guardas (tabela, classe, expressao, aplicada) VALUES (p_tabela, p_classe, p_expr, true)
    ON CONFLICT (tabela) DO UPDATE SET classe = EXCLUDED.classe, expressao = EXCLUDED.expressao, aplicada = true;
END $$;
REVOKE ALL ON FUNCTION internal.fp_aplicar_guarda(text, text, text, text) FROM PUBLIC;

DO $$
DECLARE t text; r record;
BEGIN
  -- L — loja direta (NOT NULL). fornecedores, contas_receber e itens_venda já têm guarda desde a fase 1.
  FOREACH t IN ARRAY ARRAY['caixas', 'clientes', 'comissoes_ajustes', 'comissoes_pagamentos', 'comissoes_regras_funcionario',
    'comissoes_vendedores', 'conciliacoes_financeiras', 'contas_financeiras', 'contas_pagar',
    'entrada_documentos', 'estoque', 'extratos_financeiros', 'financeiro_comandos', 'financeiro_contas_forma',
    'financeiro_recebiveis_venda', 'fiscal_provider_config', 'formas_pagamento', 'funcionarios',
    'funcionarios_meta', 'implantacao_checklist_itens', 'implantacao_checklists', 'importacoes_nfe',
    'movimentos_estoque_log', 'movimentos_financeiros', 'ordens_compra', 'ordens_compra_recebimentos',
    'produto_create_requests', 'produtos', 'remessas', 'tokens_autorizacao_operacao', 'venda_eventos',
    'vendas_em_espera', 'vinculos_fornecedor_produto'] LOOP
    PERFORM internal.fp_aplicar_guarda(t, 'L', 'public.fp_pode_loja(loja_id::uuid, NULL)', 'loja_id');
  END LOOP;

  -- L nulável — NULL = legado do cliente 1 (§12)
  FOREACH t IN ARRAY ARRAY['cadastro_produto_telemetry_events', 'contas_pagar_pagamentos', 'liquidacoes_receber',
    'pdv_config', 'system_alerts', 'tokens_desconto_gerente'] LOOP
    PERFORM internal.fp_aplicar_guarda(t, 'L?', 'public.fp_pode_loja_nula(loja_id::uuid)', 'loja_id');
  END LOOP;

  -- J — loja pela entidade-pai (sem coluna nova)
  FOR r IN SELECT * FROM (VALUES
    ('vendas', 'caixa', 'caixa_id'), ('movimentacoes_caixa', 'caixa', 'caixa_id'), ('movimentos_caixa', 'caixa', 'caixa_id'),
    ('caixas_fechamento_formas', 'caixa', 'caixa_id'), ('vendas_canceladas_auditoria', 'caixa', 'caixa_id'),
    ('descontos_venda', 'venda', 'venda_id'), ('devolucoes', 'venda', 'venda_id'),
    ('documentos_fiscais_pendentes', 'venda', 'venda_id'), ('estoque_baixas', 'venda', 'venda_id'),
    ('estoque_reposicoes_cancelamento', 'venda', 'venda_id'), ('vendas_pagamentos', 'venda', 'venda_id'),
    ('venda_pos_venda_operacoes', 'venda', 'venda_id'),
    ('documentos_fiscais_dlq', 'documento_fiscal', 'documento_id'), ('documentos_fiscais_eventos', 'documento_fiscal', 'documento_id'),
    ('estoque_reposicoes_devolucao', 'operacao_pos_venda', 'operacao_id'), ('venda_pos_venda_itens', 'operacao_pos_venda', 'operacao_id'),
    ('comissoes_itens', 'comissao', 'comissao_id'), ('comissoes_pagamentos_ajustes', 'comissao_pagamento', 'pagamento_id'),
    ('comissoes_regras_historico', 'comissao_regra', 'regra_id'),
    ('importacoes_nfe_duplicatas', 'importacao_nfe', 'importacao_nfe_id'), ('importacoes_nfe_itens', 'importacao_nfe', 'importacao_nfe_id'),
    ('ordens_compra_itens', 'ordem_compra', 'ordem_id'), ('remessa_itens', 'remessa', 'remessa_id'),
    ('historico_precos_produto', 'produto', 'produto_id'), ('historico_tiers_crud', 'produto', 'produto_id'),
    ('transferencias_idempotencia', 'movimento_estoque', 'transferencia_id')
  ) AS x(tabela, tipo, coluna) LOOP
    PERFORM internal.fp_aplicar_guarda(r.tabela, 'J:' || r.tipo,
      format('public.fp_pode_loja_nula(public.fp_loja_de(%L, %I::uuid))', r.tipo, r.coluna), r.coluna);
  END LOOP;

  -- precos_atacado (D15): produto visível E (padrão da empresa OU override de loja permitida)
  PERFORM internal.fp_aplicar_guarda('precos_atacado', 'L+produto',
    'public.fp_pode_loja(public.fp_loja_de(''produto'', produto_id::uuid), NULL) AND (loja_id IS NULL OR public.fp_pode_loja(loja_id::uuid, NULL))',
    'produto_id');

  -- E — empresa
  FOREACH t IN ARRAY ARRAY['categorias', 'marcas', 'regras_preco', 'categorias_financeiras',
                           'pricing_config_versions', 'configuracoes_gerais', 'relatorio_settings'] LOOP
    PERFORM internal.fp_aplicar_guarda(t, 'E', 'public.fp_pode_empresa(empresa_id)', 'empresa_id');
  END LOOP;

  -- R — lojas (raiz)
  PERFORM internal.fp_aplicar_guarda('lojas', 'R',
    'public.fp_pode_empresa(empresa_id) OR public.fp_pode_loja(id, NULL)', 'empresa_id');

  -- V — usuarios: o próprio, ADMIN legado, ou quem pode a loja do usuário
  PERFORM internal.fp_aplicar_guarda('usuarios', 'V',
    'id = (SELECT auth.uid()) OR public.fp_pode_loja_nula(loja_id::uuid)', 'loja_id');
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Envelopes de escopo nas RPCs SECURITY DEFINER expostas a authenticated (§8, etapas 5 e 8)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.fp_rpc_envelopes (
  assinatura text PRIMARY KEY,            -- public.nome(identity args)
  nome text NOT NULL,
  identidade text NOT NULL,
  grantees text[] NOT NULL,               -- roles com EXECUTE antes (para o rollback)
  checagens text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  f record; a record;
  v_tipo text; v_checks text[]; v_call text[]; v_body text; v_grants text[]; v_role text;
  v_origem text; v_destino text; v_out boolean; v_ident text; v_sig text;
  v_mapa constant jsonb := '{
    "p_loja_id":"loja","p_loja_origem":"loja","p_loja_destino":"loja","p_loja_origem_id":"loja","p_loja_destino_id":"loja",
    "p_caixa_id":"caixa","p_caixa_fechado_id":"caixa","p_venda_id":"venda","p_venda_substituta_id":"venda",
    "p_produto_id":"produto","p_remessa_id":"remessa","p_remessa":"remessa","p_ordem_compra_id":"ordem_compra",
    "p_ordem_id":"ordem_compra","p_importacao_id":"importacao_nfe","p_importacao":"importacao_nfe",
    "p_importacao_nfe_id":"importacao_nfe","p_documento_id":"documento_fiscal","p_conta_id":"conta_pagar",
    "p_titulo_id":"conta_receber","p_movimentacao_id":"movimentacao_caixa",
    "p_movimentacao_origem_id":"movimentacao_caixa","p_oc_id":"ordem_compra","p_liquidacao_id":"liquidacao_receber",
    "p_extrato":"extrato","p_operador_id":"usuario",
    "estornar_pagamento_contas_pagar.p_pagamento_id":"pagamento_conta_pagar",
    "converter_venda_em_espera.p_id":"venda_em_espera","descartar_venda_em_espera.p_id":"venda_em_espera",
    "devolver_venda_em_espera.p_id":"venda_em_espera","retomar_venda_em_espera.p_id":"venda_em_espera"}';
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, p.proretset, p.proargnames, p.proargmodes, p.provariadic,
           pg_get_function_identity_arguments(p.oid) AS ident,
           pg_get_function_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS res
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND p.proname !~ '^(fp_|auth_|tg_|trg_)'
       AND p.proargnames IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(p.proargnames) an
                    WHERE v_mapa ? an OR v_mapa ? (p.proname || '.' || an))
     ORDER BY p.proname
  LOOP
    IF f.provariadic <> 0 THEN RAISE NOTICE 'envelope: % variádica, pulando', f.proname; CONTINUE; END IF;
    v_checks := ARRAY[]::text[]; v_call := ARRAY[]::text[]; v_origem := NULL; v_destino := NULL; v_out := false;
    FOR a IN SELECT u.nome, u.ord, coalesce(f.proargmodes[u.ord], 'i') AS modo
               FROM unnest(f.proargnames) WITH ORDINALITY AS u(nome, ord) LOOP
      IF a.modo IN ('o', 't') THEN v_out := true; CONTINUE; END IF;
      IF a.nome IS NULL OR a.nome = '' THEN v_call := NULL; EXIT; END IF;
      v_call := v_call || format('%1$I => %1$I', a.nome);
      v_tipo := coalesce(v_mapa ->> (f.proname || '.' || a.nome), v_mapa ->> a.nome);
      IF v_tipo = 'loja' THEN
        v_checks := v_checks || format('public.fp_assert_loja(%I, true, %L)', a.nome, f.proname || '.' || a.nome);
        IF a.nome IN ('p_loja_origem', 'p_loja_origem_id') THEN v_origem := a.nome; END IF;
        IF a.nome IN ('p_loja_destino', 'p_loja_destino_id') THEN v_destino := a.nome; END IF;
      ELSIF v_tipo IS NOT NULL THEN
        v_checks := v_checks || format('public.fp_assert_loja(public.fp_loja_de(%L, %I), false, %L)',
                                       v_tipo, a.nome, f.proname || '.' || a.nome);
      END IF;
    END LOOP;
    IF v_call IS NULL THEN RAISE NOTICE 'envelope: % com argumento sem nome, pulando', f.proname; CONTINUE; END IF;
    IF v_origem IS NOT NULL AND v_destino IS NOT NULL THEN
      v_checks := v_checks || format('public.fp_assert_mesma_empresa(%I, %I, %L)', v_origem, v_destino, f.proname);
    END IF;

    v_grants := ARRAY[]::text[];
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_function_privilege(v_role, f.oid, 'EXECUTE') THEN v_grants := v_grants || v_role; END IF;
    END LOOP;

    v_sig := format('public.%I(%s)', f.proname, f.ident);
    v_ident := f.ident;
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA internal', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION internal.%I(%s) FROM PUBLIC, anon, authenticated', f.proname, v_ident);

    v_body := 'SELECT ' || array_to_string(v_checks, ' AND ') || ';' || chr(10) ||
      CASE WHEN f.proretset OR v_out OR f.res ~ '^TABLE\('
           THEN format('SELECT * FROM internal.%I(%s);', f.proname, array_to_string(v_call, ', '))
           ELSE format('SELECT internal.%I(%s);', f.proname, array_to_string(v_call, ', ')) END;

    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS %L',
      f.proname, f.args, f.res, v_body);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    FOREACH v_role IN ARRAY v_grants LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_sig, v_role);
    END LOOP;
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', v_sig,
      'Envelope multiempresa (20261019140000): exige escopo de loja/empresa e delega para internal.' || f.proname);

    INSERT INTO internal.fp_rpc_envelopes (assinatura, nome, identidade, grantees, checagens)
    VALUES (v_sig, f.proname, v_ident, v_grants, array_to_string(v_checks, ' AND '))
    ON CONFLICT (assinatura) DO NOTHING;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cadastro de funcionário grava vínculo (servidor) — §11
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vincular_usuario_loja(p_usuario uuid, p_loja uuid, p_papel text, p_ator uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_emp uuid; v_id uuid;
BEGIN
  IF p_papel NOT IN ('GERENTE', 'OPERADOR') THEN RAISE EXCEPTION 'VINCULO_PAPEL_INVALIDO'; END IF;
  SELECT empresa_id INTO v_emp FROM public.lojas WHERE id = p_loja;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'VINCULO_LOJA_SEM_EMPRESA'; END IF;
  IF NOT (public.fp_usuario_pode_loja(p_ator, p_loja, ARRAY['DONO', 'GERENTE'])
          OR EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_ator AND ativo AND perfil = 'ADMIN')) THEN
    RAISE EXCEPTION 'VINCULO_ATOR_SEM_ACESSO_LOJA';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = p_usuario AND ativo AND empresa_id <> v_emp) THEN
    RAISE EXCEPTION 'VINCULO_USUARIO_DE_OUTRA_EMPRESA';
  END IF;
  IF p_papel = 'OPERADOR' THEN
    UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = p_usuario AND empresa_id = v_emp AND papel = 'OPERADOR' AND loja_id <> p_loja AND ativo;
  END IF;
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, created_by)
  VALUES (p_usuario, v_emp, p_loja, p_papel, p_ator)
  ON CONFLICT (usuario_id, empresa_id, papel, COALESCE(loja_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET ativo = true
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.vincular_usuario_loja(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_usuario_loja(uuid, uuid, text, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Ativação do PDV com limite de tentativas (10 falhas / 15 min por computador ou IP)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pdv_ativacao_tentativas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_fingerprint text NOT NULL,
  ip text NULL,
  ok boolean NOT NULL,
  erro text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pdv_ativacao_tentativas_fp_idx ON public.pdv_ativacao_tentativas (device_fingerprint, created_at);
CREATE INDEX IF NOT EXISTS pdv_ativacao_tentativas_ip_idx ON public.pdv_ativacao_tentativas (ip, created_at);
ALTER TABLE public.pdv_ativacao_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_ativacao_tentativas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pdv_ativacao_tentativas TO service_role;

CREATE OR REPLACE FUNCTION public.ativar_dispositivo_pdv_v2(p_codigo text, p_device_fingerprint text, p_nome text DEFAULT NULL, p_ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fp text := lower(btrim(coalesce(p_device_fingerprint, '')));
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_res jsonb; v_err text;
BEGIN
  DELETE FROM public.pdv_ativacao_tentativas WHERE created_at < now() - interval '1 day';
  IF (SELECT count(*) FROM public.pdv_ativacao_tentativas
       WHERE NOT ok AND created_at > now() - interval '15 minutes'
         AND (device_fingerprint = v_fp OR (v_ip IS NOT NULL AND ip = v_ip))) >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ATIVACAO_PDV_BLOQUEADA');
  END IF;
  BEGIN
    v_res := public.ativar_dispositivo_pdv(p_codigo, p_device_fingerprint, p_nome);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  INSERT INTO public.pdv_ativacao_tentativas (device_fingerprint, ip, ok, erro)
  VALUES (left(v_fp, 200), left(v_ip, 64), v_err IS NULL, left(v_err, 200));
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      CASE WHEN v_err LIKE '%ATIVACAO_PDV_FINGERPRINT_INVALIDO%' THEN 'ATIVACAO_PDV_FINGERPRINT_INVALIDO'
           WHEN v_err LIKE '%EMPRESA_NAO_OPERACIONAL%' THEN 'EMPRESA_NAO_OPERACIONAL'
           ELSE 'ATIVACAO_PDV_CODIGO_INVALIDO' END);
  END IF;
  RETURN v_res || jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.ativar_dispositivo_pdv_v2(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_dispositivo_pdv_v2(text, text, text, text) TO service_role;

COMMIT;
$golive_stmt_69e276b3cc5a$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:268:d91380e73abcf09a1086cba6e9aa094eitens_venda:266:db402eee5f6d7957110757600882edccvendas_pagamentos:201:3432d6d312e6f6f24ea9612a7257e235caixas:58:1b639b4221cdfaf9bfcc3ebf5660fbedmovimentacoes_caixa:0:-estoque:158:061c9e8da8142a531eb8d0728e3b4b15produtos:161:8fba5ff547239f94467b7a2126222120usuarios:13:2acdeaaf217d2571a434f8e8ff767aa2clientes:0:-lojas:4:812269b5692f7006f88ec49b088e9c36formas_pagamento:16:c1bbdbff97007016877776ad56afcccccontas_financeiras:0:-contas_pagar:2:2567d13b490befeaf7cc8bf48d01cfe1contas_receber:0:-pdv_config:1:899f43bdba711cfddea47afd00c8b21adocumentos_fiscais_pendentes:0:-totais:528f99d0e010f11ef321f548d3a7b51c|0|0|0|0|20.000;7ab49c7a91a109170b7e57fef3243a59|2|100.00|0|100.00|0.000;86641fb0d5893caebab1d0b38f0ef759|0|0|0|0|0;b5381bb6313900060b277d41cd1d490c|266|49013.80|38569.80|6500.00|284546.000$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261019140000: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261019140000', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019140000' AND name='multiempresa_fase2_guardas') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261019140000'; END IF;
END $chk$;
COMMIT;
