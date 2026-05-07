-- Transferencia de estoque segura com idempotencia + RPC de pre-validacao.

ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS limite_transferencia_obs numeric(12,3) NOT NULL DEFAULT 50;

COMMENT ON COLUMN public.pdv_config.limite_transferencia_obs IS
  'Limite global de quantidade para exigir observacao em transferencias de estoque.';

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS limite_transferencia_sem_observacao numeric(12,3);

COMMENT ON COLUMN public.produtos.limite_transferencia_sem_observacao IS
  'Limite por produto para transferencia sem observacao; quando NULL, usa pdv_config.limite_transferencia_obs.';

CREATE TABLE IF NOT EXISTS public.transferencias_idempotencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  transferencia_id uuid NOT NULL REFERENCES public.movimentos_estoque_log(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_transferencias_idempotencia_usuario_created_at
  ON public.transferencias_idempotencia(usuario_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.obter_estoque_disponivel_transferencia(
  p_loja_id uuid,
  p_produto_id uuid
)
RETURNS TABLE (
  quantidade_disponivel numeric,
  unidade_medida text,
  limite_observacao numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TRANSFERENCIA_AUTH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.usuarios u
     WHERE u.id = v_uid
       AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(e.quantidade_atual, 0)::numeric AS quantidade_disponivel,
    COALESCE(p.unidade_medida, 'UN')::text AS unidade_medida,
    COALESCE(p.limite_transferencia_sem_observacao, pc.limite_transferencia_obs, 50)::numeric AS limite_observacao
  FROM public.produtos p
  LEFT JOIN public.estoque e
    ON e.produto_id = p.id
   AND e.loja_id = p_loja_id
  CROSS JOIN public.pdv_config pc
  WHERE p.id = p_produto_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.obter_estoque_disponivel_transferencia(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_estoque_disponivel_transferencia(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_estoque_disponivel_transferencia(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.transferir_estoque_seguro(
  p_loja_origem uuid,
  p_loja_destino uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_observacao text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_saldo_esperado numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_qtd_atual numeric;
  v_limite_obs numeric;
  v_transferencia_id uuid;
  v_dummy numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TRANSFERENCIA_AUTH';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
  END IF;

  IF p_loja_origem = p_loja_destino THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_IGUAL';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_QTD';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'TRANSFERENCIA_IDEMPOTENCIA_AUSENTE';
  END IF;

  SELECT ti.transferencia_id
    INTO v_transferencia_id
    FROM public.transferencias_idempotencia ti
   WHERE ti.usuario_id = v_uid
     AND ti.idempotency_key = btrim(p_idempotency_key)
   LIMIT 1;
  IF FOUND THEN
    RETURN v_transferencia_id;
  END IF;

  -- Lock deterministico para reduzir risco de deadlock entre concorrencias cruzadas.
  IF p_loja_origem::text < p_loja_destino::text THEN
    SELECT COALESCE(e.quantidade_atual, 0) INTO v_dummy
      FROM public.estoque e
     WHERE e.loja_id = p_loja_origem AND e.produto_id = p_produto_id
     FOR UPDATE;
    SELECT COALESCE(e.quantidade_atual, 0) INTO v_dummy
      FROM public.estoque e
     WHERE e.loja_id = p_loja_destino AND e.produto_id = p_produto_id
     FOR UPDATE;
  ELSE
    SELECT COALESCE(e.quantidade_atual, 0) INTO v_dummy
      FROM public.estoque e
     WHERE e.loja_id = p_loja_destino AND e.produto_id = p_produto_id
     FOR UPDATE;
    SELECT COALESCE(e.quantidade_atual, 0) INTO v_dummy
      FROM public.estoque e
     WHERE e.loja_id = p_loja_origem AND e.produto_id = p_produto_id
     FOR UPDATE;
  END IF;

  SELECT COALESCE(e.quantidade_atual, 0)
    INTO v_qtd_atual
    FROM public.estoque e
   WHERE e.loja_id = p_loja_origem
     AND e.produto_id = p_produto_id;

  IF p_saldo_esperado IS NOT NULL AND abs(v_qtd_atual - p_saldo_esperado) > 0.0001 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CONCORRENCIA: saldo mudou (atual=%, esperado=%).', v_qtd_atual, p_saldo_esperado;
  END IF;

  IF v_qtd_atual < p_quantidade THEN
    RAISE EXCEPTION 'TRANSFERENCIA_ESTOQUE_INSUFICIENTE: disponivel=%, solicitado=%.', v_qtd_atual, p_quantidade;
  END IF;

  SELECT COALESCE(p.limite_transferencia_sem_observacao, pc.limite_transferencia_obs, 50)
    INTO v_limite_obs
    FROM public.produtos p
    CROSS JOIN public.pdv_config pc
   WHERE p.id = p_produto_id
   LIMIT 1;

  IF p_quantidade > v_limite_obs AND (p_observacao IS NULL OR btrim(p_observacao) = '') THEN
    RAISE EXCEPTION 'TRANSFERENCIA_OBSERVACAO_OBRIGATORIA: limite=%.', v_limite_obs;
  END IF;

  UPDATE public.estoque e
     SET quantidade_atual = e.quantidade_atual - p_quantidade,
         version = e.version + 1,
         updated_at = now()
   WHERE e.loja_id = p_loja_origem
     AND e.produto_id = p_produto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFERENCIA_ESTOQUE_ORIGEM_AUSENTE';
  END IF;

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_origem,
    p_produto_id,
    'TRANSFERENCIA_SAIDA',
    -p_quantidade,
    NULL,
    v_uid,
    p_observacao
  )
  RETURNING id INTO v_transferencia_id;

  INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
  VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE
    SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
        version = public.estoque.version + 1,
        updated_at = now();

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_destino,
    p_produto_id,
    'TRANSFERENCIA_ENTRADA',
    p_quantidade,
    NULL,
    v_uid,
    p_observacao
  );

  INSERT INTO public.transferencias_idempotencia (
    usuario_id, idempotency_key, transferencia_id
  ) VALUES (
    v_uid, btrim(p_idempotency_key), v_transferencia_id
  )
  ON CONFLICT (usuario_id, idempotency_key)
  DO UPDATE SET transferencia_id = EXCLUDED.transferencia_id;

  RETURN v_transferencia_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_estoque_seguro(uuid, uuid, uuid, numeric, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transferir_estoque_seguro(uuid, uuid, uuid, numeric, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_estoque_seguro(uuid, uuid, uuid, numeric, text, text, numeric) TO service_role;
