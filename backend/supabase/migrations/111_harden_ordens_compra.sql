-- ============================================================
-- Migration 111: hardening de Ordens de Compra
-- ============================================================

ALTER TABLE public.ordens_compra_itens
  DROP CONSTRAINT IF EXISTS oci_qtd_recebida_lte_quantidade;

ALTER TABLE public.ordens_compra_itens
  ADD CONSTRAINT oci_qtd_recebida_lte_quantidade
  CHECK (quantidade_recebida <= quantidade) NOT VALID;

DROP POLICY IF EXISTS oc_auth ON public.ordens_compra;
DROP POLICY IF EXISTS oci_auth ON public.ordens_compra_itens;
DROP POLICY IF EXISTS oc_gerencial_loja ON public.ordens_compra;
DROP POLICY IF EXISTS oci_gerencial_loja ON public.ordens_compra_itens;

CREATE POLICY oc_gerencial_loja ON public.ordens_compra
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE','DONO','ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = ordens_compra.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE','DONO','ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = ordens_compra.loja_id)
    )
  );

CREATE POLICY oci_gerencial_loja ON public.ordens_compra_itens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ordens_compra oc
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND u.perfil IN ('GERENTE','DONO','ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = oc.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ordens_compra oc
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND u.perfil IN ('GERENTE','DONO','ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = oc.loja_id)
    )
  );

CREATE OR REPLACE FUNCTION public.oc_guard_status_recebida()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'RECEBIDA'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'RECEBIDA')
     AND COALESCE(current_setting('app.oc_recebimento_autorizado', true), '') <> 'on' THEN
    RAISE EXCEPTION 'OC_RECEBIDA_REQUER_RPC';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_guard_status_recebida ON public.ordens_compra;
CREATE TRIGGER trg_oc_guard_status_recebida
  BEFORE INSERT OR UPDATE ON public.ordens_compra
  FOR EACH ROW EXECUTE FUNCTION public.oc_guard_status_recebida();

