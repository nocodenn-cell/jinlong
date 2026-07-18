-- Exceção estreita: OPERADOR pode aplicar estoque inicial somente via
-- criar_produto_com_estoque_inicial (observacao canônica + ACERTO_INVENTARIO).
-- Corpo alinhado à migração 269; muda apenas o gate de perfil.

CREATE OR REPLACE FUNCTION public.ajustar_estoque_manual(
  p_produto_id uuid,
  p_loja_id uuid,
  p_quantidade_atual numeric,
  p_estoque_minimo numeric,
  p_motivo_codigo text,
  p_observacao text DEFAULT NULL,
  p_ator_id uuid DEFAULT NULL
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
  v_atual numeric;
  v_delta numeric;
  v_tipo_codigo text;
  v_observacao text;
  v_estoque_inicial boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  v_estoque_inicial :=
    p_motivo_codigo = 'ACERTO_INVENTARIO'
    AND COALESCE(BTRIM(p_observacao), '') = 'Estoque inicial no cadastro de produto';

  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN')
     AND NOT (v_perfil = 'OPERADOR' AND v_estoque_inicial) THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL';
  END IF;

  IF v_loja_usuario IS DISTINCT FROM p_loja_id THEN
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

  SELECT e.quantidade_atual
    INTO v_atual
  FROM public.estoque e
  WHERE e.loja_id = p_loja_id
    AND e.produto_id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA';
  END IF;

  v_delta := p_quantidade_atual - v_atual;

  UPDATE public.estoque e
  SET
    quantidade_atual = p_quantidade_atual,
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

COMMENT ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) IS
  'Ajuste manual GERENTE+. OPERADOR só estoque inicial no cadastro (PDV relâmpago).';

REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) TO service_role;
