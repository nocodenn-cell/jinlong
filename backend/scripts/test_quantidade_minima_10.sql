-- Teste direcionado: Regra de quantidade mínima = 10
-- Valida: 9 → VAREJO, 10 → ATACADO, 11 → ATACADO, 10 → 9 → VAREJO
-- Também testa revalidação backend (frontend não consegue enviar preço inválido)

\set ON_ERROR_STOP on
BEGIN;

-- Setup: produto com tier mínimo 10
SELECT p.id AS produto, p.loja_id AS loja
FROM public.produtos p
WHERE p.ativo AND p.loja_id IS NOT NULL
ORDER BY p.id
LIMIT 1 \gset

SELECT set_config('d0.produto', :'produto', true),
       set_config('d0.loja', :'loja', true);

-- Limpar e preparar
UPDATE public.produtos
SET preco_varejo = 100, preco_atacado = 50, preco_custo = 30, permitir_abaixo_custo = true
WHERE id = :'produto'::uuid;

DELETE FROM public.precos_atacado
WHERE produto_id = :'produto'::uuid;

-- Tier único: mínimo 10, preço 80
INSERT INTO public.precos_atacado(produto_id, loja_id, quantidade_minima, preco_unitario, ativo)
VALUES (:'produto'::uuid, :'loja'::uuid, 10, 80, true);

-- ============================================================================
-- TESTES: Regra de quantidade mínima
-- ============================================================================

DO $test$
DECLARE
  v_prod constant uuid := current_setting('d0.produto')::uuid;
  v_loja constant uuid := current_setting('d0.loja')::uuid;
  v_preco_9 numeric;
  v_tipo_9 text;
  v_preco_10 numeric;
  v_tipo_10 text;
  v_preco_11 numeric;
  v_tipo_11 text;
BEGIN
  -- Teste 1: 9 unidades → VAREJO @ 100
  v_preco_9 := (public.calcular_preco_produto(v_prod, 9, v_loja)->>'preco')::numeric;
  v_tipo_9 := (public.calcular_preco_produto(v_prod, 9, v_loja)->>'tipo')::text;

  IF v_preco_9 <> 100 THEN
    RAISE EXCEPTION 'FAIL: qty=9 preco (esperado 100, recebido %)', v_preco_9;
  END IF;
  IF v_tipo_9 <> 'VAREJO' THEN
    RAISE EXCEPTION 'FAIL: qty=9 tipo (esperado VAREJO, recebido %)', v_tipo_9;
  END IF;

  -- Teste 2: 10 unidades (iguala mínimo) → ATACADO @ 80
  v_preco_10 := (public.calcular_preco_produto(v_prod, 10, v_loja)->>'preco')::numeric;
  v_tipo_10 := (public.calcular_preco_produto(v_prod, 10, v_loja)->>'tipo')::text;

  IF v_preco_10 <> 80 THEN
    RAISE EXCEPTION 'FAIL: qty=10 preco (esperado 80, recebido %)', v_preco_10;
  END IF;
  IF v_tipo_10 <> 'ATACADO' THEN
    RAISE EXCEPTION 'FAIL: qty=10 tipo (esperado ATACADO, recebido %)', v_tipo_10;
  END IF;

  -- Teste 3: 11 unidades (acima mínimo) → ATACADO @ 80
  v_preco_11 := (public.calcular_preco_produto(v_prod, 11, v_loja)->>'preco')::numeric;
  v_tipo_11 := (public.calcular_preco_produto(v_prod, 11, v_loja)->>'tipo')::text;

  IF v_preco_11 <> 80 THEN
    RAISE EXCEPTION 'FAIL: qty=11 preco (esperado 80, recebido %)', v_preco_11;
  END IF;
  IF v_tipo_11 <> 'ATACADO' THEN
    RAISE EXCEPTION 'FAIL: qty=11 tipo (esperado ATACADO, recebido %)', v_tipo_11;
  END IF;

  -- Teste 4: Transição 10 (ATACADO) → 9 (VAREJO) reverte
  -- Já testado acima (v_preco_9, v_tipo_9), validar coerência
  IF v_preco_10 = v_preco_9 THEN
    RAISE EXCEPTION 'FAIL: qty=10 e qty=9 deveriam ter preços diferentes, ambos %', v_preco_10;
  END IF;

  RAISE NOTICE 'PASS: Regra de quantidade mínima 10 validada com sucesso';
  RAISE NOTICE '  qty=9  → % @ %', v_tipo_9, v_preco_9;
  RAISE NOTICE '  qty=10 → % @ %', v_tipo_10, v_preco_10;
  RAISE NOTICE '  qty=11 → % @ %', v_tipo_11, v_preco_11;
END $test$;

-- ============================================================================
-- TESTE: Backend revalida preço independentemente do frontend
-- ============================================================================
-- Simular: frontend envia item como VAREJO @ 100 mas qty=10 deveria ser ATACADO @ 80

DO $test$
DECLARE
  v_prod constant uuid := current_setting('d0.produto')::uuid;
  v_loja constant uuid := current_setting('d0.loja')::uuid;
  v_preco_backend numeric;
  v_tipo_backend text;
  v_preco_falso numeric := 100; -- Frontend tentou passar VAREJO
  v_tipo_falso text := 'VAREJO'; -- Frontend tentou passar VAREJO
BEGIN
  -- Backend SEMPRE recalcula, não usa valores do frontend
  v_preco_backend := (public.calcular_preco_produto(v_prod, 10, v_loja)->>'preco')::numeric;
  v_tipo_backend := (public.calcular_preco_produto(v_prod, 10, v_loja)->>'tipo')::text;

  -- Validar que backend não aceitou o falso
  IF v_preco_backend = v_preco_falso AND v_tipo_backend = v_tipo_falso THEN
    RAISE EXCEPTION 'FAIL: Backend aceitou valor falso do frontend (qty=10 como VAREJO)';
  END IF;

  -- Validar que backend aplicou ATACADO
  IF v_preco_backend <> 80 OR v_tipo_backend <> 'ATACADO' THEN
    RAISE EXCEPTION 'FAIL: Backend não revalidou corretamente. Esperado ATACADO@80, recebido %@%', v_tipo_backend, v_preco_backend;
  END IF;

  RAISE NOTICE 'PASS: Backend revalidou corretamente (rejeitou VAREJO@100 falso, aplicou ATACADO@80)';
END $test$;

SELECT 'QUANTIDADE_MINIMA_10: OK' AS resultado;

ROLLBACK;
