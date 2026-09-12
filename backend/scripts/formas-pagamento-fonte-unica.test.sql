-- ============================================================================
-- Formas de pagamento -- teste transacional
-- ============================================================================
-- Cobre as migrations 20260912120000 (catalogo com escopo) e 20260912140000
-- (restauracao do contrato do AP). Tudo em BEGIN/ROLLBACK: sem residuo.
--
-- CORRECAO DE METODO. A primeira versao deste arquivo testava `INSERT` direto
-- em `contas_pagar_pagamentos` e passava -- enquanto a tela quebrava. Testava a
-- camada errada: o CHECK da tabela nao e o unico guardiao, a RPC
-- `registrar_pagamento_contas_pagar` valida o proprio conjunto de formas. Foi
-- assim que CARTAO_DEBITO/CARTAO_CREDITO chegaram a ser oferecidos numa tela
-- cuja RPC os recusa. Agora o teste passa pela RPC, que e o caminho real de
-- escrita.
--
-- O que precisa valer:
--   1. cada forma do catalogo PAGAR e aceita pela RPC do AP;
--   2. debito/credito sao RECUSADOS pelo AP -- nao sao forma de pagar fornecedor;
--   3. o catalogo oferecido a cada tela espelha exatamente a RPC daquela tela;
--   4. o historico gravado continua valido.
-- ============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- 3. Catalogo espelha as duas RPCs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pagar text;
  v_receber text;
BEGIN
  SELECT string_agg(codigo, ' ' ORDER BY codigo) INTO v_pagar
  FROM public.formas_pagamento WHERE ativo AND escopo IN ('PAGAR', 'AMBOS');

  SELECT string_agg(codigo, ' ' ORDER BY codigo) INTO v_receber
  FROM public.formas_pagamento WHERE ativo AND escopo IN ('RECEBER', 'AMBOS');

  IF v_pagar IS DISTINCT FROM 'BOLETO CARTAO DINHEIRO PIX TRANSF' THEN
    RAISE EXCEPTION 'PAGAR fora do contrato de registrar_pagamento_contas_pagar: %', v_pagar;
  END IF;

  IF v_receber IS DISTINCT FROM 'CARTAO_CREDITO CARTAO_DEBITO DINHEIRO OUTROS PIX' THEN
    RAISE EXCEPTION 'RECEBER fora do contrato de registrar_liquidacao_receber: %', v_receber;
  END IF;

  -- O escopo tem de separar de fato: sem isso, um catalogo unico nao serve dois
  -- contratos legitimamente diferentes.
  IF EXISTS (SELECT 1 FROM public.formas_pagamento
             WHERE codigo IN ('CARTAO_DEBITO','CARTAO_CREDITO') AND escopo <> 'RECEBER') THEN
    RAISE EXCEPTION 'debito/credito nao podem valer para PAGAR';
  END IF;

  IF EXISTS (SELECT 1 FROM public.formas_pagamento
             WHERE codigo IN ('BOLETO','TRANSF') AND escopo <> 'PAGAR') THEN
    RAISE EXCEPTION 'boleto/transferencia nao podem valer para RECEBER';
  END IF;

  RAISE NOTICE 'OK 3: catalogo espelha as duas RPCs, com escopo separando';
END $$;

-- ---------------------------------------------------------------------------
-- 1 + 2. As formas passando pela RPC REAL do Contas a Pagar
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conta uuid;
  v_dono uuid;
  v_forma text;
  v_recusada text;
BEGIN
  SELECT u.id INTO v_dono FROM public.usuarios u
  WHERE u.ativo AND u.perfil IN ('DONO','ADMIN','GERENTE') LIMIT 1;

  SELECT cp.id INTO v_conta FROM public.contas_pagar cp
  WHERE cp.status NOT IN ('PAGO','CANCELADO') LIMIT 1;

  IF v_dono IS NULL OR v_conta IS NULL THEN
    RAISE NOTICE 'PULADO 1-2: falta usuario elegivel ou conta em aberto no seed';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_dono::text, 'role', 'authenticated')::text, true);

  -- 1. Nenhuma forma do escopo PAGAR pode ser recusada POR SER A FORMA.
  --
  -- A assercao e sobre o contrato de formas, nao sobre as demais regras do
  -- pagamento. `DINHEIRO`, por exemplo, e uma sangria -- o dinheiro sai do
  -- caixa fisico -- e pode falhar legitimamente com
  -- MOV_CAIXA_SALDO_INSUFICIENTE quando o caixa nao tem saldo. Isso e regra de
  -- caixa funcionando, e nao torna DINHEIRO uma forma invalida. O que nunca
  -- pode acontecer e PAGAMENTO_FORMA_INVALIDA numa forma que a tela oferece.
  FOR v_forma IN
    SELECT codigo FROM public.formas_pagamento
    WHERE ativo AND escopo IN ('PAGAR','AMBOS') ORDER BY codigo
  LOOP
    BEGIN
      PERFORM public.registrar_pagamento_contas_pagar(
        p_conta_id => v_conta,
        p_valor => 0.01,
        p_forma => v_forma,
        p_idempotency_key => 'qa-' || v_forma || '-' || gen_random_uuid()::text
      );
      RAISE NOTICE 'OK 1: RPC do AP aceitou %', v_forma;
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM = 'PAGAMENTO_FORMA_INVALIDA' THEN
        RAISE EXCEPTION
          'FALHOU: a tela oferece % e a RPC do AP recusa a forma', v_forma;
      END IF;
      RAISE NOTICE 'OK 1: forma % aceita pelo contrato (parou em outra regra: %)',
        v_forma, SQLERRM;
    END;
  END LOOP;

  -- 2. E debito/credito tem de ser recusados -- nao sao forma de pagar fornecedor.
  FOREACH v_recusada IN ARRAY ARRAY['CARTAO_DEBITO','CARTAO_CREDITO']
  LOOP
    BEGIN
      PERFORM public.registrar_pagamento_contas_pagar(
        p_conta_id => v_conta,
        p_valor => 0.01,
        p_forma => v_recusada,
        p_idempotency_key => 'qa-neg-' || v_recusada || '-' || gen_random_uuid()::text
      );
      RAISE EXCEPTION 'FALHOU: RPC do AP aceitou %, que nao e forma de pagar fornecedor', v_recusada;
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM <> 'PAGAMENTO_FORMA_INVALIDA' THEN RAISE; END IF;
      RAISE NOTICE 'OK 2: RPC do AP recusou % (PAGAMENTO_FORMA_INVALIDA)', v_recusada;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Historico gravado continua valido sob o CHECK restaurado
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fora bigint;
BEGIN
  SELECT count(*) INTO v_fora
  FROM public.contas_pagar_pagamentos
  WHERE forma_pagamento NOT IN ('DINHEIRO','PIX','CARTAO','BOLETO','TRANSF');

  IF v_fora > 0 THEN
    RAISE EXCEPTION 'FALHOU: % pagamento(s) historicos fora do dominio restaurado', v_fora;
  END IF;
  RAISE NOTICE 'OK 4: historico integro sob o CHECK restaurado';
END $$;

ROLLBACK;
