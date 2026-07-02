-- 20260702000000_254_rls_v2_tenant_isolation_jwt.sql
--
-- ============================================================================
-- RLS v2 — Isolamento de tenant via JWT, autoridade única em auth.uid()
-- ============================================================================
--
-- OBJETIVO
--   Eliminar a inconsistência de autoridade e o custo de query do modelo atual,
--   em que TODA policy (~93) executa um subquery `EXISTS (... FROM usuarios ...)`
--   para, ao mesmo tempo:
--     (a) reautenticar o usuário (u.id = auth.uid()),
--     (b) descobrir o tenant do usuário (u.loja_id),
--     (c) autorizar por papel (u.perfil IN 'GERENTE','DONO','ADMIN').
--
--   `public.usuarios` virou fonte de identidade, de tenant e de papel — três
--   autoridades no mesmo lugar, exigindo helper SECURITY DEFINER contra recursão
--   (068) e reavaliada linha-a-linha em tabelas grandes (vendas, itens_venda,
--   documentos_fiscais_*).
--
-- MODELO NOVO (premissas do refactor)
--   1. `auth.uid()` é a identidade primária confiável (vem do JWT assinado).
--   2. `public.usuarios` é APENAS metadado de domínio (nome, idioma, ativo).
--      Nunca é consultada dentro de policy.
--   3. O tenant (`loja_id`) passa a ser um CLAIM ASSINADO do JWT
--      (`app_metadata.loja_id`), lido por `public.auth_loja_id()` — sem tocar
--      em nenhuma tabela.
--   4. RLS contém SOMENTE isolamento de tenant + autenticação mínima.
--      Nenhuma regra de perfil (GERENTE/DONO/ADMIN) permanece em policy.
--   5. Nenhum subquery em `usuarios` dentro de policy.
--
--   A autorização por papel (quem pode cancelar venda, aprovar desconto, editar
--   catálogo global, etc.) migra para a camada de aplicação e para as RPCs
--   SECURITY DEFINER, que passam a ler o claim `perfil` do JWT em vez de fazer
--   subquery em `usuarios`. Ver docs/rls_v2_auth_isolation.md (Fase 2).
--
-- ORDEM DE ROLLOUT (obrigatória — ver doc)
--   Esta migration já grava `loja_id`/`perfil` em auth.users.raw_app_meta_data
--   (backfill) e instala o hook que mantém o claim sincronizado a cada emissão
--   de token. Como o Supabase copia `raw_app_meta_data` para o claim
--   `app_metadata`, tokens EMITIDOS APÓS o backfill já carregam `loja_id`.
--   Sessões ativas com token antigo (sem o claim) só passam a enxergar dados
--   após o refresh do token (<= jwt_expiry, 3600s) OU novo login. Planeje a
--   janela / force re-login. Rollback documentado no fim do arquivo.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. LEITOR DE TENANT A PARTIR DO JWT (sem tocar em usuarios)
-- ---------------------------------------------------------------------------
-- STABLE + sem acesso a tabela: o planner promove a chamada a InitPlan
-- (avaliada UMA vez por query). Custo ~ constante vs. o EXISTS-em-usuarios
-- por-linha do modelo antigo.
CREATE OR REPLACE FUNCTION public.auth_loja_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    (auth.jwt() -> 'app_metadata' ->> 'loja_id'),
    ''
  )::uuid;
$$;

COMMENT ON FUNCTION public.auth_loja_id() IS
  'RLS v2: tenant (loja_id) do usuário lido do claim assinado app_metadata.loja_id. Não consulta public.usuarios.';

REVOKE ALL ON FUNCTION public.auth_loja_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_loja_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_loja_id() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. CUSTOM ACCESS TOKEN HOOK — carimba loja_id/perfil no JWT a cada emissão
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER (dono = postgres) para ler public.usuarios sem esbarrar em
-- RLS. Mantém o claim sincronizado quando a loja/perfil do usuário muda, sem
-- depender do backfill manual em auth.users.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims jsonb;
  v_meta   jsonb;
  v_loja   uuid;
  v_perfil text;
