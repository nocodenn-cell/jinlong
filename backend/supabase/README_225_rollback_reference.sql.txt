-- MOVIDO PARA FORA DE supabase/migrations/ EM 2026-07-03 (mesmo motivo do
-- README_224_rollback_reference.sql.txt): o nome original
-- "225_rollback_rls_admin_alinha_painel_gerente.sql" compartilhava o prefixo
-- numérico "225" com migrations reais (225_rls_admin_alinha_painel_gerente.sql,
-- 225_dashboard_serie_horaria_semana_anterior.sql — já tolerada como colisão
-- herdada em scripts/migration-sequence-guard.mjs). O Supabase CLI extrai a
-- versão do prefixo do arquivo; um terceiro arquivo reivindicando a mesma
-- versão 225 quebraria `db reset`/replay com duplicate key em
-- schema_migrations_pkey, mesmo erro reproduzido para a 224 no CI do PR #132.
-- Nunca foi para rodar sozinho no fluxo normal — é referência manual. Ao
-- mover para fora de supabase/migrations/, deixa de ser executado por
-- `db reset`/`db push`. Para reverter a 225 de verdade: copie o conteúdo
-- abaixo e rode manualmente contra o ambiente alvo.
--
-- ============================================================================
-- 225_rollback_rls_admin_alinha_painel_gerente.sql (conteúdo original)
--
-- Reverte 225: remove 'ADMIN' das 4 policies, voltando ao escopo GERENTE/DONO.
-- (Não recomendado enquanto o app tratar ADMIN como painel gerencial.)

ALTER POLICY dono_gerente_all_cat_fin ON public.categorias_financeiras
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = ( SELECT auth.uid() )
        AND u.perfil = ANY (ARRAY['DONO'::text, 'GERENTE'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = ( SELECT auth.uid() )
        AND u.perfil = ANY (ARRAY['DONO'::text, 'GERENTE'::text])
    )
  );

ALTER POLICY movimentos_gerente ON public.movimentos_caixa
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = ( SELECT auth.uid() )
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])
    )
  );

ALTER POLICY precos_atacado_escrita ON public.precos_atacado
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = ( SELECT auth.uid() )
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])
    )
  );

ALTER POLICY usuarios_update_idioma_gerente_dono ON public.usuarios
  USING (
    ( SELECT auth.uid() ) = id
    AND perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])
  )
  WITH CHECK (
    ( SELECT auth.uid() ) = id
    AND perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])
    AND idioma_preferido = ANY (ARRAY['pt'::text, 'zh'::text])
  );
