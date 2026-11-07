-- Rollback do P2. Volta ao estado do P1 (restaura internal.comissao_periodo_linhas do P1).
BEGIN;
DROP FUNCTION IF EXISTS public.comissao_export_contabil(uuid, date);
DROP FUNCTION IF EXISTS public.minhas_comissoes(int);
DROP POLICY IF EXISTS comissoes_select_proprio ON public.comissoes_vendedores;
DROP POLICY IF EXISTS comissoes_itens_select_proprio ON public.comissoes_itens;
DROP POLICY IF EXISTS comissoes_ajustes_select_proprio ON public.comissoes_ajustes;
CREATE OR REPLACE FUNCTION internal.comissao_periodo_linhas(p_loja uuid, p_comp date)
RETURNS TABLE (operador_id uuid, vendas int, base numeric, comissao numeric, ajustes numeric, bonus_meta numeric, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (
    SELECT cv.operador_id, count(*)::int AS vendas, sum(cv.base_calculo) AS base, sum(cv.valor_comissao) AS comissao
      FROM public.comissoes_vendedores cv
     WHERE cv.loja_id = p_loja
       AND coalesce(cv.competencia, date_trunc('month', cv.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_comp
     GROUP BY cv.operador_id),
  a AS (
    SELECT aj.operador_id, sum(aj.valor) AS ajustes FROM public.comissoes_ajustes aj
     WHERE aj.loja_id = p_loja
       AND coalesce(aj.competencia, date_trunc('month', aj.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_comp
     GROUP BY aj.operador_id)
  SELECT coalesce(c.operador_id, a.operador_id), coalesce(c.vendas, 0), coalesce(c.base, 0), coalesce(c.comissao, 0),
         -coalesce(a.ajustes, 0), 0::numeric, coalesce(c.comissao, 0) - coalesce(a.ajustes, 0)
    FROM c FULL JOIN a ON a.operador_id = c.operador_id;
$$;
DROP FUNCTION IF EXISTS internal.comissao_bonus_meta(uuid, uuid, date, numeric);
DROP TABLE IF EXISTS public.comissoes_metas;
DROP FUNCTION IF EXISTS internal.trg_comissoes_metas_valida();
DROP FUNCTION IF EXISTS public.definir_divisao_comissao(uuid, uuid, numeric);
DROP TABLE IF EXISTS public.comissoes_divisoes;
DROP FUNCTION IF EXISTS internal.comissao_liberacoes(uuid);
DROP FUNCTION IF EXISTS public.comissao_salvar_config(uuid, text, text);
ALTER TABLE public.comissoes_config DROP COLUMN IF EXISTS liberacao;
COMMIT;
