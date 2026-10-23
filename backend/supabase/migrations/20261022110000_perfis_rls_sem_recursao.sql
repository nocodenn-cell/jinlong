-- Corrige "infinite recursion detected in policy for relation perfis": as policies SELECT/DELETE de public.perfis
-- consultavam a própria perfis. A checagem passa para um helper SECURITY DEFINER (search_path fixo), que lê perfis
-- sem RLS. Regra inalterada: o próprio usuário vê sua linha; GERENTE/ADMIN da loja veem/apagam as linhas da loja.
--
-- GUARDA: nenhuma migration do repositório cria public.perfis — a tabela só existe em produção (drift tratado
-- da mesma forma em 223/224). Num banco novo (supabase db reset / CI) a migration vira no-op; o DDL roda via
-- EXECUTE porque o corpo de uma função LANGUAGE sql é validado na criação e falharia sem a tabela.
-- Em produção (já aplicada em 2026-10-22) o efeito é idêntico ao da versão sem guarda.
--
-- ROLLBACK: ops/rollback_20261022110000_perfis_rls_sem_recursao.sql

DO $perfis$
BEGIN
  IF to_regclass('public.perfis') IS NULL THEN
    RAISE NOTICE 'public.perfis ausente neste ambiente (drift só de produção) — migration ignorada';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.perfis_usuario_gerencial_loja(p_loja_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $body$
      SELECT EXISTS (
        SELECT 1 FROM public.perfis p
        WHERE p.user_id = (SELECT auth.uid())
          AND p.loja_id = p_loja_id
          AND p.perfil IN ('GERENTE', 'ADMIN')
      );
    $body$
  $fn$;
  REVOKE ALL ON FUNCTION public.perfis_usuario_gerencial_loja(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.perfis_usuario_gerencial_loja(uuid) TO authenticated, service_role;

  DROP POLICY IF EXISTS perfis_select_policy ON public.perfis;
  CREATE POLICY perfis_select_policy ON public.perfis FOR SELECT
    USING ((SELECT auth.uid()) = user_id OR public.perfis_usuario_gerencial_loja(loja_id));

  DROP POLICY IF EXISTS perfis_delete_policy ON public.perfis;
  CREATE POLICY perfis_delete_policy ON public.perfis FOR DELETE
    USING (public.perfis_usuario_gerencial_loja(loja_id));
END
$perfis$;