BEGIN
  SELECT u.loja_id, u.perfil
    INTO v_loja, v_perfil
  FROM public.usuarios u
  WHERE u.id = (event ->> 'user_id')::uuid;

  v_claims := event -> 'claims';
  v_meta   := COALESCE(v_claims -> 'app_metadata', '{}'::jsonb);

  IF v_loja IS NOT NULL THEN
    v_meta := jsonb_set(v_meta, '{loja_id}', to_jsonb(v_loja::text));
  END IF;
  IF v_perfil IS NOT NULL THEN
    v_meta := jsonb_set(v_meta, '{perfil}', to_jsonb(v_perfil));
  END IF;

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_meta);
  event    := jsonb_set(event, '{claims}', v_claims);
  RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'RLS v2: injeta app_metadata.loja_id e app_metadata.perfil no JWT a partir de public.usuarios. Habilitar em config.toml [auth.hook.custom_access_token].';

-- Apenas o role do GoTrue pode executar o hook.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 3. BACKFILL — grava loja_id/perfil no app_metadata dos usuários existentes
-- ---------------------------------------------------------------------------
-- O Supabase copia raw_app_meta_data para o claim app_metadata. Assim, o
-- próximo token emitido a cada usuário já carrega loja_id mesmo antes do hook
-- estar habilitado no painel/config.
UPDATE auth.users au
SET raw_app_meta_data =
      COALESCE(au.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('loja_id', u.loja_id::text, 'perfil', u.perfil)
FROM public.usuarios u
WHERE u.id = au.id
  AND u.loja_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. LIMPEZA — remove TODAS as policies das tabelas gerenciadas
-- ---------------------------------------------------------------------------
-- Slate limpo: evita enumerar ~93 nomes legados e garante que nenhuma policy
-- com subquery em usuarios/perfil sobreviva.
DO $$
DECLARE
  v_tabelas text[] := ARRAY[
    'caixas','clientes','comissoes_vendedores','contas_pagar','contas_receber',
    'estoque','importacoes_nfe','movimentacoes_caixa','movimentos_estoque_log',
    'ordens_compra','pdv_config','precos_atacado','produtos','remessas',
    'tokens_desconto_gerente','venda_eventos','vinculos_fornecedor_produto',
    'vendas','movimentos_caixa','vendas_canceladas_auditoria','itens_venda',
    'vendas_pagamentos','devolucoes','documentos_fiscais_pendentes',
    'estoque_reposicoes_cancelamento','estoque_baixas','descontos_venda',
    'documentos_fiscais_eventos','contas_pagar_pagamentos','liquidacoes_receber',
    'ordens_compra_itens','remessa_itens','caixa_scan_telemetry_events',
    'transferencias_idempotencia','usuarios','perfis','categorias',
    'categorias_financeiras','marcas','fornecedores','regras_preco',
    'relatorio_settings','tipos_movimento_estoque','lojas','feature_flags',
    'configuracoes_gerais'
  ];
  v_tab text;
  v_pol record;
BEGIN
  FOREACH v_tab IN ARRAY v_tabelas LOOP
    FOR v_pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tab
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_tab);
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. POLICIES v2 — isolamento de tenant + auth mínima
-- ---------------------------------------------------------------------------
-- Convenção: expressão de tenant sempre `(select public.auth_loja_id())`
-- (subselect => InitPlan). Nenhuma referência a usuarios/perfil.

-- 5.1 Tabelas com loja_id direto ------------------------------------------------
-- FOR ALL: leitura e escrita restritas ao tenant do JWT.
CREATE POLICY "tenant_isolado" ON public.caixas FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.clientes FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.comissoes_vendedores FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.contas_pagar FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.contas_receber FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.estoque FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.importacoes_nfe FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.movimentacoes_caixa FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.movimentos_estoque_log FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.ordens_compra FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.pdv_config FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.precos_atacado FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.produtos FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.remessas FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

