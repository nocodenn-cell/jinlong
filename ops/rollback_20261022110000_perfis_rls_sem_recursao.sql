BEGIN;
DROP POLICY IF EXISTS perfis_select_policy ON public.perfis;
CREATE POLICY perfis_select_policy ON public.perfis FOR SELECT USING (((SELECT auth.uid()) = user_id) OR (EXISTS (SELECT 1 FROM public.perfis p WHERE p.user_id = (SELECT auth.uid()) AND p.loja_id = perfis.loja_id AND p.perfil = ANY (ARRAY['GERENTE','ADMIN']))));
DROP POLICY IF EXISTS perfis_delete_policy ON public.perfis;
CREATE POLICY perfis_delete_policy ON public.perfis FOR DELETE USING (EXISTS (SELECT 1 FROM public.perfis p WHERE p.user_id = (SELECT auth.uid()) AND p.loja_id = perfis.loja_id AND p.perfil = ANY (ARRAY['GERENTE','ADMIN'])));
DROP FUNCTION IF EXISTS public.perfis_usuario_gerencial_loja(uuid);
COMMIT;
