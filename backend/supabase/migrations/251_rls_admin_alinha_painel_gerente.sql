-- 251_rls_admin_alinha_painel_gerente.sql
--
-- RENUMERADO de 225 para 251 em 2026-07-03: colidia com
-- 225_dashboard_serie_horaria_semana_anterior.sql (mesmo prefixo numérico,
-- dois arquivos reivindicando a mesma versão) — quebrava `db reset`/replay
-- sequencial com duplicate key em schema_migrations_pkey. Confirmado com o
-- usuário via `npx supabase migration list` contra produção: nem esta
-- migration nem sua colidente tinham entrada em Remote antes desta mudança,
-- portanto seguro renumerar sem afetar histórico já aplicado. Conteúdo
-- abaixo inalterado (sem dependência cruzada com a 225 nem com migrations
-- vizinhas, verificado antes de renumerar).
--
-- CONSISTÊNCIA DE PERMISSÕES (ADMIN = GERENTE pleno no painel).
--
-- Por quê: o app trata ADMIN como perfil de painel gerencial em pé de igualdade
-- com GERENTE (`PERFIS_PAINEL_GERENCIAL = ['GERENTE','DONO','ADMIN']`, isPerfilPainelGerencial,
-- guards de /gerente e /admin). Mas 4 policies RLS ainda listam só GERENTE/DONO,
-- então um usuário ADMIN entra na tela e a operação falha/volta vazia:
--   1. movimentos_caixa  (SELECT)        -> detalhe de venda em /gerente/vendas/[id]
--   2. categorias_financeiras (ALL)      -> /gerente/financeiro
--   3. precos_atacado (ALL)              -> gestão de atacado
--   4. usuarios (UPDATE idioma próprio)  -> LanguageToggle exibido p/ ADMIN no admin/layout
--
-- Esta migration inclui 'ADMIN' nessas 4 policies, alinhando RLS ao app.
-- Nenhum acesso é ampliado para OPERADOR — só ADMIN passa a ter o mesmo que GERENTE.
--
-- SEGURANÇA DA APLICAÇÃO: usa ALTER POLICY (não DROP/CREATE) — não há janela em que
-- a policy deixe de existir (com RLS default-deny isso bloquearia usuários no meio da
-- migration). Roles e comandos ficam intactos; só as expressões USING/WITH CHECK mudam.
--
-- PRESERVA o initplan da migration 224: auth.uid() continua envolto em ( SELECT ... ).

-- 1) categorias_financeiras — ALL (USING + WITH CHECK)
ALTER POLICY dono_gerente_all_cat_fin ON public.categorias_financeiras
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = ( SELECT auth.uid() )
        AND u.perfil = ANY (ARRAY['DONO'::text, 'GERENTE'::text, 'ADMIN'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = ( SELECT auth.uid() )
        AND u.perfil = ANY (ARRAY['DONO'::text, 'GERENTE'::text, 'ADMIN'::text])
    )
  );

-- 2) movimentos_caixa — SELECT (USING)
ALTER POLICY movimentos_gerente ON public.movimentos_caixa
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = ( SELECT auth.uid() )
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
    )
  );

-- 3) precos_atacado — ALL (USING)
ALTER POLICY precos_atacado_escrita ON public.precos_atacado
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = ( SELECT auth.uid() )
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
    )
  );

-- 4) usuarios — UPDATE do próprio idioma (USING + WITH CHECK)
ALTER POLICY usuarios_update_idioma_gerente_dono ON public.usuarios
  USING (
    ( SELECT auth.uid() ) = id
    AND perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
  )
  WITH CHECK (
    ( SELECT auth.uid() ) = id
    AND perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
    AND idioma_preferido = ANY (ARRAY['pt'::text, 'zh'::text])
  );
