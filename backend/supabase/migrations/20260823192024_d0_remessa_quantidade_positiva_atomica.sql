-- D0-03: criação+confirmação de entrada exige itens estritamente positivos e
-- é atômica/idempotente. O ajuste de inventário separado continua aceitando
-- saldo contado zero; zero representa que nenhum item foi encontrado.

BEGIN;

ALTER TABLE public.remessas
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_remessas_loja_idempotency_key
  ON public.remessas(loja_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.remessa_itens
  DROP CONSTRAINT IF EXISTS remessa_itens_quantidade_esperada_check;

ALTER TABLE public.remessa_itens
  ADD CONSTRAINT remessa_itens_quantidade_esperada_check
  CHECK (quantidade_esperada > 0) NOT VALID;

ALTER TABLE public.remessa_itens
  VALIDATE CONSTRAINT remessa_itens_quantidade_esperada_check;

CREATE OR REPLACE FUNCTION public.criar_confirmar_remessa_entrada(
  p_origem text,
  p_observacao text,
  p_itens jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_remessa uuid;
  v_existente uuid;
  v_item jsonb;
  v_produto uuid;
  v_esperada numeric;
  v_conferida numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REMESSA_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND OR v_loja IS NULL THEN RAISE EXCEPTION 'REMESSA_PERFIL'; END IF;

  p_origem := NULLIF(btrim(COALESCE(p_origem, '')), '');
  p_idempotency_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  IF p_origem IS NULL THEN RAISE EXCEPTION 'REMESSA_ORIGEM'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_KEY'; END IF;

  SELECT r.id INTO v_existente
  FROM public.remessas r
  WHERE r.loja_id = v_loja AND r.idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existente; END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'REMESSA_ITENS_VAZIOS';
  END IF;

  -- Toda validação ocorre antes da primeira escrita.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    BEGIN
      v_produto := NULLIF(btrim(COALESCE(v_item->>'produto_id', '')), '')::uuid;
      v_esperada := NULLIF(v_item->>'quantidade_esperada', '')::numeric;
      v_conferida := NULLIF(v_item->>'quantidade_conferida', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'REMESSA_ITEM_INVALIDO';
    END;

    IF v_produto IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = v_produto AND p.loja_id = v_loja AND p.ativo
    ) THEN
      RAISE EXCEPTION 'REMESSA_ITEM_INVALIDO';
    END IF;
    IF v_esperada IS NULL OR v_conferida IS NULL OR v_esperada <= 0 OR v_conferida <= 0 THEN
      RAISE EXCEPTION 'REMESSA_QTD_POSITIVA';
    END IF;
  END LOOP;

  INSERT INTO public.remessas(
    loja_id, origem_descricao, status, observacao, created_by, idempotency_key
  ) VALUES (
    v_loja, p_origem, 'EM_CONFERENCIA', NULLIF(btrim(COALESCE(p_observacao, '')), ''),
    v_uid, p_idempotency_key
  ) RETURNING id INTO v_remessa;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto := (v_item->>'produto_id')::uuid;
    v_esperada := (v_item->>'quantidade_esperada')::numeric;
    v_conferida := (v_item->>'quantidade_conferida')::numeric;

    INSERT INTO public.remessa_itens(
      remessa_id, produto_id, quantidade_esperada, quantidade_conferida
    ) VALUES (
      v_remessa, v_produto, v_esperada, v_conferida
    );

    INSERT INTO public.estoque(loja_id, produto_id, quantidade_atual, estoque_minimo)
    VALUES (v_loja, v_produto, v_conferida, 0)
    ON CONFLICT (loja_id, produto_id) DO UPDATE
      SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
          version = public.estoque.version + 1,
          updated_at = now();

    INSERT INTO public.movimentos_estoque_log(
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
    ) VALUES (
      v_loja, v_produto, 'ENTRADA_REMessa_LOJA', v_conferida, v_remessa, v_uid,
      NULLIF(btrim(COALESCE(p_observacao, '')), '')
    );
  END LOOP;

  UPDATE public.remessas
  SET status = 'CONCLUIDA', finalized_at = now()
  WHERE id = v_remessa;

  RETURN v_remessa;
EXCEPTION WHEN unique_violation THEN
  SELECT r.id INTO v_existente
  FROM public.remessas r
  WHERE r.loja_id = v_loja AND r.idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existente; END IF;
  RAISE;
END;
$function$;

COMMENT ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text) IS
  'D0: cria, confere e confirma entrada em uma transação; exige todos os itens >0 e replay por chave não duplica estoque.';

REVOKE ALL ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text) TO authenticated, service_role;

COMMIT;
