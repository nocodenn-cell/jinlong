BEGIN;
CREATE OR REPLACE VIEW public.produtos_custos WITH (security_invoker = off) AS
SELECT p.id AS produto_id, p.loja_id, p.preco_custo, p.preco_custo_medio
FROM public.produtos p
JOIN public.usuarios u ON u.id = (SELECT auth.uid()) AND COALESCE(u.ativo, false)
 AND u.perfil IN ('GERENTE','DONO','ADMIN') AND (u.perfil = 'ADMIN' OR u.loja_id = p.loja_id);
REVOKE ALL ON public.produtos_custos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.produtos_custos TO authenticated, service_role;
-- só remova a RPC depois de reverter o app (que passa a chamá-la):
DROP FUNCTION IF EXISTS public.produtos_custos_autorizados(uuid[]);
COMMIT;
NOTIFY pgrst, 'reload schema';
