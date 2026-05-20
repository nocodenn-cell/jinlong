-- Dashboard gerente v4: adiciona `produto_mais_vendido` e `faturamento_ontem`/`qtd_vendas_ontem`
-- ao payload de retorno da função dashboard_gerente_resumo.

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
  v_inicio_hoje timestamptz;
  v_inicio_amanha timestamptz;
  v_inicio_atividades timestamptz;

  v_inicio_semana_atual date;
  v_inicio_semana_anterior date;
  v_fim_semana_anterior date;

  v_fat_hoje numeric(14, 2) := 0;
  v_fat_ontem numeric(14, 2) := 0;
  v_qtd_hoje bigint := 0;
  v_qtd_ontem bigint := 0;
  v_ticket_hoje numeric(14, 2) := 0;
  v_ticket_ontem numeric(14, 2) := 0;

  v_fat_sem_atual numeric(14, 2) := 0;
  v_fat_sem_ant numeric(14, 2) := 0;
  v_qtd_sem_atual bigint := 0;
  v_qtd_sem_ant bigint := 0;
  v_ticket_sem_atual numeric(14, 2) := 0;
  v_ticket_sem_ant numeric(14, 2) := 0;

  v_margem_estimada numeric(5, 2);
  v_cobertura_custo numeric(5, 2) := 0;
  v_custo_confiavel boolean := false;

  v_produto_mais_vendido text := 'Nenhum hoje (0 un)';
  v_prod_nome text;
  v_prod_qtd numeric;