-- tokens_desconto_gerente.loja_id é text (não uuid) — cast explícito.
CREATE POLICY "tenant_isolado" ON public.tokens_desconto_gerente FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id())::text)
  WITH CHECK (loja_id = (select public.auth_loja_id())::text);

CREATE POLICY "tenant_isolado" ON public.venda_eventos FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

CREATE POLICY "tenant_isolado" ON public.vinculos_fornecedor_produto FOR ALL TO authenticated
  USING (loja_id = (select public.auth_loja_id()))
  WITH CHECK (loja_id = (select public.auth_loja_id()));

-- 5.2 Tenant alcançado via caixas (coluna caixa_id) -----------------------------
CREATE POLICY "tenant_isolado" ON public.vendas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caixas c
                 WHERE c.id = vendas.caixa_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.caixas c
                 WHERE c.id = vendas.caixa_id AND c.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.movimentos_caixa FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caixas c
                 WHERE c.id = movimentos_caixa.caixa_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.caixas c
                 WHERE c.id = movimentos_caixa.caixa_id AND c.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.vendas_canceladas_auditoria FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caixas c
                 WHERE c.id = vendas_canceladas_auditoria.caixa_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.caixas c
                 WHERE c.id = vendas_canceladas_auditoria.caixa_id AND c.loja_id = (select public.auth_loja_id())));

-- 5.3 Tenant alcançado via vendas -> caixas (coluna venda_id) --------------------
CREATE POLICY "tenant_isolado" ON public.itens_venda FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = itens_venda.venda_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = itens_venda.venda_id AND c.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.vendas_pagamentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = vendas_pagamentos.venda_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = vendas_pagamentos.venda_id AND c.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.devolucoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = devolucoes.venda_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = devolucoes.venda_id AND c.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.documentos_fiscais_pendentes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = documentos_fiscais_pendentes.venda_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = documentos_fiscais_pendentes.venda_id AND c.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.estoque_reposicoes_cancelamento FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = estoque_reposicoes_cancelamento.venda_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = estoque_reposicoes_cancelamento.venda_id AND c.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.estoque_baixas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = estoque_baixas.venda_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = estoque_baixas.venda_id AND c.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.descontos_venda FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = descontos_venda.venda_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE v.id = descontos_venda.venda_id AND c.loja_id = (select public.auth_loja_id())));

-- 5.4 Tenant via documentos_fiscais_pendentes -> vendas -> caixas ----------------
CREATE POLICY "tenant_isolado" ON public.documentos_fiscais_eventos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes d
                 JOIN public.vendas v ON v.id = d.venda_id
                 JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE d.id = documentos_fiscais_eventos.documento_id AND c.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes d
                 JOIN public.vendas v ON v.id = d.venda_id
                 JOIN public.caixas c ON c.id = v.caixa_id
                 WHERE d.id = documentos_fiscais_eventos.documento_id AND c.loja_id = (select public.auth_loja_id())));

-- 5.5 Tenant via contas_pagar / contas_receber / ordens_compra / remessas --------
CREATE POLICY "tenant_isolado" ON public.contas_pagar_pagamentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contas_pagar cp
                 WHERE cp.id = contas_pagar_pagamentos.conta_id AND cp.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contas_pagar cp
                 WHERE cp.id = contas_pagar_pagamentos.conta_id AND cp.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.liquidacoes_receber FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contas_receber cr
                 WHERE cr.id = liquidacoes_receber.titulo_id AND cr.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contas_receber cr
                 WHERE cr.id = liquidacoes_receber.titulo_id AND cr.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.ordens_compra_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ordens_compra oc
                 WHERE oc.id = ordens_compra_itens.ordem_id AND oc.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ordens_compra oc
                 WHERE oc.id = ordens_compra_itens.ordem_id AND oc.loja_id = (select public.auth_loja_id())));

