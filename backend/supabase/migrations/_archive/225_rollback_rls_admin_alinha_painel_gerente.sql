-- 225_rollback_rls_admin_alinha_painel_gerente.sql
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
