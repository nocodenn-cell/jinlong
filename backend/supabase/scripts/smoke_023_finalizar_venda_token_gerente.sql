-- Smoke test funcional da migration 023 (token gerente na finalizar_venda_transacional)
-- Executar em ambiente DEV/STAGING no SQL Editor.
-- Pré-requisitos:
-- 1) usuário autenticado no SQL Editor (auth.uid() não nulo) OU ajustar JWT context.
-- 2) produto existente com estoque suficiente.
-- 3) caixa aberto do operador autenticado.

BEGIN;

-- Parâmetros de teste (edite IDs conforme ambiente)
DO $$
DECLARE
  v_uid uuid := auth.uid();
  v_caixa_id uuid;
  v_produto_id uuid;
  v_venda_ok uuid := gen_random_uuid();
  v_venda_exp uuid := gen_random_uuid();
  v_venda_used uuid := gen_random_uuid();
  v_token_ok text := 'smoke-023-token-ok';
  v_token_exp text := 'smoke-023-token-exp';
  v_token_used text := 'smoke-023-token-used';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'SMOKE_023: auth.uid() nulo. Execute com sessão autenticada.';
  END IF;

  SELECT id INTO v_caixa_id
  FROM public.caixas
  WHERE operador_id = v_uid
    AND status = 'ABERTO'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_caixa_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_023: nenhum caixa aberto para operador %', v_uid;
  END IF;

  SELECT e.produto_id INTO v_produto_id
  FROM public.estoque e
  WHERE e.quantidade_atual >= 10
  LIMIT 1;

  IF v_produto_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_023: sem produto com estoque suficiente (>= 10).';
  END IF;

  DELETE FROM public.tokens_desconto_gerente
  WHERE token IN (v_token_ok, v_token_exp, v_token_used);

  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por)
  VALUES
    (v_token_ok, now() + interval '10 minutes', false, 'SMOKE', v_uid),
    (v_token_exp, now() - interval '1 minute', false, 'SMOKE', v_uid),
    (v_token_used, now() + interval '10 minutes', true, 'SMOKE', v_uid);

  -- 1) Cenário token válido: esperado sucesso
  PERFORM public.finalizar_venda_transacional(
    v_venda_ok,
    v_caixa_id,
    'PIX',
    10.00,
    1.00,
    9.00,
    jsonb_build_array(
      jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_produto_id,
        'quantidade', 1,
        'preco_original', 10.00,
        'preco_unitario', 10.00,
        'tipo_preco', 'VAREJO'
      )
    ),
    v_token_ok,
    10.0
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.tokens_desconto_gerente
    WHERE token = v_token_ok
      AND usado = true
  ) THEN
    RAISE EXCEPTION 'SMOKE_023: token válido não foi consumido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.descontos_venda
    WHERE venda_id = v_venda_ok
  ) THEN
    RAISE EXCEPTION 'SMOKE_023: desconto_venda não foi registrado no cenário válido.';
  END IF;

  -- 2) Cenário token expirado: esperado erro
  BEGIN
    PERFORM public.finalizar_venda_transacional(
      v_venda_exp,
      v_caixa_id,
      'PIX',
      10.00,
      1.00,
      9.00,
      jsonb_build_array(
        jsonb_build_object(
          'item_id', gen_random_uuid(),
          'produto_id', v_produto_id,
          'quantidade', 1,
          'preco_original', 10.00,
          'preco_unitario', 10.00,
          'tipo_preco', 'VAREJO'
        )
      ),
      v_token_exp,
      10.0
    );
    RAISE EXCEPTION 'SMOKE_023: cenário token expirado deveria falhar.';
  EXCEPTION WHEN OTHERS THEN
    IF POSITION('FINALIZAR_VENDA_TOKEN_GERENTE_INVALIDO' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'SMOKE_023: erro inesperado no cenário expirado: %', SQLERRM;
    END IF;
  END;

  -- 3) Cenário token já usado: esperado erro
  BEGIN
    PERFORM public.finalizar_venda_transacional(
      v_venda_used,
      v_caixa_id,
      'PIX',
      10.00,
      1.00,
      9.00,
      jsonb_build_array(
        jsonb_build_object(
          'item_id', gen_random_uuid(),
          'produto_id', v_produto_id,
          'quantidade', 1,
          'preco_original', 10.00,
          'preco_unitario', 10.00,
          'tipo_preco', 'VAREJO'
        )
      ),
      v_token_used,
      10.0
    );
    RAISE EXCEPTION 'SMOKE_023: cenário token já usado deveria falhar.';
  EXCEPTION WHEN OTHERS THEN
    IF POSITION('FINALIZAR_VENDA_TOKEN_GERENTE_INVALIDO' IN SQLERRM) = 0
       AND POSITION('FINALIZAR_VENDA_TOKEN_GERENTE_JA_USADO' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'SMOKE_023: erro inesperado no cenário usado: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'SMOKE_023_OK: cenários válido/expirado/usado executados com sucesso.';
END $$;

ROLLBACK;