CREATE POLICY "tenant_isolado" ON public.remessa_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.remessas r
                 WHERE r.id = remessa_itens.remessa_id AND r.loja_id = (select public.auth_loja_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.remessas r
                 WHERE r.id = remessa_itens.remessa_id AND r.loja_id = (select public.auth_loja_id())));

-- 5.6 Registros do próprio usuário (identidade, sem loja) ------------------------
CREATE POLICY "self_isolado" ON public.caixa_scan_telemetry_events FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "self_isolado" ON public.transferencias_idempotencia FOR ALL TO authenticated
  USING (usuario_id = (select auth.uid()))
  WITH CHECK (usuario_id = (select auth.uid()));

-- 5.7 Identidade / metadado de domínio ------------------------------------------
-- usuarios: cada um lê/edita apenas o próprio registro. Listagem de equipe
-- (visão gerencial) passa a ser servida por RPC SECURITY DEFINER (Fase 2),
-- não por policy de perfil.
CREATE POLICY "usuarios_self_select" ON public.usuarios FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

CREATE POLICY "usuarios_self_update" ON public.usuarios FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "perfis_self" ON public.perfis FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- 5.8 Catálogo global operacional (sem tenant) ----------------------------------
-- Sem coluna loja_id: dado compartilhado entre lojas. RLS garante apenas
-- autenticação; a autoria por papel (gerente edita catálogo) é responsabilidade
-- da camada de aplicação / RPC. Ver "impacto de segurança" no doc.
CREATE POLICY "auth_full" ON public.categorias FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_full" ON public.categorias_financeiras FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_full" ON public.marcas FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_full" ON public.fornecedores FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_full" ON public.regras_preco FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_full" ON public.relatorio_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 5.9 Config / provisionamento global (leitura autenticada; escrita service_role)
-- Sem policy de escrita => somente service_role (que faz bypass de RLS) grava.
-- Tabelas de baixa frequência e alto privilégio: lojas (cadastro/dados fiscais),
-- feature_flags (toggles globais), configuracoes_gerais, tipos_movimento_estoque.
CREATE POLICY "auth_select" ON public.lojas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth_select" ON public.feature_flags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth_select" ON public.configuracoes_gerais FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth_select" ON public.tipos_movimento_estoque FOR SELECT TO authenticated
  USING (true);

COMMIT;

-- ============================================================================
-- HABILITAR O HOOK (fora desta migration SQL)
--   config.toml:
--     [auth.hook.custom_access_token]
--     enabled = true
--     uri = "pg-functions://postgres/public/custom_access_token_hook"
--   (Projeto hospedado: Authentication > Hooks > Custom Access Token, apontando
--    para public.custom_access_token_hook.)
-- ============================================================================

-- ============================================================================
-- VERIFICAÇÃO (rodar após aplicar)
--   -- (a) nenhuma policy referencia usuarios/perfil:
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public'
--     AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~* '\musuarios\M|perfil';
--   -- deve retornar 0 linhas.
--
--   -- (b) o claim chega no token (após re-login):
--   SELECT auth.jwt() -> 'app_metadata' ->> 'loja_id';
-- ============================================================================

-- ============================================================================
-- ROLLBACK
--   Reaplicar a última migration de RLS v1 (224/252 + 225/226/217) que recria
--   as policies baseadas em usuarios/perfil; depois:
--     DROP POLICY ... (as v2, nomes "tenant_isolado"/"self_isolado"/"auth_*");
--     DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
--     DROP FUNCTION IF EXISTS public.auth_loja_id();
--   e desabilitar o hook em config.toml. O backfill em raw_app_meta_data é
--   inócuo para o v1 (claim extra ignorado).
-- ============================================================================