CREATE OR REPLACE FUNCTION public.criar_ordem_compra_segura(
  p_loja_id uuid,
  p_fornecedor_id uuid,
  p_fornecedor_nome text,
  p_data_emissao date,
  p_data_prevista_chegada date,
  p_observacao text,
  p_itens jsonb
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
  el jsonb;
  v_produto_id uuid;
  v_descricao text;
  v_quantidade numeric;
  v_preco_unitario numeric;
  v_unidade_medida text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  IF v_perfil <> 'DONO' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
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
    p_loja_id, p_fornecedor_id, NULLIF(trim(COALESCE(p_fornecedor_nome, '')), ''),
    COALESCE(p_data_emissao, CURRENT_DATE), p_data_prevista_chegada,
    NULLIF(trim(COALESCE(p_observacao, '')), ''), 'RASCUNHO', v_uid
  )
  RETURNING id INTO v_oc_id;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_produto_id := NULLIF(el->>'produto_id', '')::uuid;
    v_descricao := NULLIF(trim(COALESCE(el->>'descricao', '')), '');
    v_quantidade := NULLIF(el->>'quantidade', '')::numeric;
    v_preco_unitario := COALESCE(NULLIF(el->>'preco_unitario', '')::numeric, 0);
    v_unidade_medida := COALESCE(NULLIF(trim(el->>'unidade_medida'), ''), 'UN');

    IF v_quantidade IS NULL OR v_quantidade <= 0 OR v_preco_unitario < 0 THEN
      RAISE EXCEPTION 'OC_ITEM_VALOR_INVALIDO';
    END IF;

    IF v_produto_id IS NULL AND v_descricao IS NULL THEN
      RAISE EXCEPTION 'OC_ITEM_IDENTIFICACAO_INVALIDA';
    END IF;

    INSERT INTO public.ordens_compra_itens (
      ordem_id, produto_id, descricao, quantidade, preco_unitario, unidade_medida
    )
    VALUES (
      v_oc_id, v_produto_id, v_descricao, v_quantidade, v_preco_unitario, v_unidade_medida
    );
  END LOOP;

  RETURN v_oc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_ordem_compra_segura(
  p_oc_id uuid,
  p_loja_id uuid,
  p_fornecedor_id uuid,
  p_fornecedor_nome text,
  p_data_emissao date,
  p_data_prevista_chegada date,
  p_observacao text,
  p_itens jsonb
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
  el jsonb;
  v_produto_id uuid;
  v_descricao text;
  v_quantidade numeric;
  v_preco_unitario numeric;
  v_unidade_medida text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_oc
  FROM public.ordens_compra
  WHERE id = p_oc_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_oc.loja_id IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_perfil <> 'DONO' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status NOT IN ('RASCUNHO','CONFIRMADA') THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'OC_ITENS_INVALIDOS';
  END IF;

  UPDATE public.ordens_compra
  SET fornecedor_id = p_fornecedor_id,
      fornecedor_nome = NULLIF(trim(COALESCE(p_fornecedor_nome, '')), ''),
      data_emissao = COALESCE(p_data_emissao, CURRENT_DATE),
      data_prevista_chegada = p_data_prevista_chegada,
      observacao = NULLIF(trim(COALESCE(p_observacao, '')), '')
  WHERE id = p_oc_id;

  DELETE FROM public.ordens_compra_itens
  WHERE ordem_id = p_oc_id;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_produto_id := NULLIF(el->>'produto_id', '')::uuid;
    v_descricao := NULLIF(trim(COALESCE(el->>'descricao', '')), '');
    v_quantidade := NULLIF(el->>'quantidade', '')::numeric;
    v_preco_unitario := COALESCE(NULLIF(el->>'preco_unitario', '')::numeric, 0);
    v_unidade_medida := COALESCE(NULLIF(trim(el->>'unidade_medida'), ''), 'UN');

    IF v_quantidade IS NULL OR v_quantidade <= 0 OR v_preco_unitario < 0 THEN
      RAISE EXCEPTION 'OC_ITEM_VALOR_INVALIDO';
    END IF;

    IF v_produto_id IS NULL AND v_descricao IS NULL THEN
      RAISE EXCEPTION 'OC_ITEM_IDENTIFICACAO_INVALIDA';
    END IF;

    INSERT INTO public.ordens_compra_itens (
      ordem_id, produto_id, descricao, quantidade, preco_unitario, unidade_medida
    )
    VALUES (
      p_oc_id, v_produto_id, v_descricao, v_quantidade, v_preco_unitario, v_unidade_medida
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.receber_ordem_compra(
  p_oc_id uuid,
  p_itens jsonb
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
  el jsonb;
  v_item_id uuid;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_qtd_rec numeric;
  v_qtd_pedida numeric;
  v_produto_id uuid;
  v_total_itens integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_oc
  FROM public.ordens_compra
  WHERE id = p_oc_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_perfil <> 'DONO' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status <> 'EM_TRANSITO' THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  SELECT count(*) INTO v_total_itens
  FROM public.ordens_compra_itens
  WHERE ordem_id = p_oc_id;

  IF p_itens IS NULL
     OR jsonb_typeof(p_itens) <> 'array'
     OR jsonb_array_length(p_itens) = 0
     OR jsonb_array_length(p_itens) <> v_total_itens THEN
    RAISE EXCEPTION 'OC_ITENS_INVALIDOS';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_item_id := (el->>'item_id')::uuid;
    v_qtd_rec := COALESCE(NULLIF(el->>'quantidade_recebida', '')::numeric, 0);

    IF v_item_id IS NULL OR v_item_id = ANY(v_item_ids) THEN
      RAISE EXCEPTION 'OC_ITEM_INVALIDO';
    END IF;

    IF v_qtd_rec < 0 THEN
      RAISE EXCEPTION 'OC_QTD_INVALIDA';
    END IF;

    SELECT produto_id, quantidade INTO v_produto_id, v_qtd_pedida
    FROM public.ordens_compra_itens
    WHERE id = v_item_id
      AND ordem_id = p_oc_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OC_ITEM_INVALIDO';
    END IF;

    IF v_qtd_rec > v_qtd_pedida THEN
      RAISE EXCEPTION 'OC_QTD_MAIOR_QUE_PEDIDA';
    END IF;

    UPDATE public.ordens_compra_itens
    SET quantidade_recebida = v_qtd_rec
    WHERE id = v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    IF v_produto_id IS NOT NULL AND v_qtd_rec > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_produto_id, v_oc.loja_id, v_qtd_rec, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version = public.estoque.version + 1,
            updated_at = now();

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

  PERFORM set_config('app.oc_recebimento_autorizado', 'on', true);

  UPDATE public.ordens_compra
  SET status = 'RECEBIDA'
  WHERE id = p_oc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_ordem_compra_segura(uuid, uuid, text, date, date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atualizar_ordem_compra_segura(uuid, uuid, uuid, text, date, date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.criar_ordem_compra_segura(uuid, uuid, text, date, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_ordem_compra_segura(uuid, uuid, uuid, text, date, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid, jsonb) TO service_role;
