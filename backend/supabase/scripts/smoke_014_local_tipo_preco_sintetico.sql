-- Smoke de contrato: divergência Web × Local de tipo_preco (RPC 014).
-- Autoridade: public.registrar_venda_com_itens (migration 014, caminho Local via sync-outbox).
-- Contrato: docs/regras-negocio/MATRIZ_PRECO_FINAL.md §5.
--
-- Fixa objetivamente o comportamento DELIBERADO do canal Local:
--   * O tipo_preco enviado pelo cliente é IGNORADO e SINTETIZADO:
--       preco_unitario < preco_original -> 'ATACADO', senão 'VAREJO'.
--   * Consequência: um item com desconto de 50% (>> 15%) é persistido como
--     'ATACADO' e NÃO é barrado pelo teto por item (trigger 122 isenta ATACADO).
--   Isto é uma exceção documentada (offline confia no snapshot validado no PDV).
--
-- Executar em DEV/STAGING (SQL Editor) com sessão autenticada. Side-effect-free
-- (BEGIN/ROLLBACK). registrar_venda_com_itens exige EXECUTE (service_role); em
-- SQL Editor como service_role/owner isto está disponível.

BEGIN;

DO $$
DECLARE
  v_uid        uuid := COALESCE(auth.uid(), (SELECT id FROM auth.users LIMIT 1));
  v_caixa_id   uuid;
  v_produto_id uuid;
  v_venda_id   uuid := gen_random_uuid();
  v_tipo       text;
BEGIN
  SELECT id INTO v_caixa_id FROM public.caixas ORDER BY created_at DESC LIMIT 1;
  IF v_caixa_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_014: nenhum caixa disponível para FK.';
  END IF;

  SELECT id INTO v_produto_id FROM public.produtos WHERE ativo = true LIMIT 1;
  IF v_produto_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_014: nenhum produto ativo para FK.';
  END IF;

  -- Item com 50% de desconto e tipo_preco 'MANUAL' informado pelo cliente:
  -- o Local deve IGNORAR 'MANUAL' e sintetizar 'ATACADO' (preco_unitario < original),
  -- sem disparar o teto por item.
  PERFORM public.registrar_venda_com_itens(
    v_venda_id,
    v_caixa_id,
    v_uid,
    'PIX',
    10.00,   -- total_bruto
    5.00,    -- total_desconto
    5.00,    -- total_liquido
    jsonb_build_array(
      jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_produto_id,
        'quantidade', 1,
        'preco_original', 10.00,
        'preco_unitario', 5.00,
        'tipo_preco', 'MANUAL'
      )
    )
  );

  SELECT tipo_preco INTO v_tipo
  FROM public.itens_venda
  WHERE venda_id = v_venda_id
  LIMIT 1;

  IF v_tipo IS DISTINCT FROM 'ATACADO' THEN
    RAISE EXCEPTION 'SMOKE_014: esperado tipo_preco sintetizado ATACADO, obtido %.', v_tipo;
  END IF;

  RAISE NOTICE 'SMOKE_014_OK: Local sintetiza tipo_preco=ATACADO em desconto e não aplica o teto por item (exceção deliberada §5).';
END $$;

ROLLBACK;
