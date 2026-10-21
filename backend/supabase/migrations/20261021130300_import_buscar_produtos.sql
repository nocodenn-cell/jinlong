-- ============================================================================
-- F5 — leitura de produtos para o hub de Importações (somente id e nome).
-- O módulo não acessa a tabela `produtos` diretamente (fronteira de domínio): usa esta RPC,
-- que exige identidade + módulo ativo + papel e só devolve produtos ativos das lojas da empresa
-- do usuário (cerca). Nenhum outro campo (preço, custo, estoque) é exposto.
-- Portado do PR #537 (F5). Rollback: backend/supabase/rollback/20261021130300_import_buscar_produtos.rollback.sql
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.import_buscar_produtos(p_termo text DEFAULT NULL, p_ids uuid[] DEFAULT NULL)
RETURNS TABLE (id uuid, nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_empresa uuid;
  v_termo text := nullif(btrim(coalesce(p_termo, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  v_empresa := public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE', ARRAY['DONO', 'GERENTE']);
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF v_termo IS NULL AND p_ids IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.id, p.nome
    FROM public.produtos p
    JOIN public.lojas l ON l.id = p.loja_id
   WHERE l.empresa_id = v_empresa
     AND p.loja_id = ANY (public.fp_lojas_cerca())
     AND (
       (p_ids IS NOT NULL AND p.id = ANY (p_ids))
       OR (v_termo IS NOT NULL AND length(v_termo) >= 2 AND p.ativo
           AND (p.nome ILIKE '%' || v_termo || '%' OR p.codigo_barras ILIKE '%' || v_termo || '%'))
     )
   ORDER BY p.nome
   LIMIT CASE WHEN p_ids IS NOT NULL THEN 500 ELSE 20 END;
END
$$;

REVOKE ALL ON FUNCTION public.import_buscar_produtos(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_buscar_produtos(text, uuid[]) TO authenticated, service_role;

COMMIT;
