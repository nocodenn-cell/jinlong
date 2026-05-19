-- RPC atômica de importação completa de NF-e via XML (Modelo 55).
-- Responsabilidades:
--   1. Upsert fornecedor por CNPJ
--   2. Idempotência por chave_acesso (notas_fiscais_entradas + importacoes_nfe)
--   3. Por item: matching De/Para → upsert produto_fornecedor_match → estoque → CMV ponderado → kardex
--   4. Injeção de duplicatas em contas_a_pagar (status PENDENTE)

CREATE OR REPLACE FUNCTION public.registrar_entrada_nfe_completa(
  p_chave_acesso    text,
  p_numero_nf       text,
  p_serie           text,
  p_data_emissao    date,
  p_fornecedor_cnpj text,
  p_fornecedor_nome text,
  p_loja_id         uuid,
  p_totais          jsonb,   -- {v_nf, v_produtos, v_frete, v_icms, v_ipi, v_st, v_desconto}
  p_itens           jsonb,   -- [{nome_produto, gtin, ref_fornecedor, ncm, u_com, q_com, v_un_com, v_prod, v_icms, v_ipi, v_st, fator, atualizar_custo}]
  p_duplicatas      jsonb,   -- [{numero, vencimento, valor}]
  p_atualizar_custo boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_perfil           text;
  v_loja_usuario     uuid;
  v_cnpj             text;
  v_forn_id          uuid;
  v_nfe_id           uuid;
  v_imp_id           uuid;

  -- Totais extraídos
  v_tot_v_nf         numeric;
  v_tot_v_produtos   numeric;
  v_tot_v_frete      numeric;
  v_tot_v_icms       numeric;
  v_tot_v_ipi        numeric;
  v_tot_v_st         numeric;
  v_tot_v_desc       numeric;

  -- Variáveis de item
  el                 jsonb;
  v_gtin             text;
  v_ref              text;
  v_nome             text;
  v_q_com            numeric;
  v_fator            numeric;
  v_v_un             numeric;
  v_v_prod           numeric;
  v_u_com            text;
  v_ncm              text;
  v_item_v_icms      numeric;
  v_item_v_ipi       numeric;
  v_item_v_st        numeric;
  v_frete_rateado    numeric;
  v_custo_total_item numeric;
  v_q_entrada        numeric;
  v_custo_unit       numeric;
  v_produto_id       uuid;
  v_status_match     text;
  v_estoque_atual    numeric;
  v_custo_atual      numeric;
  v_cmp              numeric;
  v_item_atualiza    boolean;
  v_obs              text;
  v_n                int := 0;

  -- Variáveis de duplicata
  dup                jsonb;
  v_dup_num          text;
  v_dup_venc         date;
  v_dup_valor        numeric;
  v_n_dup            int := 0;
BEGIN
  -- -----------------------------------------------------------------------
  -- Autenticação e autorização
  -- -----------------------------------------------------------------------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NFE_XML_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id
  INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'NFE_XML_PERFIL';
  END IF;

  IF v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'NFE_XML_LOJA';
  END IF;

  -- -----------------------------------------------------------------------
  -- Validações de entrada
  -- -----------------------------------------------------------------------
  v_cnpj := regexp_replace(COALESCE(p_fornecedor_cnpj, ''), '\D', '', 'g');
  IF length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'NFE_XML_CNPJ_INVALIDO';
  END IF;

  IF length(trim(COALESCE(p_chave_acesso, ''))) <> 44 THEN
    RAISE EXCEPTION 'NFE_XML_CHAVE_INVALIDA';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'NFE_XML_ITENS_VAZIO';
  END IF;

  -- -----------------------------------------------------------------------
  -- Extrair totais fiscais
  -- -----------------------------------------------------------------------
  v_tot_v_nf       := COALESCE((p_totais->>'v_nf')::numeric,       0);
  v_tot_v_produtos := COALESCE((p_totais->>'v_produtos')::numeric,  0);
  v_tot_v_frete    := COALESCE((p_totais->>'v_frete')::numeric,     0);
  v_tot_v_icms     := COALESCE((p_totais->>'v_icms')::numeric,      0);
  v_tot_v_ipi      := COALESCE((p_totais->>'v_ipi')::numeric,       0);
  v_tot_v_st       := COALESCE((p_totais->>'v_st')::numeric,        0);
  v_tot_v_desc     := COALESCE((p_totais->>'v_desconto')::numeric,  0);

  -- -----------------------------------------------------------------------
  -- Upsert fornecedor (autocadastro por CNPJ)
  -- -----------------------------------------------------------------------
  INSERT INTO public.fornecedores (cnpj, nome)
  VALUES (v_cnpj, COALESCE(NULLIF(trim(p_fornecedor_nome), ''), 'Fornecedor'))
  ON CONFLICT (cnpj) DO UPDATE SET
    nome       = EXCLUDED.nome,
    updated_at = now()
  RETURNING id INTO v_forn_id;

  -- -----------------------------------------------------------------------
  -- Idempotência via notas_fiscais_entradas
  -- -----------------------------------------------------------------------
  INSERT INTO public.notas_fiscais_entradas (
    chave_acesso, numero_nf, serie, data_emissao,
    fornecedor_id, loja_id, usuario_id,
    v_nf, v_produtos, v_frete, v_icms, v_ipi, v_st, v_desconto,
    status
  ) VALUES (
    trim(p_chave_acesso),
    NULLIF(trim(COALESCE(p_numero_nf, '')), ''),
    NULLIF(trim(COALESCE(p_serie,     '')), ''),
    p_data_emissao,
    v_forn_id, p_loja_id, v_uid,
    v_tot_v_nf, v_tot_v_produtos, v_tot_v_frete,
    v_tot_v_icms, v_tot_v_ipi, v_tot_v_st, v_tot_v_desc,
    'PROCESSADA'
  )
  ON CONFLICT (chave_acesso) DO NOTHING
  RETURNING id INTO v_nfe_id;

  IF v_nfe_id IS NULL THEN
    RAISE EXCEPTION 'NFE_XML_DUPLICADA';
  END IF;

  -- Compatibilidade com importacoes_nfe (idempotência legada)
  INSERT INTO public.importacoes_nfe (chave_acesso, numero_nf, fornecedor_id, loja_id, usuario_id)
  VALUES (
    trim(p_chave_acesso),
    NULLIF(trim(COALESCE(p_numero_nf, '')), ''),
    v_forn_id, p_loja_id, v_uid
  )
  ON CONFLICT (chave_acesso) DO NOTHING
  RETURNING id INTO v_imp_id;

  IF v_imp_id IS NOT NULL THEN
    UPDATE public.notas_fiscais_entradas
    SET importacao_nfe_id = v_imp_id
    WHERE id = v_nfe_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- Loop de itens
  -- -----------------------------------------------------------------------
  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_nome  := COALESCE(NULLIF(trim(el->>'nome_produto'), ''), 'Produto sem nome');
    v_gtin  := NULLIF(trim(COALESCE(el->>'gtin', '')), '');
    v_ref   := COALESCE(NULLIF(trim(el->>'ref_fornecedor'), ''), '');
    IF v_ref = '' THEN RAISE EXCEPTION 'NFE_XML_REF_OBRIGATORIA'; END IF;

    v_q_com        := COALESCE((el->>'q_com')::numeric,        0);
    v_fator        := COALESCE((el->>'fator')::numeric,        1);
    v_v_un         := COALESCE((el->>'v_un_com')::numeric,     0);
    v_v_prod       := COALESCE((el->>'v_prod')::numeric,       v_q_com * v_v_un);
    v_u_com        := NULLIF(trim(COALESCE(el->>'u_com', '')), '');
    v_ncm          := NULLIF(trim(COALESCE(el->>'ncm',   '')), '');
    v_item_v_icms  := COALESCE((el->>'v_icms')::numeric,       0);
    v_item_v_ipi   := COALESCE((el->>'v_ipi')::numeric,        0);
    v_item_v_st    := COALESCE((el->>'v_st')::numeric,         0);
    v_item_atualiza := COALESCE((el->>'atualizar_custo')::boolean, p_atualizar_custo);

    IF v_fator IS NULL OR v_fator <= 0 THEN RAISE EXCEPTION 'NFE_XML_FATOR_INVALIDO';     END IF;
    IF v_q_com IS NULL OR v_q_com <  0 THEN RAISE EXCEPTION 'NFE_XML_QTD_INVALIDA';       END IF;

    v_q_entrada := v_q_com * v_fator;
    IF v_q_entrada <= 0 THEN RAISE EXCEPTION 'NFE_XML_QTD_ENTRADA_ZERO'; END IF;

    -- Rateio proporcional do frete sobre o valor do item
    v_frete_rateado := 0;
    IF v_tot_v_produtos > 0 THEN
      v_frete_rateado := v_tot_v_frete * (v_v_prod / v_tot_v_produtos);
    END IF;

    v_custo_total_item := v_v_prod + v_item_v_icms + v_item_v_ipi + v_item_v_st + v_frete_rateado;
    v_custo_unit       := v_custo_total_item / v_q_entrada;
    IF v_custo_unit < 0 THEN RAISE EXCEPTION 'NFE_XML_CUSTO_INVALIDO'; END IF;

    -- -------------------------------------------------------------------
    -- Matching De/Para (3 etapas)
    -- -------------------------------------------------------------------
    v_produto_id  := NULL;
    v_status_match := 'NOVO';

    -- 1) GTIN / código de barras
    IF v_gtin IS NOT NULL AND upper(v_gtin) <> 'SEM GTIN' AND length(v_gtin) >= 8 THEN
      SELECT p.id INTO v_produto_id
      FROM public.produtos p
      WHERE p.codigo_barras = v_gtin
      LIMIT 1;
      IF v_produto_id IS NOT NULL THEN v_status_match := 'EXISTENTE'; END IF;
    END IF;

    -- 2) produto_fornecedor_match (De/Para explícito)
    IF v_produto_id IS NULL THEN
      SELECT pfm.produto_id INTO v_produto_id
      FROM public.produto_fornecedor_match pfm
      WHERE pfm.fornecedor_id = v_forn_id
        AND pfm.ref_fornecedor = v_ref
        AND pfm.ativo = true
      LIMIT 1;
      IF v_produto_id IS NOT NULL THEN v_status_match := 'EXISTENTE'; END IF;
    END IF;

    -- 3) referencia_fornecedor no cadastro do produto
    IF v_produto_id IS NULL THEN
      SELECT p.id INTO v_produto_id
      FROM public.produtos p
      WHERE p.fornecedor_id = v_forn_id
        AND p.referencia_fornecedor = v_ref
      LIMIT 1;
      IF v_produto_id IS NOT NULL THEN v_status_match := 'EXISTENTE'; END IF;
    END IF;

    -- -------------------------------------------------------------------
    -- Criar produto novo se não encontrado
    -- -------------------------------------------------------------------
    IF v_produto_id IS NULL THEN
      INSERT INTO public.produtos (
        nome, codigo_barras, preco_varejo, preco_custo,
        unidade_medida, origem, tem_nf, ativo,
        fornecedor_id, referencia_fornecedor, observacao
      ) VALUES (
        v_nome,
        CASE
          WHEN v_gtin IS NOT NULL AND upper(v_gtin) <> 'SEM GTIN' AND length(v_gtin) >= 8
          THEN v_gtin ELSE NULL
        END,
        ROUND(GREATEST(v_custo_unit * 1.5, 0.01), 2),
        ROUND(v_custo_unit, 4),
        COALESCE(left(v_u_com, 16), 'UN'),
        'brasil_nf', true, true,
        v_forn_id, v_ref,
        CASE WHEN v_ncm IS NOT NULL THEN 'NCM ' || v_ncm ELSE NULL END
      )
      RETURNING id INTO v_produto_id;

      INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
      VALUES (p_loja_id, v_produto_id, 0, 0)
      ON CONFLICT (loja_id, produto_id) DO NOTHING;

    ELSE
      -- Produto existente: atualizar custo com Custo Médio Ponderado
      IF v_item_atualiza THEN
        SELECT e.quantidade_atual, p.preco_custo
        INTO v_estoque_atual, v_custo_atual
        FROM public.estoque e
        JOIN public.produtos p ON p.id = e.produto_id
        WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id;

        v_estoque_atual := GREATEST(COALESCE(v_estoque_atual, 0), 0);
        v_custo_atual   := COALESCE(v_custo_atual, 0);

        IF (v_estoque_atual + v_q_entrada) > 0 THEN
          v_cmp := (v_estoque_atual * v_custo_atual + v_q_entrada * v_custo_unit)
                   / (v_estoque_atual + v_q_entrada);
        ELSE
          v_cmp := v_custo_unit;
        END IF;

        UPDATE public.produtos
        SET preco_custo = ROUND(v_cmp, 4),
            updated_at  = now()
        WHERE id = v_produto_id;
      END IF;
    END IF;

    -- -------------------------------------------------------------------
    -- Upsert produto_fornecedor_match (mantém De/Para atualizado)
    -- -------------------------------------------------------------------
    INSERT INTO public.produto_fornecedor_match (
      fornecedor_id, produto_id, ref_fornecedor, gtin_xml, u_com_xml, fator_conversao
    ) VALUES (
      v_forn_id, v_produto_id, v_ref, v_gtin, v_u_com, v_fator
    )
    ON CONFLICT (fornecedor_id, ref_fornecedor) DO UPDATE SET
      produto_id      = EXCLUDED.produto_id,
      gtin_xml        = EXCLUDED.gtin_xml,
      u_com_xml       = EXCLUDED.u_com_xml,
      fator_conversao = EXCLUDED.fator_conversao,
      updated_at      = now();

    -- -------------------------------------------------------------------
    -- Registrar item na nota
    -- -------------------------------------------------------------------
    INSERT INTO public.itens_nota_fiscal_entrada (
      nota_fiscal_entrada_id, produto_id,
      ref_fornecedor, nome_produto, gtin, ncm, u_com,
      q_com, v_un_com, v_prod,
      v_icms, v_ipi, v_st,
      fator_conversao, quantidade_entrada, custo_medio_unitario,
      status_match
    ) VALUES (
      v_nfe_id, v_produto_id,
      v_ref, v_nome, v_gtin, v_ncm, v_u_com,
      v_q_com, v_v_un, v_v_prod,
      v_item_v_icms, v_item_v_ipi, v_item_v_st,
      v_fator, v_q_entrada, ROUND(v_custo_unit, 4),
      v_status_match
    );

    -- -------------------------------------------------------------------
    -- Incremento de estoque (com lock por linha)
    -- -------------------------------------------------------------------
    SELECT e.quantidade_atual INTO v_estoque_atual
    FROM public.estoque e
    WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
      VALUES (p_loja_id, v_produto_id, 0, 0);

      SELECT e.quantidade_atual INTO v_estoque_atual
      FROM public.estoque e
      WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id
      FOR UPDATE;
    END IF;

    UPDATE public.estoque e
    SET quantidade_atual = e.quantidade_atual + v_q_entrada,
        version         = e.version + 1,
        updated_at      = now()
    WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id;

    -- -------------------------------------------------------------------
    -- Kardex (movimentos_estoque_log)
    -- -------------------------------------------------------------------
    v_obs := format(
      'NF-e XML | chave=%s | ref=%s | q_xml=%s | fator=%s | custo_unit=%s | NCM=%s',
      trim(p_chave_acesso), v_ref, v_q_com::text, v_fator::text,
      ROUND(v_custo_unit, 4)::text, COALESCE(v_ncm, '-')
    );

    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo,
      quantidade_delta, remessa_id, usuario_id, observacao
    ) VALUES (
      p_loja_id, v_produto_id, 'ENTRADA_NFE',
      v_q_entrada, NULL, v_uid, v_obs
    );

    v_n := v_n + 1;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- Loop de duplicatas → contas_a_pagar
  -- -----------------------------------------------------------------------
  IF p_duplicatas IS NOT NULL AND jsonb_typeof(p_duplicatas) = 'array' THEN
    FOR dup IN SELECT value FROM jsonb_array_elements(p_duplicatas) AS t(value)
    LOOP
      v_dup_num   := NULLIF(trim(COALESCE(dup->>'numero', '')), '');
      v_dup_valor := COALESCE((dup->>'valor')::numeric, 0);

      BEGIN
        v_dup_venc := (dup->>'vencimento')::date;
      EXCEPTION WHEN others THEN
        -- Fallback seguro: 30 dias
        v_dup_venc := CURRENT_DATE + interval '30 days';
      END;

      IF v_dup_valor > 0 THEN
        INSERT INTO public.contas_a_pagar (
          nota_fiscal_entrada_id, fornecedor_id, loja_id,
          numero_duplicata, descricao, valor, vencimento, status
        ) VALUES (
          v_nfe_id, v_forn_id, p_loja_id,
          v_dup_num,
          format(
            'NF-e %s · dup %s',
            COALESCE(NULLIF(trim(COALESCE(p_numero_nf,'')), ''), trim(p_chave_acesso)),
            COALESCE(v_dup_num, (v_n_dup + 1)::text)
          ),
          ROUND(v_dup_valor, 2),
          v_dup_venc,
          'PENDENTE'
        );
        v_n_dup := v_n_dup + 1;
      END IF;
    END LOOP;
  END IF;

  -- -----------------------------------------------------------------------
  -- Resultado
  -- -----------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',                     true,
    'nota_fiscal_entrada_id', v_nfe_id,
    'itens_processados',      v_n,
    'duplicatas_criadas',     v_n_dup
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_entrada_nfe_completa(
  text, text, text, date, text, text, uuid, jsonb, jsonb, jsonb, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_entrada_nfe_completa(
  text, text, text, date, text, text, uuid, jsonb, jsonb, jsonb, boolean
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_entrada_nfe_completa(
  text, text, text, date, text, text, uuid, jsonb, jsonb, jsonb, boolean
) TO service_role;

COMMENT ON FUNCTION public.registrar_entrada_nfe_completa IS
  'Importação atômica completa de NF-e XML: idempotente por chave_acesso, '
  'atualiza CMV ponderado, mantém tabela De/Para e injeta duplicatas em contas_a_pagar.';
