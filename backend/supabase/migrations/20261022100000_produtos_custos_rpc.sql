-- Corrige o alerta "security_definer_view" do Supabase em public.produtos_custos sem mudar a matriz de acesso.
-- A autorização (GERENTE/DONO ativos da própria loja; ADMIN ativo global; OPERADOR/inativo/anon = 0 linhas)
-- passa a viver na RPC SECURITY DEFINER public.produtos_custos_autorizados(uuid[]) com search_path fixo.
-- A view continua existindo (as 4 funções de relatório fazem LEFT JOIN nela), agora security_invoker = on,
-- apenas delegando à RPC: mesmo resultado, sem view de dono.
-- ROLLBACK: ops/rollback_20261022100000_produtos_custos_rpc.sql (recria a view original e remove a RPC).

CREATE OR REPLACE FUNCTION public.produtos_custos_autorizados(p_produto_ids uuid[] DEFAULT NULL)
RETURNS TABLE (produto_id uuid, loja_id uuid, preco_custo numeric, preco_custo_medio numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.loja_id, p.preco_custo, p.preco_custo_medio
  FROM public.produtos p
  JOIN public.usuarios u
    ON u.id = (SELECT auth.uid())
   AND COALESCE(u.ativo, false)
   AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
   AND (u.perfil = 'ADMIN' OR u.loja_id = p.loja_id)
  WHERE p_produto_ids IS NULL OR p.id = ANY (p_produto_ids);
$$;

COMMENT ON FUNCTION public.produtos_custos_autorizados(uuid[]) IS
  'Custo de aquisição por produto, SOMENTE para GERENTE/DONO ativos da loja e ADMIN ativo (0 linhas para os demais). NULL = todos os produtos autorizados.';

REVOKE ALL ON FUNCTION public.produtos_custos_autorizados(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtos_custos_autorizados(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.produtos_custos
WITH (security_invoker = on) AS
SELECT c.produto_id,
       c.loja_id,
       c.preco_custo::numeric(10,2) AS preco_custo,
       c.preco_custo_medio::numeric(10,2) AS preco_custo_medio
FROM public.produtos_custos_autorizados(NULL) c;

REVOKE ALL ON public.produtos_custos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.produtos_custos TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
