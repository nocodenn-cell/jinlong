-- P0: compare sob FOR UPDATE antes de alterar saldo/minimo.
BEGIN;
CREATE OR REPLACE FUNCTION public.ajustar_estoque_manual_seguro(
  p_produto_id uuid,
  p_loja_id uuid,
  p_quantidade_atual numeric,
  p_estoque_minimo numeric,
  p_motivo_codigo text,
  p_observacao text,
  p_ator_id uuid,
  p_quantidade_esperada numeric,
  p_minimo_esperado numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_ator_id);
  v_perfil text;
  v_loja_usuario uuid;
  v_ativo boolean;
  v_atual numeric;
  v_minimo numeric;
  v_alterar_saldo boolean;
  v_delta numeric;
  v_tipo_codigo text;
  v_observacao text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id, u.ativo
    INTO v_perfil, v_loja_usuario, v_ativo
  FROM public.usuarios u
  WHERE u.id = v_uid;

  -- SSOT-01: autorização deriva do papel no servidor, nunca de string enviada pelo
  -- cliente. A exceção anterior liberava OPERADOR quando `p_observacao` casava um
  -- literal mágico — e ambos os parâmetros são escolhidos por quem chama.
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL';
  END IF;

  -- Padrão A (Fase 6, 2026-08-29): só GERENTE é restrito à própria loja.
  -- DONO e ADMIN ajustam estoque de qualquer loja, igual a transferências e
  -- remessas (Fase 3). Antes desta migration, o guard bloqueava os três
  -- perfis igualmente — mais restritivo que qualquer outra RPC de estoque.
  --
  -- `OR NOT v_ativo`: achado de revisão — sem isto, um DONO/ADMIN
  -- desativado (usuarios.ativo=false) mas com token ainda válido passaria
  -- a ter alcance global em vez de continuar restrito à própria loja como
  -- ficava antes desta migration. Uma conta desativada nunca deve GANHAR
  -- alcance maior do que tinha.
  IF (v_perfil = 'GERENTE' OR NOT COALESCE(v_ativo, false))
     AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_LOJA_INVALIDA';
  END IF;

  IF p_quantidade_atual IS NULL OR p_quantidade_atual < 0 THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_QTD_INVALIDA';
  END IF;

  IF p_estoque_minimo IS NULL OR p_estoque_minimo < 0 THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_MIN_INVALIDO';
  END IF;

  IF p_motivo_codigo NOT IN ('COMPRA', 'PERDA', 'QUEBRA', 'ACERTO_INVENTARIO', 'OUTRO') THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_MOTIVO_INVALIDO';
  END IF;

  IF p_motivo_codigo = 'OUTRO' AND COALESCE(BTRIM(p_observacao), '') = '' THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_OBSERVACAO_OBRIGATORIA';
  END IF;

  SELECT e.quantidade_atual, e.estoque_minimo
    INTO v_atual, v_minimo
  FROM public.estoque e
  WHERE e.loja_id = p_loja_id
    AND e.produto_id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA';
  END IF;

  IF p_quantidade_esperada IS NULL OR p_minimo_esperado IS NULL
     OR p_quantidade_esperada < 0 OR p_minimo_esperado < 0 THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_SNAPSHOT_OBRIGATORIO';
  END IF;

  v_alterar_saldo := p_quantidade_atual IS DISTINCT FROM p_quantidade_esperada;
  IF v_minimo IS DISTINCT FROM p_minimo_esperado
     OR (v_alterar_saldo AND v_atual IS DISTINCT FROM p_quantidade_esperada) THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_SALDO_ALTERADO';
  END IF;

  -- Alterar apenas o mínimo nunca repõe um saldo antigo enviado pelo formulário.
  v_delta := CASE WHEN v_alterar_saldo THEN p_quantidade_atual - v_atual ELSE 0 END;

  UPDATE public.estoque e
  SET
    quantidade_atual = CASE WHEN v_alterar_saldo THEN p_quantidade_atual ELSE e.quantidade_atual END,
    estoque_minimo = p_estoque_minimo,
    version = e.version + 1,
    updated_at = NOW()
  WHERE e.loja_id = p_loja_id
    AND e.produto_id = p_produto_id;

  IF v_delta <> 0 THEN
    IF v_delta > 0 THEN
      v_tipo_codigo := 'ENTRADA_AJUSTE';
    ELSIF p_motivo_codigo IN ('PERDA', 'QUEBRA') THEN
      v_tipo_codigo := 'SAIDA_AVARIA';
    ELSE
      v_tipo_codigo := 'SAIDA_AJUSTE';
    END IF;

    v_observacao := CONCAT(
      'motivo=', p_motivo_codigo,
      CASE
        WHEN COALESCE(BTRIM(p_observacao), '') = '' THEN ''
        ELSE ' | obs=' || BTRIM(p_observacao)
      END
    );

    INSERT INTO public.movimentos_estoque_log (
      loja_id,
      produto_id,
      tipo_codigo,
      quantidade_delta,
      remessa_id,
      usuario_id,
      observacao
    ) VALUES (
      p_loja_id,
      p_produto_id,
      v_tipo_codigo,
      v_delta,
      NULL,
      v_uid,
      v_observacao
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) IS
  'Ajuste manual de estoque. GERENTE/DONO/ADMIN apenas — autorização deriva do papel no servidor, nunca de parâmetro do cliente (SSOT-01). Padrão A (2026-08-29): só GERENTE restrito à própria loja.';

