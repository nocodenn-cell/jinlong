-- Entrada manual mantém o fornecedor real sem inventar documento fiscal.
-- XML continua exigindo CNPJ. Fornecedores sem CNPJ são identificados pelo nome na loja.
ALTER TABLE public.fornecedores ALTER COLUMN cnpj DROP NOT NULL;
CREATE UNIQUE INDEX uq_fornecedores_loja_nome_sem_cnpj
  ON public.fornecedores (loja_id, lower(btrim(nome))) WHERE cnpj IS NULL;
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
SET search_path TO 'public'
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
  IF length(v_cnpj) <> 14 AND NOT (v_cnpj = '' AND p_chave_acesso LIKE 'MANUAL%') THEN
    RAISE EXCEPTION 'IMPORT_NFE_CNPJ_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_ITENS_VAZIO';
  END IF;

  IF length(trim(COALESCE(p_chave_acesso, ''))) <> 44 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CHAVE_INVALIDA';
  END IF;

  IF v_cnpj = '' THEN
    IF NULLIF(trim(p_fornecedor_nome), '') IS NULL THEN
      RAISE EXCEPTION 'IMPORT_NFE_FORNECEDOR_NOME_OBRIGATORIO';
    END IF;
    INSERT INTO public.fornecedores (cnpj, nome, loja_id)
    VALUES (NULL, trim(p_fornecedor_nome), p_loja_id)
    ON CONFLICT (loja_id, lower(btrim(nome))) WHERE cnpj IS NULL
    DO UPDATE SET nome = EXCLUDED.nome, updated_at = now()
    RETURNING id INTO v_forn_id;
  ELSE
    INSERT INTO public.fornecedores (cnpj, nome, loja_id)
    VALUES (v_cnpj, COALESCE(NULLIF(trim(p_fornecedor_nome), ''), 'Fornecedor'), p_loja_id)
    ON CONFLICT (loja_id, cnpj) DO UPDATE SET nome = EXCLUDED.nome, updated_at = now()
    RETURNING id INTO v_forn_id;
  END IF;

  INSERT INTO public.importacoes_nfe (chave_acesso, numero_nf, fornecedor_id, loja_id, usuario_id)
  VALUES (trim(p_chave_acesso), NULLIF(trim(p_numero_nf), ''), v_forn_id, p_loja_id, v_uid)
  ON CONFLICT (chave_acesso) DO NOTHING
  RETURNING id INTO v_imp_id;

  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_DUPLICADA';
  END IF;

  -- Processar itens: cadastro/vínculo de produto continua imediato (dado de
  -- catálogo, sem exposição financeira/estoque). O que muda a partir daqui:
  -- nada mais credita estoque nem atualiza custo — só grava
  -- importacoes_nfe_itens para conferência.
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
    v_gtin_valido := CASE WHEN v_gtin IS NOT NULL AND v_gtin ~ '^\d{8,}$' THEN v_gtin ELSE NULL END;

    IF v_fator IS NULL OR v_fator <= 0 THEN RAISE EXCEPTION 'IMPORT_NFE_FATOR_INVALIDO'; END IF;
    IF v_q_com IS NULL OR v_q_com < 0 THEN RAISE EXCEPTION 'IMPORT_NFE_QTD_INVALIDA'; END IF;

    v_q_entrada := v_q_com * v_fator;
    IF v_q_entrada <= 0 THEN RAISE EXCEPTION 'IMPORT_NFE_QTD_ENTRADA_ZERO'; END IF;

    v_custo_unit := v_v_un / v_fator;
    IF v_custo_unit IS NULL OR v_custo_unit < 0 THEN RAISE EXCEPTION 'IMPORT_NFE_CUSTO_INVALIDO'; END IF;

    v_produto_id := NULL;

    IF v_destino IS NOT NULL THEN
      SELECT p.id INTO v_produto_id FROM public.produtos p
       WHERE p.id = v_destino AND p.loja_id = p_loja_id LIMIT 1;
      IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'IMPORT_NFE_DESTINO_INVALIDO';
      END IF;
    END IF;

    IF v_produto_id IS NULL THEN
      SELECT v.produto_id INTO v_produto_id FROM public.vinculos_fornecedor_produto v
       WHERE v.loja_id = p_loja_id AND v.fornecedor_id = v_forn_id AND v.ref_fornecedor = v_ref LIMIT 1;
    END IF;

    IF v_produto_id IS NULL AND v_gtin_valido IS NOT NULL THEN
      SELECT p.id INTO v_produto_id FROM public.produtos p
       WHERE p.codigo_barras = v_gtin_valido AND p.loja_id = p_loja_id LIMIT 1;
    END IF;

    IF v_produto_id IS NULL THEN
      SELECT p.id INTO v_produto_id FROM public.produtos p
       WHERE p.fornecedor_id = v_forn_id AND p.referencia_fornecedor = v_ref AND p.loja_id = p_loja_id LIMIT 1;
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
        v_nome, v_gtin_valido, v_forn_id, v_ref, v_ncm_valido,
        ROUND(v_custo_unit, 2), ROUND(GREATEST(v_custo_unit * 1.5, 0.01), 2),
        COALESCE(left(v_u_com, 16), 'UN'), 'brasil_nf', true, false, 'DRAFT', p_loja_id
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
        -- Garante linha de estoque visível no catálogo, sempre zerada — o
        -- crédito só acontece em confirmar_importacao_nfe, com a quantidade
        -- CONFERIDA.
        INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
        VALUES (v_produto_id, p_loja_id, 0, 0, 0)
        ON CONFLICT (loja_id, produto_id) DO NOTHING;
        v_novos := v_novos + 1;
      END IF;
    ELSE
      -- FLX-05: custo NÃO é atualizado aqui (antes era). Move para
      -- confirmar_importacao_nfe, junto com o crédito de estoque — nada de
      -- exposição financeira muda antes da conferência. Backfill de
      -- NCM/GTIN continua imediato: é metadado de catálogo, não afeta custo
      -- nem saldo.
      UPDATE public.produtos p
         SET ncm = COALESCE(p.ncm, v_ncm_valido),
             codigo_barras = COALESCE(p.codigo_barras, v_gtin_valido),
             updated_at = now()
       WHERE p.id = v_produto_id
         AND ((p.ncm IS NULL AND v_ncm_valido IS NOT NULL) OR (p.codigo_barras IS NULL AND v_gtin_valido IS NOT NULL));

      v_vinculados := v_vinculados + 1;
    END IF;

    IF v_produto_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.vinculos_fornecedor_produto (
      loja_id, fornecedor_id, ref_fornecedor, produto_id, gtin_origem, criado_por
    )
    VALUES (p_loja_id, v_forn_id, v_ref, v_produto_id, v_gtin_valido, v_uid)
    ON CONFLICT (loja_id, fornecedor_id, ref_fornecedor) DO UPDATE
      SET produto_id = EXCLUDED.produto_id,
          gtin_origem = COALESCE(public.vinculos_fornecedor_produto.gtin_origem, EXCLUDED.gtin_origem),
          updated_at = now();

    INSERT INTO public.importacoes_nfe_itens (
      importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo
    ) VALUES (
      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo
    );

    v_n := v_n + 1;
  END LOOP;

  -- Duplicatas: pendentes até a confirmação, não mais contas_pagar direto.
  -- Item 14 do Plano Mestre: uma duplicata malformada ABORTA a importação
  -- inteira (RAISE reverte cabeçalho/vínculos/itens já staged nesta mesma
  -- transação) em vez de ser descartada em silêncio — ver cabeçalho desta
  -- migration para o raciocínio completo.
  IF p_duplicatas IS NOT NULL
     AND jsonb_typeof(p_duplicatas) = 'array'
     AND jsonb_array_length(p_duplicatas) > 0
  THEN
    FOR dup IN SELECT value FROM jsonb_array_elements(p_duplicatas) AS t(value)
    LOOP
      BEGIN
        INSERT INTO public.importacoes_nfe_duplicatas (
          importacao_nfe_id, numero_duplicata, data_vencimento, valor
        ) VALUES (
          v_imp_id,
          NULLIF(trim(COALESCE(dup->>'numero', '')), ''),
          (dup->>'data_vencimento')::date,
          (dup->>'valor')::numeric
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'IMPORT_NFE_DUPLICATA_INVALIDA';
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

COMMENT ON FUNCTION public.importar_nfe_transacao IS
  'FLX-05 (2026-08-05) + item 14 do Plano Mestre (2026-09-04). Leitura + cadastro/vínculo de produto + registro para conferência. NÃO credita estoque nem gera contas_pagar — isso só acontece em confirmar_importacao_nfe, após registrar_conferencia_nfe. Duplicata malformada aborta a importação inteira (IMPORT_NFE_DUPLICATA_INVALIDA) em vez de ser descartada em silêncio.';

