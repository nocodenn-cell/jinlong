-- Consolida RLS em public.caixas: uma política por comando (SELECT / INSERT / UPDATE / DELETE).
-- Objetivos:
-- 1) Reduzir "Multiple permissive policies" no Supabase Security Advisor (várias políticas FOR SELECT).
-- 2) Usar (SELECT auth.uid()) para mitigar "Auth RLS Initialization Plan" (reavaliação por linha).
-- 3) Alinhar escopo GERENTE/ADMIN à mesma loja (042); DONO vê todas as lojas (043); operador só o próprio caixa.
--
-- Substitui o par legado: caixas_operador (001, FOR ALL) + caixas_gerente (044, SELECT sem loja).

DROP POLICY IF EXISTS "caixas_operador" ON public.caixas;
DROP POLICY IF EXISTS "caixas_gerente" ON public.caixas;

CREATE POLICY "caixas_select_authenticated"
  ON public.caixas FOR SELECT TO authenticated
  USING (
    operador_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil = 'DONO'
          OR (
            u.perfil IN ('GERENTE', 'ADMIN')
            AND u.loja_id = caixas.loja_id
          )
        )
    )
  );

CREATE POLICY "caixas_insert_authenticated"
  ON public.caixas FOR INSERT TO authenticated
  WITH CHECK (
    operador_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.loja_id = caixas.loja_id
    )
  );

CREATE POLICY "caixas_update_authenticated"
  ON public.caixas FOR UPDATE TO authenticated
  USING (
    operador_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil = 'DONO'
          OR (
            u.perfil IN ('GERENTE', 'ADMIN')
            AND u.loja_id = caixas.loja_id
          )
        )
    )
  )
  WITH CHECK (
    operador_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil = 'DONO'
          OR (
            u.perfil IN ('GERENTE', 'ADMIN')
            AND u.loja_id = caixas.loja_id
          )
        )
    )
  );

CREATE POLICY "caixas_delete_authenticated"
  ON public.caixas FOR DELETE TO authenticated
  USING (
    operador_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil = 'DONO'
          OR (
            u.perfil IN ('GERENTE', 'ADMIN')
            AND u.loja_id = caixas.loja_id
          )
        )
    )
  );
