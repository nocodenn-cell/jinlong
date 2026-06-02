-- 217 — Corrige RLS de feature_flags: perfil comparado em minúsculo ('admin').
--
-- As políticas de escrita exigiam usuarios.perfil = 'admin', mas os perfis reais são MAIÚSCULOS
-- ('DONO'/'GERENTE'/'OPERADOR') e não existe 'admin'. Resultado: só service_role escrevia flags,
-- nenhum usuário do app conseguia. Recria as 3 políticas usando IN ('DONO','ADMIN').
-- Decisão: incluir DONO (não há usuário ADMIN cadastrado; intent era "administrador"); GERENTE
-- fica de fora (flags são governança, não operação). A leitura por authenticated não muda.

DROP POLICY IF EXISTS "Feature flags - INSERT para admin/service_role" ON public.feature_flags;
CREATE POLICY "Feature flags - INSERT para admin/service_role"
  ON public.feature_flags FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = auth.uid() AND u.perfil IN ('DONO', 'ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "Feature flags - UPDATE para admin/service_role" ON public.feature_flags;
CREATE POLICY "Feature flags - UPDATE para admin/service_role"
  ON public.feature_flags FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR (
      auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = auth.uid() AND u.perfil IN ('DONO', 'ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "Feature flags - DELETE para admin/service_role" ON public.feature_flags;
CREATE POLICY "Feature flags - DELETE para admin/service_role"
  ON public.feature_flags FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR (
      auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = auth.uid() AND u.perfil IN ('DONO', 'ADMIN')
      )
    )
  );
