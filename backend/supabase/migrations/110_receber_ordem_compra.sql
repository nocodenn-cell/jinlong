-- ============================================================
-- Migration 110: RPC receber_ordem_compra
--
-- Registra o recebimento físico de uma OC em trânsito:
--   1. Atualiza quantidade_recebida em cada item
--   2. Incrementa estoque dos produtos vinculados
--   3. Registra movimentos_estoque_log com tipo ENTRADA_OC
--   4. Muda status da OC para RECEBIDA
-- Tudo numa única transação.
-- ============================================================

INSERT INTO public.tipos_movimento_estoque (
  codigo,
  rotulo,
  exige_gerente,
  permite_entrada,
  permite_saida
)
VALUES (
  'ENTRADA_OC',
  'Entrada por recebimento de ordem de compra',
  true,
  true,
  false
)
ON CONFLICT (codigo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.receber_ordem_compra(
  p_oc_id  uuid,
  p_itens  jsonb   -- [{"item_id": uuid, "quantidade_recebida": numeric}, ...]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid    := auth.uid();
  v_perfil      text;
  v_loja_usuario uuid;
  v_oc          record;
  el            jsonb;
  v_item_id     uuid;
  v_qtd_rec     numeric;
  v_produto_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_oc
    FROM public.ordens_compra
   WHERE id = p_oc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status <> 'EM_TRANSITO' THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'OC_ITENS_INVALIDOS';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_item_id := (el->>'item_id')::uuid;
    v_qtd_rec := COALESCE((el->>'quantidade_recebida')::numeric, 0);

    IF v_qtd_rec < 0 THEN
      RAISE EXCEPTION 'OC_QTD_INVALIDA';
    END IF;

    UPDATE public.ordens_compra_itens
       SET quantidade_recebida = v_qtd_rec
     WHERE id = v_item_id
       AND ordem_id = p_oc_id
    RETURNING produto_id INTO v_produto_id;

    IF FOUND AND v_produto_id IS NOT NULL AND v_qtd_rec > 0 THEN
      -- Incrementar estoque
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_produto_id, v_oc.loja_id, v_qtd_rec, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      -- Registrar movimento
      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_oc.loja_id,
        v_produto_id,
        'ENTRADA_OC',
        v_qtd_rec,
        v_uid,
        format('Recebimento OC %s', p_oc_id::text)
      );
    END IF;
  END LOOP;

  UPDATE public.ordens_compra
     SET status = 'RECEBIDA'
   WHERE id = p_oc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid, jsonb) TO service_role;
