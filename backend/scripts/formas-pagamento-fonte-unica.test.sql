-- ============================================================================
-- Formas de pagamento como fonte unica -- teste transacional
-- ============================================================================
-- Cobre a migration 20260912120000. Tudo dentro de BEGIN/ROLLBACK: nao deixa
-- residuo no banco.
--
-- O que precisa valer:
--   1. o catalogo serve as DUAS telas, cada uma pelo seu escopo;
--   2. as quatro formas do piloto continuam disponiveis dos dois lados;
--   3. `BOLETO`/`TRANSF` so aparecem para quem paga -- nao poluem o recebimento;
--   4. Contas a Pagar passou a aceitar o vocabulario canonico de cartao;
--   5. o alargamento nao invalidou nenhum historico.
-- ============================================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_loja uuid;
  v_n int;
BEGIN
  SELECT loja_id INTO v_loja FROM public.formas_pagamento LIMIT 1;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'PRE-CONDICAO: nenhuma loja com catalogo de formas';
  END IF;

  -- 1 + 2. As quatro do piloto valem para RECEBER e para PAGAR.
  SELECT count(*) INTO v_n
  FROM public.formas_pagamento
  WHERE loja_id = v_loja
    AND ativo
    AND escopo = 'AMBOS'
    AND codigo IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'ESPERADO 4 formas do piloto em AMBOS, veio %', v_n;
  END IF;

  -- 3. Escopo separa o que cada tela oferece.
  SELECT count(*) INTO v_n
  FROM public.formas_pagamento
  WHERE loja_id = v_loja AND ativo AND escopo IN ('PAGAR', 'AMBOS');
  IF v_n < 6 THEN
    RAISE EXCEPTION 'PAGAR deveria ver ao menos 6 formas (4 + boleto + transf), veio %', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.formas_pagamento
    WHERE loja_id = v_loja AND escopo = 'RECEBER' AND codigo IN ('BOLETO', 'TRANSF')
  ) THEN
    RAISE EXCEPTION 'BOLETO/TRANSF nao podem estar no escopo de recebimento';
  END IF;

  RAISE NOTICE 'OK 1-3: catalogo unico com escopo correto';
END $$;

-- 4. Contas a Pagar aceita o vocabulario canonico de cartao.
DO $$
DECLARE
  v_conta uuid;
BEGIN
  SELECT id INTO v_conta FROM public.contas_pagar LIMIT 1;
  IF v_conta IS NULL THEN
    RAISE NOTICE 'PULADO 4: nenhuma conta a pagar no banco';
    RETURN;
  END IF;

  INSERT INTO public.contas_pagar_pagamentos (conta_id, valor, forma_pagamento)
  VALUES (v_conta, 0.01, 'CARTAO_DEBITO');
  RAISE NOTICE 'OK 4: CARTAO_DEBITO aceito em contas_pagar_pagamentos';

  -- 5. E os valores historicos seguem validos.
  INSERT INTO public.contas_pagar_pagamentos (conta_id, valor, forma_pagamento)
  VALUES (v_conta, 0.01, 'BOLETO'), (v_conta, 0.01, 'TRANSF'), (v_conta, 0.01, 'CARTAO');
  RAISE NOTICE 'OK 5: BOLETO/TRANSF/CARTAO continuam validos (historico preservado)';
END $$;

-- Forma inexistente continua recusada: alargar nao e abrir.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.contas_pagar_pagamentos (conta_id, valor, forma_pagamento)
    SELECT id, 0.01, 'CHEQUE' FROM public.contas_pagar LIMIT 1;
    RAISE EXCEPTION 'FALHOU: CHEQUE deveria ser recusado pelo CHECK';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 6: forma fora do CHECK continua recusada pelo banco';
  END;
END $$;

ROLLBACK;
