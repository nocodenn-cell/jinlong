-- VAL-01A/B — `criar_produto_com_estoque_inicial` passa a rejeitar valores que o
-- banco hoje arredonda em silêncio ou que estouram o tipo.
--
-- Defeito (homologação, 2026-10-31): a RPC aceita qualquer `numeric` e grava em
-- `numeric(10,2)` / `numeric(10,3)` / `integer` por cast implícito. Assim:
--   * preço 2.005 vira 2.01 (arredondamento silencioso);
--   * estoque 0.0005 vira 0.001;
--   * quantidade_minima 2.7 vira 3 (`::integer` arredonda);
--   * valores acima do teto estouram com erro cru de banco.
--
-- Contrato novo (ver docs/audits/VAL-01_AUDITORIA_CAMPOS_2026-10-31.md):
--   * preço de venda e atacado: até 2 casas e teto numeric(10,2);
--   * custo: até 2 casas (coluna atual `numeric(10,2)`); subir exige migration própria (IM-F01);
--   * estoque inicial e mínimo: até 3 casas e teto numeric(10,3);
--     fração só para unidade KG ou M; UN, CX e FD aceitam só inteiro;
--   * gatilho e faixa de atacado: inteiro dentro de `integer`.
--
-- Compatibilidade: assinatura, SECURITY DEFINER, search_path, owner e GRANTs são
-- preservados (CREATE OR REPLACE). Só ganham RAISE antes do INSERT. Regras de
-- perfil (GERENTE/DONO/ADMIN), loja do usuário, idempotência por request_id e
-- isolamento multiempresa ficam exatamente como estavam.
-- Corpo base: definição vigente em homologação (yvdilcmxyjafnnsfdtam).

