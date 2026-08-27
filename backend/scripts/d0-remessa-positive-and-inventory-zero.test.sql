\set ON_ERROR_STOP on
BEGIN;

SELECT p.id AS produto, p.loja_id AS loja, u.id AS gerente
FROM public.produtos p
JOIN public.usuarios u ON u.loja_id = p.loja_id
WHERE p.ativo AND u.ativo AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
ORDER BY p.id, u.id
LIMIT 1 \gset

SELECT set_config('request.jwt.claim.sub', :'gerente', true),
       set_config('d0.produto', :'produto', true),
       set_config('d0.loja', :'loja', true);

DO $test$
DECLARE
  v_rem_antes bigint;
  v_itens_antes bigint;
  v_mov_antes bigint;
  v_id1 uuid;
  v_id2 uuid;
  v_saldo_antes numeric;
BEGIN
  SELECT count(*) INTO v_rem_antes FROM public.remessas;
  SELECT count(*) INTO v_itens_antes FROM public.remessa_itens;
  SELECT count(*) INTO v_mov_antes FROM public.movimentos_estoque_log;

  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      'D0 zero', NULL,
      jsonb_build_array(jsonb_build_object('produto_id', current_setting('d0.produto'), 'quantidade_esperada', 0, 'quantidade_conferida', 0)),
      'd0-remessa-zero');
    RAISE EXCEPTION 'D0_REMESSA_ZERO_ACEITO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%REMESSA_QTD_POSITIVA%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      'D0 negativo', NULL,
      jsonb_build_array(jsonb_build_object('produto_id', current_setting('d0.produto'), 'quantidade_esperada', -1, 'quantidade_conferida', -1)),
      'd0-remessa-negativo');
    RAISE EXCEPTION 'D0_REMESSA_NEGATIVO_ACEITO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%REMESSA_QTD_POSITIVA%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada('D0 vazio', NULL, '[]'::jsonb, 'd0-remessa-vazio');
    RAISE EXCEPTION 'D0_REMESSA_VAZIA_ACEITA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%REMESSA_ITENS_VAZIOS%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      'D0 inválido', NULL,
      '[{"produto_id":"","quantidade_esperada":1,"quantidade_conferida":1}]'::jsonb,
      'd0-remessa-invalido');
    RAISE EXCEPTION 'D0_REMESSA_ITEM_INVALIDO_ACEITO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%REMESSA_ITEM_INVALIDO%' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.remessas) <> v_rem_antes
     OR (SELECT count(*) FROM public.remessa_itens) <> v_itens_antes
     OR (SELECT count(*) FROM public.movimentos_estoque_log) <> v_mov_antes THEN
    RAISE EXCEPTION 'D0_REMESSA_REJEICAO_NAO_ATOMICA';
  END IF;

  v_id1 := public.criar_confirmar_remessa_entrada(
    'D0 positiva', 'teste idempotente',
    jsonb_build_array(jsonb_build_object('produto_id', current_setting('d0.produto'), 'quantidade_esperada', 2, 'quantidade_conferida', 2)),
    'd0-remessa-positiva');
  v_id2 := public.criar_confirmar_remessa_entrada(
    'D0 positiva', 'teste idempotente',
    jsonb_build_array(jsonb_build_object('produto_id', current_setting('d0.produto'), 'quantidade_esperada', 2, 'quantidade_conferida', 2)),
    'd0-remessa-positiva');

  IF v_id1 IS DISTINCT FROM v_id2 THEN RAISE EXCEPTION 'D0_REMESSA_REPLAY_ID_DIVERGIU'; END IF;
  IF (SELECT count(*) FROM public.remessas WHERE id = v_id1) <> 1
     OR (SELECT count(*) FROM public.remessa_itens WHERE remessa_id = v_id1) <> 1
     OR (SELECT count(*) FROM public.movimentos_estoque_log WHERE remessa_id = v_id1) <> 1 THEN
    RAISE EXCEPTION 'D0_REMESSA_REPLAY_DUPLICOU';
  END IF;

  -- Auditoria: a RPC atômica funde criação+conferência+confirmação numa
  -- chamada só e precisa gravar quem/quando conferiu, igual ao fluxo antigo.
  IF NOT EXISTS (
    SELECT 1 FROM public.remessas
    WHERE id = v_id1
      AND conferido_por = current_setting('request.jwt.claim.sub')::uuid
      AND conferido_em IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'D0_REMESSA_SEM_AUDITORIA_CONFERENCIA';
  END IF;

  -- NaN/Infinity: numeric aceita o cast e os trata como > 0 (maior que
  -- qualquer valor finito), então um checque ingênuo de `<= 0` os deixa
  -- passar. Isso corromperia remessa_itens/estoque/movimentos_estoque_log.
  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      'D0 nan', NULL,
      jsonb_build_array(jsonb_build_object('produto_id', current_setting('d0.produto'), 'quantidade_esperada', 'NaN', 'quantidade_conferida', 1)),
      'd0-remessa-nan');
    RAISE EXCEPTION 'D0_REMESSA_NAN_ACEITO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%REMESSA_QTD_POSITIVA%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      'D0 infinity', NULL,
      jsonb_build_array(jsonb_build_object('produto_id', current_setting('d0.produto'), 'quantidade_esperada', 1, 'quantidade_conferida', 'Infinity')),
      'd0-remessa-infinity');
    RAISE EXCEPTION 'D0_REMESSA_INFINITY_ACEITO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%REMESSA_QTD_POSITIVA%' THEN RAISE; END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.remessas WHERE idempotency_key IN ('d0-remessa-nan', 'd0-remessa-infinity')) THEN
    RAISE EXCEPTION 'D0_REMESSA_NAO_FINITO_PERSISTIU';
  END IF;

  -- Produto DRAFT precisa ser receptível: produto novo nasce DRAFT
  -- (defaultStatusNovoProduto) e a busca do fluxo (buscarProdutosRecebimento)
  -- já o retorna de propósito — exigir publicação antes de receber obrigaria
  -- publicar no PDV um item que ainda não chegou fisicamente
  -- (AUDITORIA_CATALOGO_PRODUTO.md §5.5). Regressão: a RPC checava `p.ativo`
  -- (só true quando status_publicacao='PUBLICADO'), bloqueando todo DRAFT.
  DECLARE
    v_produto_draft uuid;
    v_produto_inativo uuid;
  BEGIN
    INSERT INTO public.produtos (loja_id, nome, preco_varejo, origem, ativo, status_publicacao)
    VALUES (current_setting('d0.loja')::uuid, 'D0 draft recebimento', 10.00, 'china_manual', false, 'DRAFT')
    RETURNING id INTO v_produto_draft;

    INSERT INTO public.produtos (loja_id, nome, preco_varejo, origem, ativo, status_publicacao)
    VALUES (current_setting('d0.loja')::uuid, 'D0 inativo recebimento', 10.00, 'china_manual', false, 'INATIVO')
    RETURNING id INTO v_produto_inativo;

    PERFORM public.criar_confirmar_remessa_entrada(
      'D0 draft', NULL,
      jsonb_build_array(jsonb_build_object('produto_id', v_produto_draft, 'quantidade_esperada', 3, 'quantidade_conferida', 3)),
      'd0-remessa-draft');

    IF NOT EXISTS (SELECT 1 FROM public.remessas WHERE idempotency_key = 'd0-remessa-draft') THEN
      RAISE EXCEPTION 'D0_REMESSA_DRAFT_REJEITADA';
    END IF;

    BEGIN
      PERFORM public.criar_confirmar_remessa_entrada(
        'D0 inativo', NULL,
        jsonb_build_array(jsonb_build_object('produto_id', v_produto_inativo, 'quantidade_esperada', 3, 'quantidade_conferida', 3)),
        'd0-remessa-inativo');
      RAISE EXCEPTION 'D0_REMESSA_INATIVO_ACEITO';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%REMESSA_ITEM_INVALIDO%' THEN RAISE; END IF;
    END;
  END;

  -- Inventário/contagem física zero continua legítimo no fluxo próprio.
  SELECT quantidade_atual INTO v_saldo_antes
  FROM public.estoque
  WHERE produto_id = current_setting('d0.produto')::uuid
    AND loja_id = current_setting('d0.loja')::uuid;
  PERFORM public.ajustar_estoque_manual(
    current_setting('d0.produto')::uuid,
    current_setting('d0.loja')::uuid,
    0::numeric, 0::numeric, 'ACERTO_INVENTARIO'::text,
    'nenhum item encontrado'::text,
    current_setting('request.jwt.claim.sub')::uuid);

  IF (SELECT quantidade_atual FROM public.estoque
      WHERE produto_id = current_setting('d0.produto')::uuid
        AND loja_id = current_setting('d0.loja')::uuid) <> 0
     OR NOT EXISTS (
       SELECT 1 FROM public.movimentos_estoque_log
       WHERE produto_id = current_setting('d0.produto')::uuid
         AND loja_id = current_setting('d0.loja')::uuid
         AND tipo_codigo = 'SAIDA_AJUSTE'
         AND quantidade_delta = -v_saldo_antes
     ) THEN
    RAISE EXCEPTION 'D0_CONTAGEM_ZERO_NAO_PRESERVADA';
  END IF;
END $test$;

SELECT 'D0 REMESSA POSITIVA E CONTAGEM ZERO: OK' AS resultado;
ROLLBACK;
