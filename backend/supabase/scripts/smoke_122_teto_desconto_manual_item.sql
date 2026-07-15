-- Smoke de contrato: teto de desconto manual por item (trigger 122).
-- Autoridade: public.trg_fn_itens_venda_limite_desconto (migration 122).
-- Contrato: docs/regras-negocio/MATRIZ_PRECO_FINAL.md §3/§4.
--
-- Fixa objetivamente o comportamento canônico do teto por item:
--   1) MANUAL com desconto > 15%  -> DESCONTO_MANUAL_EXCESSIVO (rejeitado).
--   2) MANUAL com desconto <= 15% -> aceito.
--   3) ATACADO com desconto > 15% -> aceito (isento por tabela de atacado).
-- Observação: o teto por item NÃO é ampliado por token de gerente no caminho
-- canônico (v4 não seta session.gerente_token_validado — ver §4). Este smoke
-- não seta o flag, refletindo o runtime real.
--
-- Executar em DEV/STAGING (SQL Editor) com sessão autenticada. Side-effect-free
-- (BEGIN/ROLLBACK). Requer 1 caixa e 1 produto existentes.

BEGIN;

DO $$
DECLARE
  v_uid       uuid := auth.uid();
  v_caixa_id  uuid;
  v_produto_id uuid;
  v_venda_id  uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'SMOKE_122: auth.uid() nulo. Execute com sessão autenticada.';
  END IF;

  SELECT id INTO v_caixa_id FROM public.caixas ORDER BY created_at DESC LIMIT 1;
  IF v_caixa_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_122: nenhum caixa disponível para FK.';
  END IF;

  SELECT id INTO v_produto_id FROM public.produtos WHERE ativo = true LIMIT 1;
  IF v_produto_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_122: nenhum produto ativo para FK.';
  END IF;

  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status
  ) VALUES (
    v_venda_id, v_caixa_id, v_uid, 10.00, 0.00, 10.00, 'PIX', 'CONCLUIDA'
  );

  -- 1) MANUAL 20% (> 15%) -> deve falhar.
  BEGIN
    INSERT INTO public.itens_venda (
      id, venda_id, produto_id, quantidade,
      preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco
    ) VALUES (
      gen_random_uuid(), v_venda_id, v_produto_id, 1, 10.00, 8.00, 2.00, 'MANUAL'
    );
    RAISE EXCEPTION 'SMOKE_122: MANUAL 20%% deveria ter sido rejeitado pelo teto.';
  EXCEPTION WHEN OTHERS THEN
    IF POSITION('DESCONTO_MANUAL_EXCESSIVO' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'SMOKE_122: erro inesperado no cenário MANUAL 20%%: %', SQLERRM;
    END IF;
  END;

  -- 2) MANUAL 14% (<= 15%) -> deve aceitar.
  INSERT INTO public.itens_venda (
    id, venda_id, produto_id, quantidade,
    preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco
  ) VALUES (
    gen_random_uuid(), v_venda_id, v_produto_id, 1, 10.00, 8.60, 1.40, 'MANUAL'
  );

  -- 3) ATACADO 50% -> deve aceitar (isento do teto).
  INSERT INTO public.itens_venda (
    id, venda_id, produto_id, quantidade,
    preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco
  ) VALUES (
    gen_random_uuid(), v_venda_id, v_produto_id, 1, 10.00, 5.00, 5.00, 'ATACADO'
  );

  RAISE NOTICE 'SMOKE_122_OK: teto 15%%/item rejeita MANUAL>15%%, aceita MANUAL<=15%% e isenta ATACADO.';
END $$;

ROLLBACK;