BEGIN
  -- ── Autorização ─────────────────────────────────────────────────────────────
  SELECT ur.perfil, ur.loja_id
    INTO v_perfil, v_loja_usuario
    FROM public.usuario_roles ur
   WHERE ur.user_id = v_uid
   LIMIT 1;

  IF v_perfil IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  -- ── Fuso horário ─────────────────────────────────────────────────────────────
  v_tz := public.relatorio_tz_validado(p_tz);
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_ontem := v_hoje - INTERVAL '1 day';
  v_inicio_hoje := (v_hoje::timestamp AT TIME ZONE v_tz);
  v_inicio_amanha := ((v_hoje + 1)::timestamp AT TIME ZONE v_tz);
  v_inicio_atividades := now() - INTERVAL '48 hours';

  v_inicio_semana_atual := (v_hoje - ((EXTRACT(ISODOW FROM v_hoje))::integer - 1))::date;
  v_inicio_semana_anterior := v_inicio_semana_atual - INTERVAL '7 days';
  v_fim_semana_anterior := v_inicio_semana_atual - INTERVAL '1 day';

  -- ── KPIs hoje / ontem ────────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(total_liquido) FILTER (WHERE d = v_hoje), 0)::numeric(14, 2),
    COALESCE(SUM(total_liquido) FILTER (WHERE d = v_ontem), 0)::numeric(14, 2),
    COUNT(*) FILTER (WHERE d = v_hoje)::bigint,
    COUNT(*) FILTER (WHERE d = v_ontem)::bigint
  INTO v_fat_hoje, v_fat_ontem, v_qtd_hoje, v_qtd_ontem
  FROM (
    SELECT total_liquido,
           (v.data AT TIME ZONE v_tz)::date AS d
      FROM public.vendas v
     WHERE v.loja_id = p_loja_id
       AND v.status = 'CONCLUIDA'
       AND (v.data AT TIME ZONE v_tz)::date BETWEEN v_ontem AND v_hoje
  ) sub;

  v_ticket_hoje := CASE WHEN v_qtd_hoje > 0 THEN ROUND(v_fat_hoje / v_qtd_hoje, 2) ELSE 0 END;
  v_ticket_ontem := CASE WHEN v_qtd_ontem > 0 THEN ROUND(v_fat_ontem / v_qtd_ontem, 2) ELSE 0 END;

  -- ── KPIs semana ──────────────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(total_liquido) FILTER (WHERE d >= v_inicio_semana_atual AND d <= v_hoje), 0)::numeric(14, 2),
    COALESCE(SUM(total_liquido) FILTER (WHERE d >= v_inicio_semana_anterior AND d <= v_fim_semana_anterior), 0)::numeric(14, 2),
    COUNT(*) FILTER (WHERE d >= v_inicio_semana_atual AND d <= v_hoje)::bigint,
    COUNT(*) FILTER (WHERE d >= v_inicio_semana_anterior AND d <= v_fim_semana_anterior)::bigint
  INTO v_fat_sem_atual, v_fat_sem_ant, v_qtd_sem_atual, v_qtd_sem_ant
  FROM (
    SELECT total_liquido,
           (v.data AT TIME ZONE v_tz)::date AS d
      FROM public.vendas v
     WHERE v.loja_id = p_loja_id
       AND v.status = 'CONCLUIDA'
       AND (v.data AT TIME ZONE v_tz)::date BETWEEN v_inicio_semana_anterior AND v_hoje
  ) sub;

  v_ticket_sem_atual := CASE WHEN v_qtd_sem_atual > 0 THEN ROUND(v_fat_sem_atual / v_qtd_sem_atual, 2) ELSE 0 END;
  v_ticket_sem_ant   := CASE WHEN v_qtd_sem_ant   > 0 THEN ROUND(v_fat_sem_ant   / v_qtd_sem_ant,   2) ELSE 0 END;

  -- ── Margem estimada ──────────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE iv.preco_custo IS NOT NULL AND iv.preco_custo > 0)::numeric /
      NULLIF(COUNT(*), 0)
  INTO v_cobertura_custo
  FROM public.vendas v
  JOIN public.itens_venda iv ON iv.venda_id = v.id
  WHERE v.loja_id = p_loja_id
    AND v.status = 'CONCLUIDA'
    AND (v.data AT TIME ZONE v_tz)::date = v_hoje;

  v_custo_confiavel := COALESCE(v_cobertura_custo, 0) >= 0.95;

  IF v_custo_confiavel AND v_fat_hoje > 0 THEN
    SELECT
      ROUND(
        (1 - SUM(iv.quantidade * COALESCE(iv.preco_custo, 0)) / NULLIF(SUM(iv.quantidade * iv.preco_unitario), 0)) * 100,
        2
      )
    INTO v_margem_estimada
    FROM public.vendas v
    JOIN public.itens_venda iv ON iv.venda_id = v.id
    WHERE v.loja_id = p_loja_id
      AND v.status = 'CONCLUIDA'
      AND (v.data AT TIME ZONE v_tz)::date = v_hoje;
  END IF;

  -- ── Produto mais vendido hoje ────────────────────────────────────────────────
  SELECT p.nome, SUM(iv.quantidade)
    INTO v_prod_nome, v_prod_qtd
    FROM public.itens_venda iv
    JOIN public.vendas v ON v.id = iv.venda_id
    JOIN public.produtos p ON p.id = iv.produto_id
   WHERE v.loja_id = p_loja_id
     AND v.status = 'CONCLUIDA'
     AND (v.data AT TIME ZONE v_tz)::date = v_hoje
   GROUP BY p.id, p.nome
   ORDER BY SUM(iv.quantidade) DESC
   LIMIT 1;

  IF v_prod_nome IS NOT NULL THEN
    v_produto_mais_vendido := v_prod_nome || ' (' || v_prod_qtd::integer || ' un)';
  END IF;

  -- ── Retorno ──────────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'tz', v_tz,
    'hoje', v_hoje,
    'ontem', v_ontem,
    'inicio_semana_atual', v_inicio_semana_atual,
    'inicio_semana_anterior', v_inicio_semana_anterior,
    'faturamento_hoje', v_fat_hoje,
    'faturamento_ontem', v_fat_ontem,
    'quantidade_vendas_hoje', v_qtd_hoje,
    'quantidade_vendas_ontem', v_qtd_ontem,
    'ticket_medio_hoje', v_ticket_hoje,
    'ticket_medio_ontem', v_ticket_ontem,
    'faturamento_semana_atual', v_fat_sem_atual,
    'faturamento_semana_anterior', v_fat_sem_ant,
    'quantidade_vendas_semana_atual', v_qtd_sem_atual,
    'quantidade_vendas_semana_anterior', v_qtd_sem_ant,
    'ticket_medio_semana_atual', v_ticket_sem_atual,
    'ticket_medio_semana_anterior', v_ticket_sem_ant,
    'margem_estimada', v_margem_estimada,
    'cobertura_custo', COALESCE(v_cobertura_custo, 0),
    'custo_confiavel', v_custo_confiavel,
    'produto_mais_vendido', v_produto_mais_vendido,
    'serie_horaria_hoje', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('hora', h, 'faturamento', fat, 'vendas', qtd)
        ORDER BY h
      ), '[]'::jsonb)
      FROM (
        SELECT
          EXTRACT(HOUR FROM (v.data AT TIME ZONE v_tz))::int AS h,
          COALESCE(SUM(v.total_liquido), 0)::numeric(14,2) AS fat,
          COUNT(*)::bigint AS qtd
        FROM public.vendas v
        WHERE v.loja_id = p_loja_id
          AND v.status = 'CONCLUIDA'
          AND v.data >= v_inicio_hoje AND v.data < v_inicio_amanha
        GROUP BY h
      ) s
    ),
    'estoque_critico', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nome', p.nome,
          'quantidade_atual', e.quantidade_atual,
          'estoque_minimo', COALESCE(p.estoque_minimo, 0)
        )
        ORDER BY e.quantidade_atual ASC
      ), '[]'::jsonb)
      FROM public.estoque e
      JOIN public.produtos p ON p.id = e.produto_id
      WHERE e.loja_id = p_loja_id
        AND p.ativo = true
        AND e.quantidade_atual <= COALESCE(p.estoque_minimo, 0)
      LIMIT 5
    ),
    'atividades_recentes', (
      SELECT COALESCE(jsonb_agg(a ORDER BY a->>'data_hora' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'tipo', 'VENDA',
          'data_hora', v.data,
          'payload', jsonb_build_object('total', v.total_liquido, 'venda_id', v.id)
        ) AS a
        FROM public.vendas v
        WHERE v.loja_id = p_loja_id
          AND v.status = 'CONCLUIDA'
          AND v.data >= v_inicio_atividades
        UNION ALL
        SELECT jsonb_build_object(
          'tipo', 'ESTOQUE',
          'data_hora', m.created_at,
          'payload', jsonb_build_object(
            'produto_nome', p.nome,
            'quantidade', m.quantidade,
            'tipo_movimento', m.tipo
          )
        ) AS a
        FROM public.movimentacoes_estoque m
        JOIN public.produtos p ON p.id = m.produto_id
        WHERE m.loja_id = p_loja_id
          AND m.created_at >= v_inicio_atividades
        UNION ALL
        SELECT jsonb_build_object(
          'tipo', 'CAIXA',
          'data_hora', c.updated_at,
          'payload', jsonb_build_object('status', c.status, 'caixa_id', c.id)
        ) AS a
        FROM public.caixas c
        WHERE c.loja_id = p_loja_id
          AND c.updated_at >= v_inicio_atividades
        LIMIT 20
      ) acts
    )
  );
END;
$$;
