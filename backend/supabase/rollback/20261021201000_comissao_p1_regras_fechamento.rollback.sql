-- Rollback do P1 (regras, fechamento, relatório). Volta ao estado do P0.
BEGIN;
DROP TRIGGER IF EXISTS trg_comissoes_vendedores_trava ON public.comissoes_vendedores;
DROP TRIGGER IF EXISTS trg_comissoes_itens_trava ON public.comissoes_itens;
DROP TRIGGER IF EXISTS trg_comissoes_vendedores_competencia ON public.comissoes_vendedores;
DROP TRIGGER IF EXISTS trg_comissoes_ajustes_competencia ON public.comissoes_ajustes;
DROP FUNCTION IF EXISTS public.comissao_relatorio_itens(uuid, date, uuid);
DROP FUNCTION IF EXISTS public.comissao_relatorio_vendedores(uuid, date);
DROP FUNCTION IF EXISTS public.comissao_periodo_transicionar(uuid, date, text);
DROP FUNCTION IF EXISTS internal.comissao_periodo_snapshot(uuid);
DROP FUNCTION IF EXISTS internal.comissao_periodo_linhas(uuid, date);
DROP FUNCTION IF EXISTS internal.trg_comissao_trava_periodo();
DROP FUNCTION IF EXISTS internal.trg_comissao_competencia();
DROP FUNCTION IF EXISTS public.comissao_simular_regra(uuid, uuid, uuid, text, date);

CREATE OR REPLACE FUNCTION internal.comissao_regra_empresa(p_loja uuid, p_vendedor uuid, p_produto uuid, p_canal text, p_data date)
RETURNS TABLE (o_regra_id uuid, o_tipo_calculo text, o_valor numeric, o_nivel int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::int WHERE false;
$$;
CREATE OR REPLACE FUNCTION internal.comissao_bloqueio_reatribuicao(p_venda_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id
                  AND (cv.status <> 'pendente' OR cv.pagamento_id IS NOT NULL)) THEN 'COMISSAO_JA_PAGA'
    WHEN EXISTS (SELECT 1 FROM public.comissoes_ajustes a WHERE a.venda_id = p_venda_id) THEN 'COMISSAO_COM_AJUSTE'
  END;
$$;
DROP FUNCTION IF EXISTS internal.comissao_periodo_travado(uuid, date);
DROP FUNCTION IF EXISTS internal.comissao_competencia_aberta(uuid, timestamptz);
ALTER TABLE public.comissoes_vendedores DROP COLUMN IF EXISTS competencia;
ALTER TABLE public.comissoes_ajustes DROP COLUMN IF EXISTS competencia;
DROP TABLE IF EXISTS public.comissoes_periodo_vendedores;
DROP TABLE IF EXISTS public.comissoes_periodos;
DROP TABLE IF EXISTS public.comissoes_regras;
DROP TABLE IF EXISTS public.comissoes_regras_log;
DROP FUNCTION IF EXISTS internal.trg_comissoes_regras_valida();
DROP FUNCTION IF EXISTS internal.trg_comissoes_regras_log();
DROP FUNCTION IF EXISTS internal.comissao_regra_nivel(uuid, text, uuid, uuid);
COMMIT;
