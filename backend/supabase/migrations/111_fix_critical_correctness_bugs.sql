-- Correctness hotfixes for recent gerente/compras/fiscal changes.
-- Keeps fixes narrowly scoped to broken RPCs, tenant RLS, and atomic writes.

-- ---------------------------------------------------------------------------
-- 1. Gerente dashboard: use the current schema (vendas -> caixas for loja,
--    produtos.preco_custo, v_estoque_baixo, movimentos_estoque_log).
-- ---------------------------------------------------------------------------
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
  v_ontem := v_hoje - 1;
  v_inicio_hoje := (v_hoje::timestamp AT TIME ZONE v_tz);
  v_inicio_amanha := ((v_hoje + 1)::timestamp AT TIME ZONE v_tz);
  v_inicio_atividades := now() - INTERVAL '48 hours';
  v_inicio_semana_atual := (v_hoje - ((EXTRACT(ISODOW FROM v_hoje))::integer - 1))::date;
  v_inicio_semana_anterior := v_inicio_semana_atual - 7;
  v_fim_semana_anterior := v_inicio_semana_atual - 1;

  WITH vendas_dia AS (
    SELECT v.total_liquido, (v.data AT TIME ZONE v_tz)::date AS d
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

  v_ticket_hoje := CASE WHEN v_qtd_hoje > 0 THEN ROUND(v_fat_hoje / v_qtd_hoje, 2) ELSE 0 END;
  v_ticket_ontem := CASE WHEN v_qtd_ontem > 0 THEN ROUND(v_fat_ontem / v_qtd_ontem, 2) ELSE 0 END;

  WITH vendas_locais AS (
    SELECT v.total_liquido, (v.data AT TIME ZONE v_tz)::date AS d
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
    WHERE v.status = 'CONCLUIDA'
  )
  SELECT
    COALESCE(SUM(total_liquido) FILTER (WHERE d >= v_inicio_semana_atual AND d <= v_hoje), 0)::numeric(14, 2),
    COUNT(*) FILTER (WHERE d >= v_inicio_semana_atual AND d <= v_hoje)::bigint,
    COALESCE(SUM(total_liquido) FILTER (WHERE d >= v_inicio_semana_anterior AND d <= v_fim_semana_anterior), 0)::numeric(14, 2),
    COUNT(*) FILTER (WHERE d >= v_inicio_semana_anterior AND d <= v_fim_semana_anterior)::bigint
  INTO v_fat_sem_atual, v_qtd_sem_atual, v_fat_sem_ant, v_qtd_sem_ant
  FROM vendas_locais;

  v_ticket_sem_atual := CASE WHEN v_qtd_sem_atual > 0 THEN ROUND(v_fat_sem_atual / v_qtd_sem_atual, 2) ELSE 0 END;
  v_ticket_sem_ant := CASE WHEN v_qtd_sem_ant > 0 THEN ROUND(v_fat_sem_ant / v_qtd_sem_ant, 2) ELSE 0 END;

  SELECT
    COALESCE(SUM(iv.quantidade), 0)::numeric(14, 3),
    COALESCE(SUM(CASE WHEN p.preco_custo IS NOT NULL THEN iv.quantidade ELSE 0 END), 0)::numeric(14, 3),
    COALESCE(SUM(iv.quantidade * iv.preco_unitario), 0)::numeric(14, 2),
    COALESCE(SUM(CASE WHEN p.preco_custo IS NOT NULL THEN iv.quantidade * p.preco_custo ELSE 0 END), 0)::numeric(14, 2)
  INTO v_itens_total, v_itens_com_custo, v_receita, v_custo
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
  JOIN public.itens_venda iv ON iv.venda_id = v.id
  JOIN public.produtos p ON p.id = iv.produto_id
  WHERE v.status = 'CONCLUIDA'
    AND (v.data AT TIME ZONE v_tz)::date = v_hoje;

  v_cobertura := CASE WHEN v_itens_total > 0 THEN (v_itens_com_custo / v_itens_total)::numeric(10, 4) ELSE 0 END;
  v_custo_confiavel := v_cobertura >= 0.95 AND v_itens_total > 0;
  v_margem := CASE WHEN v_custo_confiavel THEN (v_receita - v_custo)::numeric(14, 2) ELSE NULL END;

  SELECT p.nome || ' (' || SUM(iv.quantidade)::integer || ' un)'
    INTO v_produto_mais_vendido
  FROM public.itens_venda iv
  JOIN public.vendas v ON v.id = iv.venda_id
  JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
  JOIN public.produtos p ON p.id = iv.produto_id
  WHERE v.status = 'CONCLUIDA'
    AND (v.data AT TIME ZONE v_tz)::date = v_hoje
  GROUP BY p.id, p.nome
  ORDER BY SUM(iv.quantidade) DESC
  LIMIT 1;

  WITH horas AS (
    SELECT generate_series(0, 23) AS h
  ),
  vendas_hora AS (
    SELECT EXTRACT(HOUR FROM (v.data AT TIME ZONE v_tz))::int AS h,
           SUM(v.total_liquido)::numeric(14, 2) AS fat,
           COUNT(*)::int AS qtd
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
    WHERE v.status = 'CONCLUIDA'
      AND v.data >= v_inicio_hoje
      AND v.data < v_inicio_amanha
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object('hora', h.h, 'faturamento', COALESCE(vh.fat, 0), 'vendas', COALESCE(vh.qtd, 0)) ORDER BY h.h)
  INTO v_serie
  FROM horas h
  LEFT JOIN vendas_hora vh ON vh.h = h.h;

  SELECT jsonb_agg(jsonb_build_object(
    'id', vb.id,
    'nome', vb.nome,
    'sku', vb.codigo_barras,
    'quantidade_atual', vb.quantidade_atual,
    'estoque_minimo', vb.estoque_minimo,
    'deficit', vb.deficit
  ) ORDER BY vb.deficit DESC)
  INTO v_estoque_critico
  FROM (
    SELECT id, nome, codigo_barras, quantidade_atual, estoque_minimo, deficit
    FROM public.v_estoque_baixo
    WHERE loja_id = p_loja_id
    ORDER BY deficit DESC
    LIMIT 5
  ) vb;

  WITH ativ_vendas AS (
    SELECT v.data AS data_hora, 'VENDA'::text AS tipo,
           jsonb_build_object('total_liquido', v.total_liquido) AS payload
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id AND c.loja_id = p_loja_id
    WHERE v.status = 'CONCLUIDA'
      AND v.data >= v_inicio_atividades
    ORDER BY v.data DESC
    LIMIT 10
  ),
  ativ_estoque AS (
    SELECT mel.created_at AS data_hora, 'ESTOQUE'::text AS tipo,
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
    SELECT mc.created_at AS data_hora, 'CAIXA'::text AS tipo,
           jsonb_build_object('tipo_movimento', mc.tipo, 'valor', mc.valor, 'motivo', NULLIF(btrim(mc.motivo), '')) AS payload
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
  SELECT jsonb_agg(jsonb_build_object('data_hora', data_hora, 'tipo', tipo, 'payload', payload) ORDER BY data_hora DESC)
  INTO v_atividades
  FROM (
    SELECT data_hora, tipo, payload
    FROM todas
    ORDER BY data_hora DESC
    LIMIT 20
  ) top20;

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
    'produto_mais_vendido', COALESCE(v_produto_mais_vendido, 'Nenhum hoje (0 un)'),
    'serie_horaria_hoje', COALESCE(v_serie, '[]'::jsonb),
    'estoque_critico', COALESCE(v_estoque_critico, '[]'::jsonb),
    'atividades_recentes', COALESCE(v_atividades, '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Fiscal enqueue: vendas has no loja_id; derive loja through caixas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id uuid,
  p_tipo_doc text DEFAULT 'NFC_E_STUB',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_profiles TEXT[] := ARRAY['GERENTE', 'DONO', 'ADMIN'];
  v_uid uuid := auth.uid();
  v_tipo text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id uuid;
  v_prev_status text;
  v_new_status text;
  v_tipo_venda text;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_OBRIGATORIA';
  END IF;

  IF v_tipo NOT IN ('NFC_E_STUB', 'NFCE', 'NFE') THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_TIPO_DOC_INVALIDO';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_AUTH';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      WHERE v.id = p_venda_id
        AND (
          v.operador_id = v_uid
          OR EXISTS (
            SELECT 1
            FROM public.usuarios u
            WHERE u.id = v_uid
              AND u.perfil = ANY(v_admin_profiles)
              AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = c.loja_id)
          )
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

  SELECT v.tipo_venda INTO v_tipo_venda
  FROM public.vendas v
  WHERE v.id = p_venda_id
  LIMIT 1;

  IF v_tipo_venda IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_NAO_ENCONTRADA';
  END IF;

  IF v_tipo_venda = 'SEM_NF' THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_SEM_NF';
  END IF;

  SELECT d.status
  INTO v_prev_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
  ORDER BY d.created_at DESC
  LIMIT 1;

  INSERT INTO public.documentos_fiscais_pendentes (
    venda_id,
    tipo_doc,
    status,
    payload
  )
  VALUES (
    p_venda_id,
    v_tipo,
    'PENDENTE',
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (venda_id, tipo_doc) WHERE status <> 'CANCELADO'
  DO UPDATE SET
    payload = COALESCE(EXCLUDED.payload, public.documentos_fiscais_pendentes.payload),
    status = CASE
      WHEN public.documentos_fiscais_pendentes.status IN ('ERRO', 'CANCELADO') THEN 'PENDENTE'
      ELSE public.documentos_fiscais_pendentes.status
    END,
    proxima_tentativa_em = CASE
      WHEN public.documentos_fiscais_pendentes.status IN ('ERRO', 'CANCELADO') THEN now()
      ELSE public.documentos_fiscais_pendentes.proxima_tentativa_em
    END,
    updated_at = now();

  SELECT d.id, d.status
  INTO v_documento_id, v_new_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
    AND d.status <> 'CANCELADO'
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
  END IF;

  IF v_prev_status IN ('ERRO', 'CANCELADO') AND v_new_status = 'PENDENTE' THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id,
      evento_tipo,
      status_antes,
      status_depois,
      actor_user_id,
      actor_role,
      origem_acao,
      payload
    )
    VALUES (
      v_documento_id,
      'REENFILEIRADO',
      v_prev_status,
      v_new_status,
      v_uid,
      current_setting('request.jwt.claim.role', true),
      'RPC_FISCAL_ENFILEIRAR_DOCUMENTO_VENDA',
      jsonb_build_object('venda_id', p_venda_id, 'tipo_doc', v_tipo)
    );
  END IF;

  RETURN v_documento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Purchase orders: replace permissive policies with loja/profile-scoped RLS.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS oc_auth ON public.ordens_compra;
DROP POLICY IF EXISTS oci_auth ON public.ordens_compra_itens;
DROP POLICY IF EXISTS oc_gerente_loja ON public.ordens_compra;
DROP POLICY IF EXISTS oci_gerente_loja ON public.ordens_compra_itens;

CREATE POLICY oc_gerente_loja ON public.ordens_compra
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = ordens_compra.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = ordens_compra.loja_id)
    )
  );

