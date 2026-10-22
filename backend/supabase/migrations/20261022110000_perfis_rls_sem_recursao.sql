-- Corrige "infinite recursion detected in policy for relation perfis": as policies SELECT/DELETE de public.perfis
-- consultavam a própria perfis. A checagem passa para um helper SECURITY DEFINER (search_path fixo), que lê perfis
-- sem RLS. Regra inalterada: o próprio usuário vê sua linha; GERENTE/ADMIN da loja veem/apagam as linhas da loja.
-- ROLLBACK: ops/rollback_20261022110000_perfis_rls_sem_recursao.sql

CREATE OR REPLACE FUNCTION public.perfis_usuario_gerencial_loja(p_loja_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.loja_id = p_loja_id
      AND p.perfil IN ('GERENTE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.perfis_usuario_gerencial_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfis_usuario_gerencial_loja(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS perfis_select_policy ON public.perfis;
CREATE POLICY perfis_select_policy ON public.perfis FOR SELECT
  USING ((SELECT auth.uid()) = user_id OR public.perfis_usuario_gerencial_loja(loja_id));

DROP POLICY IF EXISTS perfis_delete_policy ON public.perfis;
CREATE POLICY perfis_delete_policy ON public.perfis FOR DELETE
  USING (public.perfis_usuario_gerencial_loja(loja_id));
