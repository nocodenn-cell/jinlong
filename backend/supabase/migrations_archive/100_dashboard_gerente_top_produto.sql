-- Dashboard gerente v4: adiciona `produto_mais_vendido` ao payload de retorno.
--
-- NOTA DE SANEAMENTO (2026-06-01): a versão original desta migration referenciava
-- objetos que NENHUMA migration cria (`vendas.loja_id`, `itens_venda.preco_custo`,
-- `public.movimentacoes_estoque`). Como o Postgres não valida o corpo de funções
-- plpgsql no CREATE, ela "aplicava" mas a função nascia morta — falhava só em runtime.
-- Reescrita para a linhagem 080 (esquema real: `usuarios`, loja via `caixas`,
-- `produtos.preco_custo`, `v_estoque_baixo`, `movimentos_estoque_log`), preservando a
-- intenção original (campo `produto_mais_vendido`). Todos os objetos referenciados
-- existem antes desta posição no histórico.

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

  v_itens_total numeric(14, 3) := 0;
  v_itens_com_custo numeric(14, 3) := 0;
  v_receita numeric(14, 2) := 0;
  v_custo numeric(14, 2) := 0;
  v_cobertura numeric(10, 4) := 0;
  v_margem numeric(14, 2);
  v_custo_confiavel boolean := false;

  v_produto_mais_vendido text := 'Nenhum hoje (0 un)';
  v_prod_nome text;
  v_prod_qtd numeric;

  v_serie jsonb;
  v_estoque_critico jsonb;
  v_atividades jsonb;
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

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  v_tz := public.relatorio_tz_validado(p_tz);
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_ontem := v_hoje - INTERVAL '1 day';
  v_inicio_hoje := (v_hoje::timestamp AT TIME ZONE v_tz);
  v_inicio_amanha := ((v_hoje + 1)::timestamp AT TIME ZONE v_tz);
  v_inicio_atividades := now() - INTERVAL '48 hours';

  -- Segunda-feira da semana civil (ISO DOW 1 = segunda).
  v_inicio_semana_atual := (v_hoje - ((EXTRACT(ISODOW FROM v_hoje))::integer - 1))::date;
  v_inicio_semana_anterior := v_inicio_semana_atual - 7;
  v_fim_semana_anterior := v_inicio_semana_atual - 1;

  -- KPIs financeiros (hoje + ontem) ---------------------------------------
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

  -- KPIs semana (segunda → hoje vs semana anterior Mon–Sun completa) -----
  WITH vendas_locais AS (
    SELECT
      v.total_liquido,
      (v.data AT TIME ZONE v_tz)::date AS d
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
    WHERE v.status = 'CONCLUIDA'
  )
  SELECT
    COALESCE(SUM(total_liquido) FILTER (
      WHERE d >= v_inicio_semana_atual AND d <= v_hoje
    ), 0)::numeric(14, 2),
    COUNT(*) FILTER (
      WHERE d >= v_inicio_semana_atual AND d <= v_hoje
    )::bigint,
    COALESCE(SUM(total_liquido) FILTER (
      WHERE d >= v_inicio_semana_anterior AND d <= v_fim_semana_anterior
    ), 0)::numeric(14, 2),
    COUNT(*) FILTER (
      WHERE d >= v_inicio_semana_anterior AND d <= v_fim_semana_anterior
    )::bigint
  INTO v_fat_sem_atual, v_qtd_sem_atual, v_fat_sem_ant, v_qtd_sem_ant
  FROM vendas_locais;

  v_ticket_sem_atual := CASE
    WHEN v_qtd_sem_atual > 0 THEN ROUND(v_fat_sem_atual / v_qtd_sem_atual, 2)
    ELSE 0
  END;
  v_ticket_sem_ant := CASE
    WHEN v_qtd_sem_ant > 0 THEN ROUND(v_fat_sem_ant / v_qtd_sem_ant, 2)
    ELSE 0
  END;

  -- Margem com gate de cobertura ≥ 95% ------------------------------------
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

  -- Produto mais vendido hoje (schema real: loja via caixas) --------------
  SELECT p.nome, SUM(iv.quantidade)
    INTO v_prod_nome, v_prod_qtd
  FROM public.itens_venda iv
  JOIN public.vendas v ON v.id = iv.venda_id
  JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
  JOIN public.produtos p ON p.id = iv.produto_id
  WHERE v.status = 'CONCLUIDA'
    AND (v.data AT TIME ZONE v_tz)::date = v_hoje
  GROUP BY p.id, p.nome
  ORDER BY SUM(iv.quantidade) DESC
  LIMIT 1;

  IF v_prod_nome IS NOT NULL THEN
    v_produto_mais_vendido := v_prod_nome || ' (' || v_prod_qtd::integer || ' un)';
  END IF;

  -- Série horária do dia --------------------------------------------------
  WITH horas AS (
    SELECT generate_series(0, 23) AS h
  ),
  vendas_hora AS (
    SELECT
      EXTRACT(HOUR FROM (v.data AT TIME ZONE v_tz))::int AS h,
      SUM(v.total_liquido)::numeric(14, 2) AS fat,
      COUNT(*)::int AS qtd
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
    WHERE v.status = 'CONCLUIDA'
      AND v.data >= v_inicio_hoje
      AND v.data < v_inicio_amanha
    GROUP BY 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'hora', h.h,
      'faturamento', COALESCE(vh.fat, 0),
      'vendas', COALESCE(vh.qtd, 0)
    ) ORDER BY h.h
  )
  INTO v_serie
  FROM horas h
  LEFT JOIN vendas_hora vh ON vh.h = h.h;

  -- Estoque crítico -------------------------------------------------------
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', vb.id,
      'nome', vb.nome,
      'sku', vb.codigo_barras,
      'quantidade_atual', vb.quantidade_atual,
      'estoque_minimo', vb.estoque_minimo,
      'deficit', vb.deficit
    ) ORDER BY vb.deficit DESC
  )
  INTO v_estoque_critico
  FROM (
    SELECT id, nome, codigo_barras, quantidade_atual, estoque_minimo, deficit
    FROM public.v_estoque_baixo
    WHERE loja_id = p_loja_id
    ORDER BY deficit DESC
    LIMIT 5
  ) vb;

  -- Atividades recentes (payload estruturado para i18n no cliente) ----------
  WITH ativ_vendas AS (
    SELECT
      v.data AS data_hora,
      'VENDA'::text AS tipo,
      jsonb_build_object(
        'total_liquido', v.total_liquido
      ) AS payload
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
    WHERE v.status = 'CONCLUIDA'
      AND v.data >= v_inicio_atividades
    ORDER BY v.data DESC
    LIMIT 10
  ),
  ativ_estoque AS (
    SELECT
      mel.created_at AS data_hora,
      'ESTOQUE'::text AS tipo,
      jsonb_build_object(
        'tipo_codigo', mel.tipo_codigo,
        'tipo_rotulo', tm.rotulo,
        'produto_nome', COALESCE(p.nome, ''),
        'quantidade_delta', mel.quantidade_delta
      ) AS payload
    FROM public.movimentos_estoque_log mel
    LEFT JOIN public.tipos_movimento_estoque tm ON tm.codigo = mel.tipo_codigo
    LEFT JOIN public.produtos p ON p.id = mel.produto_id
    WHERE mel.loja_id = p_loja_id
      AND mel.created_at >= v_inicio_atividades
    ORDER BY mel.created_at DESC
    LIMIT 10
  ),
  ativ_caixa AS (
    SELECT
      mc.created_at AS data_hora,
      'CAIXA'::text AS tipo,
      jsonb_build_object(
        'tipo_movimento', mc.tipo,
        'valor', mc.valor,
        'motivo', NULLIF(btrim(mc.motivo), '')
      ) AS payload
    FROM public.movimentacoes_caixa mc
    JOIN public.caixas c ON c.id = mc.caixa_id AND c.loja_id = p_loja_id
    WHERE mc.created_at >= v_inicio_atividades
      AND mc.deleted_at IS NULL
      AND mc.status IN ('aprovado', 'pendente')
    ORDER BY mc.created_at DESC
    LIMIT 10
  ),
  todas AS (
    SELECT * FROM ativ_vendas
    UNION ALL
    SELECT * FROM ativ_estoque
    UNION ALL
    SELECT * FROM ativ_caixa
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'data_hora', data_hora,
      'tipo', tipo,
      'payload', payload
    ) ORDER BY data_hora DESC
  )
  INTO v_atividades
  FROM (
    SELECT data_hora, tipo, payload
    FROM todas
    ORDER BY data_hora DESC
    LIMIT 5
  ) top5;

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
    'margem_estimada', v_margem,
    'cobertura_custo', v_cobertura,
    'custo_confiavel', v_custo_confiavel,
    'produto_mais_vendido', v_produto_mais_vendido,
    'serie_horaria_hoje', COALESCE(v_serie, '[]'::jsonb),
    'estoque_critico', COALESCE(v_estoque_critico, '[]'::jsonb),
    'atividades_recentes', COALESCE(v_atividades, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.dashboard_gerente_resumo(uuid, text) IS
  'Dashboard gerente: KPIs dia/ontem, KPIs semana (seg->hoje vs semana anterior), margem com gate de custo, produto mais vendido, serie horaria, estoque critico, atividades com payload JSON (i18n no app). SECURITY INVOKER. Compativel com o esquema real (usuarios, caixas, produtos.preco_custo, v_estoque_baixo, movimentos_estoque_log).';

REVOKE ALL ON FUNCTION public.dashboard_gerente_resumo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_gerente_resumo(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_gerente_resumo(uuid, text) TO service_role;