CREATE POLICY oci_gerente_loja ON public.ordens_compra_itens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ordens_compra oc
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = oc.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ordens_compra oc
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = oc.loja_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Atomic purchase-order create/update RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_ordem_compra(
  p_loja_id uuid,
  p_fornecedor_id uuid DEFAULT NULL,
  p_fornecedor_nome text DEFAULT NULL,
  p_data_emissao date DEFAULT CURRENT_DATE,
  p_data_prevista_chegada date DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_itens jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_oc_id uuid;
  v_item jsonb;
  v_produto_id uuid;
  v_descricao text;
  v_quantidade numeric;
  v_preco_unitario numeric;
  v_unidade text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  IF p_loja_id IS NULL OR (v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id) THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'OC_ITENS_INVALIDOS';
  END IF;

  INSERT INTO public.ordens_compra (
    loja_id, fornecedor_id, fornecedor_nome, data_emissao,
    data_prevista_chegada, observacao, status, created_by
  )
  VALUES (
    p_loja_id, p_fornecedor_id, NULLIF(btrim(COALESCE(p_fornecedor_nome, '')), ''),
    COALESCE(p_data_emissao, CURRENT_DATE), p_data_prevista_chegada,
    NULLIF(btrim(COALESCE(p_observacao, '')), ''), 'RASCUNHO', v_uid
  )
  RETURNING id INTO v_oc_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto_id := NULLIF(v_item->>'produto_id', '')::uuid;
    v_descricao := NULLIF(btrim(COALESCE(v_item->>'descricao', '')), '');
    v_quantidade := COALESCE((v_item->>'quantidade')::numeric, 0);
    v_preco_unitario := COALESCE((v_item->>'preco_unitario')::numeric, 0);
    v_unidade := COALESCE(NULLIF(btrim(COALESCE(v_item->>'unidade_medida', '')), ''), 'UN');

    IF v_quantidade <= 0 OR v_preco_unitario < 0 OR (v_produto_id IS NULL AND v_descricao IS NULL) THEN
      RAISE EXCEPTION 'OC_ITEM_INVALIDO';
    END IF;

    IF v_produto_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id = v_produto_id AND p.loja_id = p_loja_id
    ) THEN
      RAISE EXCEPTION 'OC_PRODUTO_LOJA';
    END IF;

    INSERT INTO public.ordens_compra_itens (
      ordem_id, produto_id, descricao, quantidade, preco_unitario, unidade_medida
    )
    VALUES (
      v_oc_id, v_produto_id, v_descricao, v_quantidade, v_preco_unitario, v_unidade
    );
  END LOOP;

  RETURN v_oc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_ordem_compra(
  p_oc_id uuid,
  p_loja_id uuid,
  p_fornecedor_id uuid DEFAULT NULL,
  p_fornecedor_nome text DEFAULT NULL,
  p_data_emissao date DEFAULT CURRENT_DATE,
  p_data_prevista_chegada date DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_itens jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_oc record;
  v_item jsonb;
  v_produto_id uuid;
  v_descricao text;
  v_quantidade numeric;
  v_preco_unitario numeric;
  v_unidade text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  IF p_loja_id IS NULL OR (v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id) THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'OC_ITENS_INVALIDOS';
  END IF;

  SELECT id, loja_id, status INTO v_oc
  FROM public.ordens_compra
  WHERE id = p_oc_id
    AND loja_id = p_loja_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_oc.status NOT IN ('RASCUNHO', 'CONFIRMADA') THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  UPDATE public.ordens_compra
  SET fornecedor_id = p_fornecedor_id,
      fornecedor_nome = NULLIF(btrim(COALESCE(p_fornecedor_nome, '')), ''),
      data_emissao = COALESCE(p_data_emissao, CURRENT_DATE),
      data_prevista_chegada = p_data_prevista_chegada,
      observacao = NULLIF(btrim(COALESCE(p_observacao, '')), '')
  WHERE id = p_oc_id;

  DELETE FROM public.ordens_compra_itens
  WHERE ordem_id = p_oc_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto_id := NULLIF(v_item->>'produto_id', '')::uuid;
    v_descricao := NULLIF(btrim(COALESCE(v_item->>'descricao', '')), '');
    v_quantidade := COALESCE((v_item->>'quantidade')::numeric, 0);
    v_preco_unitario := COALESCE((v_item->>'preco_unitario')::numeric, 0);
    v_unidade := COALESCE(NULLIF(btrim(COALESCE(v_item->>'unidade_medida', '')), ''), 'UN');

    IF v_quantidade <= 0 OR v_preco_unitario < 0 OR (v_produto_id IS NULL AND v_descricao IS NULL) THEN
      RAISE EXCEPTION 'OC_ITEM_INVALIDO';
    END IF;

    IF v_produto_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id = v_produto_id AND p.loja_id = p_loja_id
    ) THEN
      RAISE EXCEPTION 'OC_PRODUTO_LOJA';
    END IF;

    INSERT INTO public.ordens_compra_itens (
      ordem_id, produto_id, descricao, quantidade, preco_unitario, unidade_medida
    )
    VALUES (
      p_oc_id, v_produto_id, v_descricao, v_quantidade, v_preco_unitario, v_unidade
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_ordem_compra(uuid, uuid, text, date, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_ordem_compra(uuid, uuid, text, date, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_ordem_compra(uuid, uuid, text, date, date, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.atualizar_ordem_compra(uuid, uuid, uuid, text, date, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_ordem_compra(uuid, uuid, uuid, text, date, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_ordem_compra(uuid, uuid, uuid, text, date, date, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Receiving and accounts-payable payment RPCs: row locks and bounds checks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receber_ordem_compra(
  p_oc_id  uuid,
  p_itens  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_oc record;
  v_el jsonb;
  v_item_id uuid;
  v_qtd_rec numeric;
  v_item record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_oc
  FROM public.ordens_compra
  WHERE id = p_oc_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status <> 'EM_TRANSITO' THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'OC_ITENS_INVALIDOS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_itens) AS t(value)
    GROUP BY value->>'item_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'OC_ITEM_DUPLICADO';
  END IF;

  FOR v_el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_item_id := (v_el->>'item_id')::uuid;
    v_qtd_rec := COALESCE((v_el->>'quantidade_recebida')::numeric, 0);

    IF v_qtd_rec < 0 THEN
      RAISE EXCEPTION 'OC_QTD_INVALIDA';
    END IF;

    SELECT id, produto_id, quantidade INTO v_item
    FROM public.ordens_compra_itens
    WHERE id = v_item_id
      AND ordem_id = p_oc_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OC_ITEM_INVALIDO';
    END IF;

    IF v_qtd_rec > v_item.quantidade THEN
      RAISE EXCEPTION 'OC_QTD_EXCEDE_PEDIDA';
    END IF;

    UPDATE public.ordens_compra_itens
    SET quantidade_recebida = v_qtd_rec
    WHERE id = v_item_id;

    IF v_item.produto_id IS NOT NULL AND v_qtd_rec > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_item.produto_id, v_oc.loja_id, v_qtd_rec, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version = public.estoque.version + 1,
            updated_at = now();

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_oc.loja_id,
        v_item.produto_id,
        'ENTRADA_OC',
        v_qtd_rec,
        v_uid,
        format('Recebimento OC %s', p_oc_id::text)
      );
    END IF;
  END LOOP;

  UPDATE public.ordens_compra
  SET status = 'RECEBIDA'
  WHERE id = p_oc_id
    AND status = 'EM_TRANSITO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_contas_pagar(
  p_conta_id   uuid,
  p_valor      numeric,
  p_forma      text,
  p_data       timestamptz DEFAULT now(),
  p_observacao text        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_conta record;
  v_novo_pago numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PAGAMENTO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'PAGAMENTO_PERFIL';
  END IF;

  SELECT id, loja_id, valor_total, valor_pago, status
    INTO v_conta
    FROM public.contas_pagar
   WHERE id = p_conta_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_conta.loja_id THEN
    RAISE EXCEPTION 'PAGAMENTO_LOJA';
  END IF;

  IF v_conta.status IN ('PAGO','CANCELADO') THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_ENCERRADA';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'PAGAMENTO_VALOR_INVALIDO';
  END IF;

  IF p_forma IS NULL OR p_forma NOT IN ('DINHEIRO','PIX','CARTAO','BOLETO','TRANSF') THEN
    RAISE EXCEPTION 'PAGAMENTO_FORMA_INVALIDA';
  END IF;

  v_novo_pago := v_conta.valor_pago + p_valor;

  IF v_novo_pago > v_conta.valor_total THEN
    RAISE EXCEPTION 'PAGAMENTO_VALOR_EXCEDE_SALDO';
  END IF;

  INSERT INTO public.contas_pagar_pagamentos (
    conta_id, valor, forma_pagamento, data_pagamento, observacao, usuario_id
  ) VALUES (
    p_conta_id, p_valor, p_forma, COALESCE(p_data, now()), p_observacao, v_uid
  );

  UPDATE public.contas_pagar
     SET valor_pago = v_novo_pago,
         status = CASE
                    WHEN v_novo_pago >= valor_total THEN 'PAGO'
                    ELSE 'PARCIAL'
                  END
   WHERE id = p_conta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Caixa web v3: classify sale fiscal type before optional enqueue.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v3(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]'::jsonb,
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL
)
RETURNS TABLE (
  venda_id uuid,
  status text,
  mensagem text,
  dados_fiscais jsonb,
  itens_atualizados jsonb,
  estoque_baixado jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_perfil text;
  v_suspensas text;
  v_doc_id uuid;
  v_payload jsonb;
  v_row_doc jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_OBRIGATORIO';
  END IF;

  SELECT u.perfil INTO v_perfil
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    SELECT c.valor INTO v_suspensas
    FROM public.configuracoes_gerais c
    WHERE c.chave = 'vendas_suspensas';

    IF v_suspensas = 'true' THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_VENDAS_SUSPENSAS';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendas v
    WHERE v.id = p_venda_id
      AND v.status = 'CONCLUIDA'
  ) THEN
    SELECT jsonb_build_object('documento_fiscal_id', d.id, 'status', d.status, 'tipo_doc', d.tipo_doc)
    INTO v_row_doc
    FROM public.documentos_fiscais_pendentes d
    WHERE d.venda_id = p_venda_id
      AND d.status <> 'CANCELADO'
      AND d.deleted_at IS NULL
    ORDER BY d.created_at DESC
    LIMIT 1;

    RETURN QUERY
    SELECT p_venda_id, 'CONCLUIDA'::text, NULL::text, v_row_doc, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM public.finalizar_venda_transacional_canonica_v2(
    p_venda_id,
    p_caixa_id,
    p_operador_id,
    p_forma_pagamento,
    p_total_bruto,
    p_total_desconto,
    p_total_liquido,
    p_pagamentos,
    p_itens,
    p_desconto_gerente_token,
    p_desconto_gerente_percentual,
    p_strict_manager_discount_auth
  );

  UPDATE public.vendas v
  SET tipo_venda = CASE
    WHEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) AS item
      JOIN public.produtos p ON p.id = (item->>'produto_id')::uuid
      WHERE p.tem_nf IS FALSE
    ) THEN 'SEM_NF'
    ELSE 'COM_NF'
  END
  WHERE v.id = p_venda_id;

  IF p_fiscal_auto_enqueue THEN
    v_payload := jsonb_build_object(
      'origem', 'caixa_web_rpc_v3',
      'venda_id', p_venda_id,
      'loja_id', p_loja_id,
      'caixa_id', p_caixa_id,
      'operador_id', v_uid,
      'forma_pagamento', p_forma_pagamento,
      'pagamentos', COALESCE(p_pagamentos, '[]'::jsonb),
      'totais', jsonb_build_object('bruto', p_total_bruto, 'desconto', p_total_desconto, 'liquido', p_total_liquido),
      'itens', p_itens,
      'auditoria', jsonb_strip_nulls(jsonb_build_object(
        'ip_address', p_ip_address,
        'user_agent', p_user_agent,
        'device_id', p_device_id,
        'terminal_id', p_terminal_id
      ))
    );

    BEGIN
      v_doc_id := public.fiscal_enfileirar_documento_venda(p_venda_id, 'NFC_E_STUB', v_payload);
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM = 'FISCAL_ENQUEUE_VENDA_SEM_NF' THEN
          v_doc_id := NULL;
        ELSE
          RAISE;
        END IF;
    END;

    RETURN QUERY
    SELECT
      p_venda_id,
      'CONCLUIDA'::text,
      NULL::text,
      CASE WHEN v_doc_id IS NOT NULL
        THEN jsonb_build_object('documento_fiscal_id', v_doc_id, 'tipo_doc', 'NFC_E_STUB')
        ELSE NULL
      END,
      NULL::jsonb,
      NULL::jsonb;
  ELSE
    RETURN QUERY
    SELECT p_venda_id, 'CONCLUIDA'::text, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) TO service_role;
