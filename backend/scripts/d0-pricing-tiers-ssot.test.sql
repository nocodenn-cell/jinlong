\set ON_ERROR_STOP on
BEGIN;

SELECT p.id AS produto, p.loja_id AS loja
FROM public.produtos p
WHERE p.ativo AND p.loja_id IS NOT NULL
ORDER BY p.id
LIMIT 1 \gset

SELECT set_config('d0.produto', :'produto', true),
       set_config('d0.loja', :'loja', true);

-- D0: tiers ativos do produto são a única autoridade de atacado.
UPDATE public.produtos
SET preco_varejo = 10, preco_atacado = 6.50, preco_custo = 1, permitir_abaixo_custo = true
WHERE id = :'produto'::uuid;

UPDATE public.pdv_config
SET quantidade_minima_atacado_padrao = 2
WHERE id = 1;

DELETE FROM public.precos_atacado
WHERE produto_id = :'produto'::uuid;

INSERT INTO public.precos_atacado(produto_id, loja_id, quantidade_minima, preco_unitario, ativo)
VALUES
  (:'produto'::uuid, :'loja'::uuid, 5, 8, true),
  (:'produto'::uuid, :'loja'::uuid, 10, 7, true);

DO $test$
DECLARE
  v_prod constant uuid := current_setting('d0.produto')::uuid;
  v_loja constant uuid := current_setting('d0.loja')::uuid;
BEGIN
  IF (public.calcular_preco_produto(v_prod, 4, v_loja)->>'preco')::numeric <> 10 THEN
    RAISE EXCEPTION 'D0_PRICING_Q4';
  END IF;
  IF (public.calcular_preco_produto(v_prod, 5, v_loja)->>'preco')::numeric <> 8 THEN
    RAISE EXCEPTION 'D0_PRICING_Q5';
  END IF;
  IF (public.calcular_preco_produto(v_prod, 9, v_loja)->>'preco')::numeric <> 8 THEN
    RAISE EXCEPTION 'D0_PRICING_Q9';
  END IF;
  IF (public.calcular_preco_produto(v_prod, 10, v_loja)->>'preco')::numeric <> 7 THEN
    RAISE EXCEPTION 'D0_PRICING_Q10';
  END IF;
END $test$;

UPDATE public.precos_atacado
SET ativo = false
WHERE produto_id = :'produto'::uuid
  AND quantidade_minima = 5;

DO $test$
DECLARE
  v_prod constant uuid := current_setting('d0.produto')::uuid;
  v_loja constant uuid := current_setting('d0.loja')::uuid;
BEGIN
  IF (public.calcular_preco_produto(v_prod, 5, v_loja)->>'preco')::numeric <> 10
     OR (public.calcular_preco_produto(v_prod, 9, v_loja)->>'preco')::numeric <> 10 THEN
    RAISE EXCEPTION 'D0_PRICING_TIER5_INATIVO_GLOBAL_INTERFERIU';
  END IF;
  IF (public.calcular_preco_produto(v_prod, 10, v_loja)->>'preco')::numeric <> 7 THEN
    RAISE EXCEPTION 'D0_PRICING_TIER10';
  END IF;
END $test$;

UPDATE public.precos_atacado
SET ativo = false
WHERE produto_id = :'produto'::uuid;

DO $test$
BEGIN
  IF (public.calcular_preco_produto(
        current_setting('d0.produto')::uuid, 100, current_setting('d0.loja')::uuid
      )->>'preco')::numeric <> 10 THEN
    RAISE EXCEPTION 'D0_PRICING_SEM_TIER_USOU_LEGADO_OU_GLOBAL';
  END IF;
END $test$;

SELECT 'D0 PRICING TIERS SSOT: OK' AS resultado;
ROLLBACK;