REVOKE ALL ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) TO service_role;

-- Clientes antigos falham com segurança; nunca executam o ajuste absoluto sem snapshot.
CREATE OR REPLACE FUNCTION public.ajustar_estoque_manual(
  p_produto_id uuid, p_loja_id uuid, p_quantidade_atual numeric,
  p_estoque_minimo numeric, p_motivo_codigo text,
  p_observacao text DEFAULT NULL, p_ator_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'AJUSTE_ESTOQUE_SNAPSHOT_OBRIGATORIO';
END;
$$;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) TO service_role;
-- Preserve o cadastro atômico: a linha recém-criada tem snapshot 0/0.
CREATE OR REPLACE FUNCTION public.criar_produto_com_estoque_inicial(
  p_payload jsonb,
  p_ator_id uuid,
  p_request_id uuid DEFAULT NULL,
  p_faixa jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_ator_id);
  v_perfil text;
  v_loja_id uuid;
  v_produto_id uuid;
  v_nome text;
  v_codigo_barras text;
  v_preco_varejo numeric;
  v_origem text;
  v_tem_nf boolean;
  v_ativo boolean;
  v_status text;
  v_qty numeric;
  v_min numeric;
  v_existing uuid;
  v_req_loja uuid;
  v_qtd_min integer;
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
  v_preco_varejo := COALESCE((p_payload->>'preco_varejo')::numeric, 0);
  IF v_preco_varejo < 0 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PRECO';
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

  v_qty := COALESCE((p_payload->>'estoque_inicial_quantidade')::numeric, 0);
  v_min := COALESCE((p_payload->>'estoque_inicial_minimo')::numeric, 0);
  IF v_qty < 0 OR v_min < 0 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ESTOQUE_INVALIDO';
  END IF;

  IF p_faixa IS NOT NULL AND p_faixa <> 'null'::jsonb THEN
    v_qtd_min := NULLIF(p_faixa->>'quantidade_minima', '')::integer;
    v_preco_faixa := NULLIF(p_faixa->>'preco_unitario', '')::numeric;

    IF v_qtd_min IS NOT NULL AND v_preco_faixa IS NOT NULL THEN
      IF v_qtd_min <= 0 THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_FAIXA_QTD_INVALIDA';
      END IF;
      IF v_preco_faixa <= 0 THEN
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
      CASE
        WHEN p_payload ? 'preco_atacado' AND NULLIF(p_payload->>'preco_atacado', '') IS NOT NULL
        THEN (p_payload->>'preco_atacado')::numeric ELSE NULL
      END,
      CASE
        WHEN p_payload ? 'preco_custo' AND NULLIF(p_payload->>'preco_custo', '') IS NOT NULL
        THEN (p_payload->>'preco_custo')::numeric ELSE NULL
      END,
      COALESCE((p_payload->>'permitir_abaixo_custo')::boolean, false),
      CASE
        WHEN p_payload ? 'quantidade_gatilho_atacado'
          AND NULLIF(p_payload->>'quantidade_gatilho_atacado', '') IS NOT NULL
        THEN (p_payload->>'quantidade_gatilho_atacado')::integer ELSE NULL
      END,
      v_origem,
      v_tem_nf,
      COALESCE(NULLIF(BTRIM(p_payload->>'unidade_medida'), ''), 'UN'),
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

REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
