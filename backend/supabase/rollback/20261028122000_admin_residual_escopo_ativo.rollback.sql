-- Rollback de 20261028122000_admin_residual_escopo_ativo.sql: restaura as definições anteriores (extraídas do
-- banco local homologado com main+#620+#623 antes desta migration). Rodar ANTES do rollback de 20261028120000.
BEGIN;
CREATE OR REPLACE FUNCTION public.auth_usuario_gerencial_loja(p_loja_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid())
      AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      AND (u.perfil = 'ADMIN' OR u.loja_id = p_loja_id)
  );
$function$

;
CREATE OR REPLACE FUNCTION public.produtos_custos_autorizados(p_produto_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(produto_id uuid, loja_id uuid, preco_custo numeric, preco_custo_medio numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p.id, p.loja_id, p.preco_custo, p.preco_custo_medio
  FROM public.produtos p
  JOIN public.usuarios u
    ON u.id = (SELECT auth.uid())
   AND COALESCE(u.ativo, false)
   AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
   AND (u.perfil = 'ADMIN' OR u.loja_id = p.loja_id)
  WHERE p_produto_ids IS NULL OR p.id = ANY (p_produto_ids);
$function$

;
CREATE OR REPLACE FUNCTION public.listar_caixas_elegiveis_desembolso()
 RETURNS TABLE(id uuid, operador_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id,
         COALESCE(op.nome, left(c.id::text, 8)) AS operador_nome
  FROM public.usuarios me
  JOIN public.caixas c
    ON c.loja_id = me.loja_id
   AND c.status = 'ABERTO'
   AND (c.operador_id = me.id OR me.perfil IN ('GERENTE', 'DONO', 'ADMIN'))
  LEFT JOIN public.usuarios op ON op.id = c.operador_id
  WHERE me.id = auth.uid()
  ORDER BY c.data_abertura ASC, c.id ASC;
$function$

;
COMMIT;