CREATE OR REPLACE FUNCTION public.criar_produto_com_estoque_inicial(
  p_payload jsonb,
  p_ator_id uuid,
  p_request_id uuid DEFAULT NULL::uuid,
  p_faixa jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_ator_id);
  v_perfil text;
  v_loja_id uuid;
  v_produto_id uuid;
  v_nome text;
  v_codigo_barras text;
  v_preco_varejo numeric;
  v_preco_atacado numeric;
  v_preco_custo numeric;
  v_gatilho numeric;
  v_origem text;
  v_tem_nf boolean;
  v_ativo boolean;
  v_status text;
  v_unidade text;
  v_qty numeric;
  v_min numeric;
  v_existing uuid;
  v_req_loja uuid;
  v_qtd_min integer;
  v_qtd_min_num numeric;
  v_preco_faixa numeric;
  v_faixa_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_perfil, v_loja_id
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PERFIL';
  END IF;

  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_LOJA';
  END IF;

  IF p_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

    SELECT r.produto_id, r.loja_id INTO v_existing, v_req_loja
    FROM public.produto_create_requests r
    WHERE r.request_id = p_request_id;

    IF v_existing IS NOT NULL THEN
      IF v_perfil <> 'ADMIN' AND v_req_loja IS DISTINCT FROM v_loja_id THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_REQUEST_OUTRA_LOJA';
      END IF;

      RETURN jsonb_build_object(
        'produto_id', v_existing,
        'replayed', true,
        'loja_id', v_loja_id
      );
    END IF;
  END IF;

  v_nome := NULLIF(BTRIM(COALESCE(p_payload->>'nome', '')), '');
  IF v_nome IS NULL OR char_length(v_nome) < 2 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_NOME';
  END IF;

  v_codigo_barras := NULLIF(BTRIM(COALESCE(p_payload->>'codigo_barras', '')), '');

  -- Preços: até 2 casas e teto de numeric(10,2). Sem arredondamento silencioso.
  v_preco_varejo := COALESCE((p_payload->>'preco_varejo')::numeric, 0);
  IF v_preco_varejo < 0 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PRECO';
  END IF;
  IF v_preco_varejo > 99999999.99 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PRECO_LIMITE';
  END IF;
  IF v_preco_varejo <> round(v_preco_varejo, 2) THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PRECO_CASAS';
  END IF;

  v_preco_atacado := NULLIF(p_payload->>'preco_atacado', '')::numeric;
  IF v_preco_atacado IS NOT NULL THEN
    IF v_preco_atacado > 99999999.99 THEN
      RAISE EXCEPTION 'CRIAR_PRODUTO_ATACADO_LIMITE';
    END IF;
    IF v_preco_atacado <> round(v_preco_atacado, 2) THEN
      RAISE EXCEPTION 'CRIAR_PRODUTO_ATACADO_CASAS';
    END IF;
  END IF;

  v_preco_custo := NULLIF(p_payload->>'preco_custo', '')::numeric;
  IF v_preco_custo IS NOT NULL THEN
    IF v_preco_custo > 99999999.99 THEN
      RAISE EXCEPTION 'CRIAR_PRODUTO_CUSTO_LIMITE';
    END IF;
    IF v_preco_custo <> round(v_preco_custo, 2) THEN
      RAISE EXCEPTION 'CRIAR_PRODUTO_CUSTO_CASAS';
    END IF;
  END IF;

  v_origem := COALESCE(p_payload->>'origem', 'china_manual');
  IF v_origem NOT IN ('china_manual', 'brasil_nf', 'brasil_sem_nf') THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ORIGEM';
  END IF;

  v_tem_nf := COALESCE((p_payload->>'tem_nf')::boolean, false);
  v_ativo := COALESCE((p_payload->>'ativo')::boolean, true);
  v_status := COALESCE(NULLIF(BTRIM(p_payload->>'status_publicacao'), ''), 'PUBLICADO');
  IF v_status NOT IN ('DRAFT', 'PUBLICADO', 'INATIVO') THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_STATUS';
  END IF;

  v_unidade := COALESCE(NULLIF(BTRIM(p_payload->>'unidade_medida'), ''), 'UN');

  -- Estoque: até 3 casas, teto de numeric(10,3). Fração só para KG e M.
  v_qty := COALESCE((p_payload->>'estoque_inicial_quantidade')::numeric, 0);
  v_min := COALESCE((p_payload->>'estoque_inicial_minimo')::numeric, 0);
  IF v_qty < 0 OR v_min < 0 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ESTOQUE_INVALIDO';
  END IF;
  IF v_qty > 9999999.999 OR v_min > 9999999.999 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ESTOQUE_LIMITE';
  END IF;
  IF v_qty <> round(v_qty, 3) OR v_min <> round(v_min, 3) THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ESTOQUE_CASAS';
  END IF;
  IF v_unidade NOT IN ('KG', 'M') AND (v_qty <> trunc(v_qty) OR v_min <> trunc(v_min)) THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ESTOQUE_FRACAO_UNIDADE';
  END IF;

  -- Gatilho de atacado: inteiro dentro de `integer`.
  v_gatilho := NULLIF(p_payload->>'quantidade_gatilho_atacado', '')::numeric;
  IF v_gatilho IS NOT NULL THEN
    IF v_gatilho <> trunc(v_gatilho) OR v_gatilho > 2147483647 THEN
      RAISE EXCEPTION 'CRIAR_PRODUTO_GATILHO_INVALIDO';
    END IF;
  END IF;

  IF p_faixa IS NOT NULL AND p_faixa <> 'null'::jsonb THEN
    v_qtd_min_num := NULLIF(p_faixa->>'quantidade_minima', '')::numeric;
    IF v_qtd_min_num IS NOT NULL AND (v_qtd_min_num <> trunc(v_qtd_min_num) OR v_qtd_min_num > 2147483647) THEN
      RAISE EXCEPTION 'CRIAR_PRODUTO_FAIXA_QTD_INVALIDA';
    END IF;
    v_qtd_min := v_qtd_min_num::integer;
    v_preco_faixa := NULLIF(p_faixa->>'preco_unitario', '')::numeric;

    IF v_qtd_min IS NOT NULL AND v_preco_faixa IS NOT NULL THEN
      IF v_qtd_min <= 0 THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_FAIXA_QTD_INVALIDA';
      END IF;
      IF v_preco_faixa <= 0 THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_FAIXA_PRECO_INVALIDO';
      END IF;
      IF v_preco_faixa > 99999999.99 OR v_preco_faixa <> round(v_preco_faixa, 2) THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_FAIXA_PRECO_INVALIDO';
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.produtos (
      nome, codigo_barras, codigo_interno, referencia_fornecedor,
      nome_reduzido_pdv, localizacao_prateleira, preco_varejo, preco_atacado,
      preco_custo, permitir_abaixo_custo, quantidade_gatilho_atacado, origem,
      tem_nf, unidade_medida, observacao, categoria_id, marca_id, fornecedor_id,
      ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem, ativo,
      status_publicacao, loja_id,
      criado_por, atualizado_por
    ) VALUES (
      v_nome,
      v_codigo_barras,
      NULLIF(BTRIM(COALESCE(p_payload->>'codigo_interno', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'referencia_fornecedor', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'nome_reduzido_pdv', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'localizacao_prateleira', '')), ''),
      v_preco_varejo,
      v_preco_atacado,
      v_preco_custo,
      COALESCE((p_payload->>'permitir_abaixo_custo')::boolean, false),
      v_gatilho::integer,
      v_origem,
      v_tem_nf,
      v_unidade,
      NULLIF(BTRIM(COALESCE(p_payload->>'observacao', '')), ''),
      NULLIF(p_payload->>'categoria_id', '')::uuid,
      NULLIF(p_payload->>'marca_id', '')::uuid,
      NULLIF(p_payload->>'fornecedor_id', '')::uuid,
      NULLIF(BTRIM(COALESCE(p_payload->>'ncm', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'cfop_produto', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'csosn', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'cest', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'cst_pis', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'cst_cofins', '')), ''),
      -- icms_origem: SEM default, SEM inferência de origem/país/canal — string
      -- vazia vira NULL como qualquer outro campo fiscal opcional acima; o
      -- CHECK chk_produto_icms_origem_valido barra qualquer valor fora de
      -- '0'..'8' (a exceção propaga como erro de banco, sem tratamento
      -- especial nesta RPC).
      NULLIF(BTRIM(COALESCE(p_payload->>'icms_origem', '')), ''),
      v_ativo,
      v_status,
      v_loja_id,
      v_uid,
      v_uid
    )
    RETURNING id INTO v_produto_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%produtos_codigo_barras_loja_unique%' THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO';
      END IF;
      RAISE;
  END;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto_id, v_loja_id, 0, 0);

  IF v_qty > 0 OR v_min > 0 THEN
    PERFORM public.ajustar_estoque_manual_seguro(
      v_produto_id, v_loja_id, v_qty, v_min,
      'ACERTO_INVENTARIO', 'Estoque inicial no cadastro de produto', v_uid, 0, 0
    );
  END IF;

  IF v_qtd_min IS NOT NULL AND v_preco_faixa IS NOT NULL THEN
    INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
    VALUES (v_produto_id, v_qtd_min, v_preco_faixa, NULL, true)
    RETURNING id INTO v_faixa_id;
  END IF;

  IF p_request_id IS NOT NULL THEN
    INSERT INTO public.produto_create_requests (request_id, produto_id, loja_id, ator_id)
    VALUES (p_request_id, v_produto_id, v_loja_id, v_uid)
    ON CONFLICT (request_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'produto_id', v_produto_id,
    'replayed', false,
    'loja_id', v_loja_id,
    'estoque_aplicado', (v_qty > 0 OR v_min > 0),
    'faixa_id', v_faixa_id,
    'faixa_sincronizada', (v_faixa_id IS NOT NULL)
  );
END;
$function$;
