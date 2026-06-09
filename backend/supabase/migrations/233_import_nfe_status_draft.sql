-- R1: produtos novos via NF-e entram como DRAFT (não vendáveis até publicação manual)

CREATE OR REPLACE FUNCTION public.importar_nfe_transacao(
  p_chave_acesso     text,
  p_numero_nf        text,
  p_fornecedor_cnpj  text,
  p_fornecedor_nome  text,
  p_loja_id          uuid,
  p_itens            jsonb,
  p_atualizar_custo  boolean DEFAULT true,
  p_duplicatas       jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_cnpj text;
  v_forn_id uuid;
  v_imp_id uuid;
  el jsonb;
  dup jsonb;
  v_gtin text;
  v_gtin_valido text;
  v_ref text;
  v_nome text;
  v_q_com numeric;
  v_fator numeric;
  v_v_un numeric;
  v_u_com text;
  v_ncm text;
  v_ncm_valido text;
  v_acao text;
  v_destino uuid;
  v_item_atualiza_custo boolean;
  v_q_entrada numeric;
  v_custo_unit numeric;
  v_produto_id uuid;
  v_atual numeric;
  v_obs text;
  v_n int := 0;
  v_novos int := 0;
  v_vinculados int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  v_cnpj := regexp_replace(COALESCE(p_fornecedor_cnpj, ''), '\D', '', 'g');
  IF length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CNPJ_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_ITENS_VAZIO';
  END IF;

  IF length(trim(COALESCE(p_chave_acesso, ''))) <> 44 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CHAVE_INVALIDA';
  END IF;

  INSERT INTO public.fornecedores (cnpj, nome)
  VALUES (v_cnpj, COALESCE(NULLIF(trim(p_fornecedor_nome), ''), 'Fornecedor'))
  ON CONFLICT (cnpj) DO UPDATE SET
    nome = EXCLUDED.nome,
    updated_at = now()
  RETURNING id INTO v_forn_id;

  INSERT INTO public.importacoes_nfe (chave_acesso, numero_nf, fornecedor_id, loja_id, usuario_id)
  VALUES (trim(p_chave_acesso), NULLIF(trim(p_numero_nf), ''), v_forn_id, p_loja_id, v_uid)
  ON CONFLICT (chave_acesso) DO NOTHING
  RETURNING id INTO v_imp_id;

  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_DUPLICADA';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_nome := COALESCE(NULLIF(trim(el->>'nome_produto'), ''), 'Produto sem nome');
    v_gtin := NULLIF(trim(COALESCE(el->>'gtin', '')), '');
    v_ref  := COALESCE(NULLIF(trim(el->>'ref_fornecedor'), ''), '');
    IF v_ref = '' THEN
      RAISE EXCEPTION 'IMPORT_NFE_REF_OBRIGATORIA';
    END IF;

    v_q_com := COALESCE((el->>'q_com')::numeric, 0);
    v_fator := COALESCE((el->>'fator')::numeric, 1);
    v_v_un  := COALESCE((el->>'v_un_com')::numeric, 0);
    v_u_com := NULLIF(trim(COALESCE(el->>'u_com', '')), '');
    v_ncm   := NULLIF(trim(COALESCE(el->>'ncm', '')), '');
    v_item_atualiza_custo := COALESCE((el->>'atualizar_custo')::boolean, p_atualizar_custo);
    v_acao  := upper(NULLIF(trim(COALESCE(el->>'acao', '')), ''));
    v_destino := NULLIF(trim(COALESCE(el->>'produto_id_destino', '')), '')::uuid;

    v_ncm_valido := CASE WHEN v_ncm ~ '^\d{8}$' THEN v_ncm ELSE NULL END;
    v_gtin_valido := CASE
      WHEN v_gtin IS NOT NULL AND v_gtin ~ '^\d{8,}$' THEN v_gtin
      ELSE NULL
    END;

    IF v_fator IS NULL OR v_fator <= 0 THEN RAISE EXCEPTION 'IMPORT_NFE_FATOR_INVALIDO'; END IF;
    IF v_q_com IS NULL OR v_q_com < 0 THEN RAISE EXCEPTION 'IMPORT_NFE_QTD_INVALIDA'; END IF;

    v_q_entrada := v_q_com * v_fator;
    IF v_q_entrada <= 0 THEN RAISE EXCEPTION 'IMPORT_NFE_QTD_ENTRADA_ZERO'; END IF;

    v_custo_unit := v_v_un / v_fator;
    IF v_custo_unit IS NULL OR v_custo_unit < 0 THEN RAISE EXCEPTION 'IMPORT_NFE_CUSTO_INVALIDO'; END IF;

    v_produto_id := NULL;

    IF v_destino IS NOT NULL THEN
      SELECT p.id INTO v_produto_id
        FROM public.produtos p
       WHERE p.id = v_destino AND p.loja_id = p_loja_id
       LIMIT 1;
      IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'IMPORT_NFE_DESTINO_INVALIDO';
      END IF;
    END IF;

    IF v_produto_id IS NULL THEN
      SELECT v.produto_id INTO v_produto_id
        FROM public.vinculos_fornecedor_produto v
       WHERE v.loja_id = p_loja_id
         AND v.fornecedor_id = v_forn_id
         AND v.ref_fornecedor = v_ref
       LIMIT 1;
    END IF;

    IF v_produto_id IS NULL AND v_gtin_valido IS NOT NULL THEN
      SELECT p.id INTO v_produto_id
        FROM public.produtos p
       WHERE p.codigo_barras = v_gtin_valido AND p.loja_id = p_loja_id
       LIMIT 1;
    END IF;

    IF v_produto_id IS NULL THEN
      SELECT p.id INTO v_produto_id
        FROM public.produtos p
       WHERE p.fornecedor_id = v_forn_id
         AND p.referencia_fornecedor = v_ref
         AND p.loja_id = p_loja_id
       LIMIT 1;
    END IF;

    IF v_produto_id IS NULL THEN
      IF v_acao = 'VINCULAR' THEN
        RAISE EXCEPTION 'IMPORT_NFE_ITEM_NAO_RESOLVIDO';
      END IF;

      INSERT INTO public.produtos (
        nome, codigo_barras, fornecedor_id, referencia_fornecedor,
        ncm, preco_custo, preco_varejo, unidade_medida,
        origem, tem_nf, ativo, status_publicacao, loja_id
      )
      VALUES (
        v_nome,
        v_gtin_valido,
        v_forn_id, v_ref,
        v_ncm_valido,
        ROUND(v_custo_unit, 2),
        ROUND(GREATEST(v_custo_unit * 1.5, 0.01), 2),
        COALESCE(left(v_u_com, 16), 'UN'),
        'brasil_nf', true, false, 'DRAFT',
        p_loja_id
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_produto_id;

      IF v_produto_id IS NULL THEN
        IF v_gtin_valido IS NOT NULL THEN
          SELECT p.id INTO v_produto_id FROM public.produtos p
           WHERE p.codigo_barras = v_gtin_valido AND p.loja_id = p_loja_id LIMIT 1;
        END IF;
        IF v_produto_id IS NULL THEN
          SELECT p.id INTO v_produto_id FROM public.produtos p
           WHERE p.fornecedor_id = v_forn_id AND p.referencia_fornecedor = v_ref AND p.loja_id = p_loja_id LIMIT 1;
        END IF;
      END IF;

      IF v_produto_id IS NOT NULL THEN
        INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
        VALUES (v_produto_id, p_loja_id, 0, 0, 0)
        ON CONFLICT (loja_id, produto_id) DO NOTHING;
        v_novos := v_novos + 1;
      END IF;
    ELSE
      IF v_item_atualiza_custo AND v_custo_unit > 0 THEN
        UPDATE public.produtos SET preco_custo = ROUND(v_custo_unit, 2) WHERE id = v_produto_id;
      END IF;

      UPDATE public.produtos p
         SET ncm           = COALESCE(p.ncm, v_ncm_valido),
             codigo_barras = COALESCE(p.codigo_barras, v_gtin_valido),
             updated_at    = now()
       WHERE p.id = v_produto_id
         AND (
           (p.ncm IS NULL AND v_ncm_valido IS NOT NULL) OR
           (p.codigo_barras IS NULL AND v_gtin_valido IS NOT NULL)
         );

      v_vinculados := v_vinculados + 1;
    END IF;

    IF v_produto_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.vinculos_fornecedor_produto (
      loja_id, fornecedor_id, ref_fornecedor, produto_id, gtin_origem, criado_por
    )
    VALUES (p_loja_id, v_forn_id, v_ref, v_produto_id, v_gtin_valido, v_uid)
    ON CONFLICT (loja_id, fornecedor_id, ref_fornecedor) DO UPDATE
      SET produto_id  = EXCLUDED.produto_id,
          gtin_origem = COALESCE(public.vinculos_fornecedor_produto.gtin_origem, EXCLUDED.gtin_origem),
          updated_at  = now();

    SELECT e.quantidade_atual INTO v_atual
      FROM public.estoque e
     WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id;

    IF v_atual IS NULL THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_produto_id, p_loja_id, v_q_entrada, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version = public.estoque.version + 1,
            updated_at = now();
    ELSE
      UPDATE public.estoque e
        SET quantidade_atual = e.quantidade_atual + v_q_entrada,
            version = e.version + 1,
            updated_at = now()
       WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id;
    END IF;

    v_obs := format(
      'NF-e importada | chave=%s | ref=%s | q_xml=%s | fator=%s | NCM=%s',
      trim(p_chave_acesso), v_ref, v_q_com::text, v_fator::text, COALESCE(v_ncm, '-')
    );

    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
    ) VALUES (
      p_loja_id, v_produto_id, 'ENTRADA_NFE', v_q_entrada, NULL, v_uid, v_obs
    );

    v_n := v_n + 1;
  END LOOP;

  IF p_duplicatas IS NOT NULL
     AND jsonb_typeof(p_duplicatas) = 'array'
     AND jsonb_array_length(p_duplicatas) > 0
  THEN
    FOR dup IN SELECT value FROM jsonb_array_elements(p_duplicatas) AS t(value)
    LOOP
      BEGIN
        INSERT INTO public.contas_pagar (
          importacao_nfe_id, fornecedor_id, loja_id,
          numero_duplicata, data_vencimento, valor, status
        ) VALUES (
          v_imp_id,
          v_forn_id,
          p_loja_id,
          NULLIF(trim(COALESCE(dup->>'numero', '')), ''),
          (dup->>'data_vencimento')::date,
          (dup->>'valor')::numeric,
          'pendente'
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'importacao_id', v_imp_id,
    'itens_processados', v_n,
    'produtos_novos', v_novos,
    'produtos_vinculados', v_vinculados
  );
END;
$$;

COMMENT ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean, jsonb) IS
  'Importação NF-e: produtos novos nascem DRAFT (ativo=false) até publicação manual no catálogo.';
