-- Dashboard executivo do gerente (Etapa 1):
-- KPIs financeiros do dia atual + variação vs dia anterior, com filtro por loja.
--
-- Decisões deliberadas:
--   * `SECURITY INVOKER`: a checagem de perfil + acesso à loja é explícita,
--     e o RLS de `vendas`, `caixas`, `itens_venda` e `produtos` continua valendo.
--   * Loja vem por `caixas.loja_id` (a tabela `vendas` não possui `loja_id`).
--   * Margem usa o mesmo gate de cobertura (≥ 95%) de
--     `relatorio_resumo_executivo_periodo` (migration 064): se o catálogo não
--     tem `preco_custo` em pelo menos 95% das unidades vendidas, devolvemos
--     `null` em vez de um número que infla artificialmente a margem real.
--   * Janela diária respeita fuso (`relatorio_tz_validado`, migration 013).
--   * Estoque crítico, atividades recentes, sparkline e dock ficam para a
--     Etapa 2 — esta RPC entrega só os KPIs solicitados.

CREATE OR REPLACE FUNCTION public.dashboard_gerente_resumo(
  p_loja_id uuid,
  p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_tz text;
  v_hoje date;
  v_ontem date;

  v_fat_hoje numeric(14, 2) := 0;
  v_fat_ontem numeric(14, 2) := 0;
  v_qtd_hoje bigint := 0;
  v_qtd_ontem bigint := 0;
  v_ticket_hoje numeric(14, 2) := 0;
  v_ticket_ontem numeric(14, 2) := 0;

  v_itens_total numeric(14, 3) := 0;
  v_itens_com_custo numeric(14, 3) := 0;
  v_receita numeric(14, 2) := 0;
  v_custo numeric(14, 2) := 0;
  v_cobertura numeric(10, 4) := 0;
  v_margem numeric(14, 2);
  v_custo_confiavel boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF p_loja_id IS NULL THEN
    RAISE EXCEPTION 'loja_obrigatoria' USING ERRCODE = '22023';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  -- GERENTE só enxerga a própria loja; DONO/ADMIN podem qualquer loja.
  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  v_tz := public.relatorio_tz_validado(p_tz);
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_ontem := v_hoje - INTERVAL '1 day';

  -- Faturamento + nº de vendas (hoje e ontem) com filtro de loja via caixas.
  WITH vendas_dia AS (
    SELECT
      v.id,
      v.total_liquido,
      (v.data AT TIME ZONE v_tz)::date AS d
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
    WHERE v.status = 'CONCLUIDA'
      AND (v.data AT TIME ZONE v_tz)::date BETWEEN v_ontem AND v_hoje
  )
  SELECT
    COALESCE(SUM(total_liquido) FILTER (WHERE d = v_hoje), 0)::numeric(14, 2),
    COALESCE(SUM(total_liquido) FILTER (WHERE d = v_ontem), 0)::numeric(14, 2),
    COUNT(*) FILTER (WHERE d = v_hoje)::bigint,
    COUNT(*) FILTER (WHERE d = v_ontem)::bigint
  INTO v_fat_hoje, v_fat_ontem, v_qtd_hoje, v_qtd_ontem
  FROM vendas_dia;

  v_ticket_hoje := CASE
    WHEN v_qtd_hoje > 0 THEN ROUND(v_fat_hoje / v_qtd_hoje, 2)
    ELSE 0
  END;
  v_ticket_ontem := CASE
    WHEN v_qtd_ontem > 0 THEN ROUND(v_fat_ontem / v_qtd_ontem, 2)
    ELSE 0
  END;

  -- Cobertura de custo + margem estimada do DIA, com gate ≥ 95%.
  SELECT
    COALESCE(SUM(iv.quantidade), 0)::numeric(14, 3),
    COALESCE(
      SUM(CASE WHEN p.preco_custo IS NOT NULL THEN iv.quantidade ELSE 0 END),
      0
    )::numeric(14, 3),
    COALESCE(SUM(iv.quantidade * iv.preco_unitario), 0)::numeric(14, 2),
    COALESCE(
      SUM(
        CASE WHEN p.preco_custo IS NOT NULL
          THEN iv.quantidade * p.preco_custo
          ELSE 0
        END
      ),
      0
    )::numeric(14, 2)
  INTO v_itens_total, v_itens_com_custo, v_receita, v_custo
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
  JOIN public.itens_venda iv ON iv.venda_id = v.id
  JOIN public.produtos p ON p.id = iv.produto_id
  WHERE v.status = 'CONCLUIDA'
    AND (v.data AT TIME ZONE v_tz)::date = v_hoje;

  v_cobertura := CASE
    WHEN v_itens_total > 0
      THEN (v_itens_com_custo / v_itens_total)::numeric(10, 4)
    ELSE 0::numeric(10, 4)
  END;

  v_custo_confiavel := v_cobertura >= 0.95 AND v_itens_total > 0;

  v_margem := CASE
    WHEN v_custo_confiavel
      THEN (v_receita - v_custo)::numeric(14, 2)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'tz', v_tz,
    'hoje', v_hoje,
    'ontem', v_ontem,
    'faturamento_hoje', v_fat_hoje,
    'faturamento_ontem', v_fat_ontem,
    'quantidade_vendas_hoje', v_qtd_hoje,
    'quantidade_vendas_ontem', v_qtd_ontem,
    'ticket_medio_hoje', v_ticket_hoje,
    'ticket_medio_ontem', v_ticket_ontem,
    'margem_estimada', v_margem,
    'cobertura_custo', v_cobertura,
    'custo_confiavel', v_custo_confiavel
  );
END;
$$;

COMMENT ON FUNCTION public.dashboard_gerente_resumo(uuid, text) IS
  'Dashboard executivo do gerente: KPIs do dia (faturamento, vendas, ticket, margem com gate de cobertura ≥ 95%) e referência de ontem para variação. Filtro por loja via caixas.loja_id. Requer perfil GERENTE/DONO/ADMIN; GERENTE só acessa a própria loja.';

REVOKE ALL ON FUNCTION public.dashboard_gerente_resumo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_gerente_resumo(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_gerente_resumo(uuid, text) TO service_role;
