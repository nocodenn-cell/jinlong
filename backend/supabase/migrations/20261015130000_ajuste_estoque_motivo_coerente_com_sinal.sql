-- Ajuste manual: motivo precisa ser coerente com o sinal do delta.
-- Antes, PERDA/QUEBRA com saldo subindo gravava ENTRADA_AJUSTE "motivo=PERDA"
-- (caso real em produção, 2026-09-30: "perda que aumenta saldo", +2) e COMPRA
-- com saldo caindo virava SAIDA_AJUSTE "motivo=COMPRA" — kardex mentindo
-- sobre a causa da movimentação.
--
-- Regra (espelhada em shared-core motivoCompativelComDelta):
--   delta > 0  → PERDA/QUEBRA proibidos
--   delta < 0  → COMPRA proibido
--   delta = 0  → (só mínimo) qualquer motivo
-- ACERTO_INVENTARIO e OUTRO valem nos dois sentidos.
--
-- Corpo idêntico ao da 20261005224553 (conferido contra pg_get_functiondef em
-- produção em 2026-10-15) + o guard abaixo, antes do UPDATE.
-- Chamador interno criar_produto_com_estoque_inicial usa ACERTO_INVENTARIO: ok.

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

  IF (v_delta > 0 AND p_motivo_codigo IN ('PERDA', 'QUEBRA'))
     OR (v_delta < 0 AND p_motivo_codigo = 'COMPRA') THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_MOTIVO_SINAL_INVALIDO'
      USING DETAIL = format('motivo=%s delta=%s', p_motivo_codigo, v_delta);
  END IF;

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
  'Ajuste manual de estoque. GERENTE/DONO/ADMIN apenas — autorização deriva do papel no servidor, nunca de parâmetro do cliente (SSOT-01). Padrão A (2026-08-29): só GERENTE restrito à própria loja. Motivo coerente com o sinal (20261015130000): PERDA/QUEBRA só reduzem, COMPRA só aumenta.';

REVOKE ALL ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric) TO service_role;

DO $verify_ajuste_motivo_sinal_20261015$
DECLARE
  v_def text := pg_get_functiondef(
    'public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric)'::regprocedure
  );
BEGIN
  IF position('AJUSTE_ESTOQUE_MOTIVO_SINAL_INVALIDO' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20261015_AJUSTE_SEM_GUARD_SINAL';
  END IF;
  IF position('FOR UPDATE' IN v_def) = 0 OR position('AJUSTE_ESTOQUE_SALDO_ALTERADO' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20261015_AJUSTE_PERDEU_CONCORRENCIA';
  END IF;
  IF has_function_privilege('authenticated',
       'public.ajustar_estoque_manual_seguro(uuid, uuid, numeric, numeric, text, text, uuid, numeric, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG20261015_AJUSTE_GRANT_AUTHENTICATED';
  END IF;
END
$verify_ajuste_motivo_sinal_20261015$;

COMMIT;
