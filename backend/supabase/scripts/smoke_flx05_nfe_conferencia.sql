-- ==========================================================
-- SMOKE FLX-05 — conferência de NF-e antes de creditar estoque/contas_pagar
-- ==========================================================
--
-- Roda DENTRO de uma transação com ROLLBACK no final — mesma técnica usada
-- para provar o FLX-04 antes de aplicar (zero dado residual em produção).
-- Requer a migration 296_nfe_conferencia.sql já aplicada (ou aplicada na
-- mesma transação, antes deste script).
--
-- Cobre os três cenários pedidos: sem conferência bloqueia; divergente
-- registra (com auditoria); conferido credita a quantidade ACEITA, nunca a
-- declarada na nota. Mais dois extras que o FLX-04 também provou: segunda
-- confirmação bloqueia (idempotência), e contas_pagar só nasce na
-- confirmação (nunca antes).
--
-- Uso:
--   BEGIN;
--   \i backend/supabase/migrations/296_nfe_conferencia.sql   -- sem o BEGIN/COMMIT da migration, ou aplicada antes
--   \i backend/supabase/scripts/smoke_flx05_nfe_conferencia.sql
--   ROLLBACK;

DO $$
DECLARE
  v_gerente_id uuid;
  v_loja_id uuid;
  v_produto_a uuid;
  v_produto_b uuid;
  v_chave text;
  v_imp_id uuid;
  v_item_a uuid;
  v_item_b uuid;
  v_status text;
  v_qtd numeric;
BEGIN
  SELECT id, loja_id INTO v_gerente_id, v_loja_id
  FROM public.usuarios
  WHERE ativo = true AND perfil IN ('GERENTE','DONO') AND loja_id IS NOT NULL
  LIMIT 1;

  IF v_gerente_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: gerente/dono nao encontrado na matriz';
  END IF;

  -- Simula auth.uid() do gerente encontrado (sem JWT real no SQL Editor/MCP).
  PERFORM set_config('request.jwt.claim.sub', v_gerente_id::text, true);

  v_chave := lpad('99', 44, '3');

  -- Setup: importa NF-e com 2 itens (A=10un, B=20un) + 1 duplicata (R$150).
  SELECT (public.importar_nfe_transacao(
    v_chave,
    '1',
    '11222333000181',
    'Fornecedor Smoke FLX-05',
    v_loja_id,
    jsonb_build_array(
      jsonb_build_object('nome_produto','Produto Smoke A','gtin',null,'ref_fornecedor','SMOKE-FLX05-A','ncm',null,'u_com','UN','q_com',10,'v_un_com',5.00,'fator',1,'atualizar_custo',true),
      jsonb_build_object('nome_produto','Produto Smoke B','gtin',null,'ref_fornecedor','SMOKE-FLX05-B','ncm',null,'u_com','UN','q_com',20,'v_un_com',2.50,'fator',1,'atualizar_custo',true)
    ),
    true,
    jsonb_build_array(
      jsonb_build_object('numero','1','data_vencimento', (now()+interval '30 days')::date::text, 'valor', 150.00)
    )
  )->>'importacao_id')::uuid INTO v_imp_id;

  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: importacao nao criada';
  END IF;

  SELECT id INTO v_produto_a FROM public.produtos WHERE referencia_fornecedor='SMOKE-FLX05-A' AND loja_id=v_loja_id;
  SELECT id INTO v_produto_b FROM public.produtos WHERE referencia_fornecedor='SMOKE-FLX05-B' AND loja_id=v_loja_id;
  SELECT id INTO v_item_a FROM public.importacoes_nfe_itens WHERE importacao_nfe_id=v_imp_id AND produto_id=v_produto_a;
  SELECT id INTO v_item_b FROM public.importacoes_nfe_itens WHERE importacao_nfe_id=v_imp_id AND produto_id=v_produto_b;

  IF v_produto_a IS NULL OR v_produto_b IS NULL OR v_item_a IS NULL OR v_item_b IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: produtos ou itens de importacao nao foram criados corretamente';
  END IF;

  -- Setup provado: nada foi creditado/gerado ainda.
  IF EXISTS (SELECT 1 FROM public.contas_pagar WHERE nfe_importacao_id = v_imp_id) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: contas_pagar criada antes da conferencia';
  END IF;

  SELECT quantidade_atual INTO v_qtd FROM public.estoque WHERE produto_id=v_produto_a AND loja_id=v_loja_id;
  IF v_qtd IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: estoque creditado antes da conferencia (esperado 0, achou %)', v_qtd;
  END IF;

  -- CENARIO 1: SEM CONFERENCIA -> BLOQUEIA.
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp_id);
    RAISE EXCEPTION 'SMOKE_FAIL: confirmar sem conferencia nao bloqueou';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IMPORT_NFE_CONFERENCIA_PENDENTE' THEN
      RAISE EXCEPTION 'SMOKE_FAIL: erro inesperado ao confirmar sem conferencia: %', SQLERRM;
    END IF;
  END;

  -- CENARIO 2: DIVERGENTE REGISTRA. A: nota=10, conferido=7 (divergente).
  -- B: nota=20, conferido=20 (bate).
  PERFORM public.registrar_conferencia_nfe(
    v_imp_id,
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_a, 'quantidade_conferida', 7, 'divergencia_obs', 'smoke: 3 unidades nao chegaram'),
      jsonb_build_object('item_id', v_item_b, 'quantidade_conferida', 20)
    )
  );

  SELECT status_conferencia INTO v_status FROM public.importacoes_nfe_itens WHERE id = v_item_a;
  IF v_status <> 'DIVERGENTE' THEN
    RAISE EXCEPTION 'SMOKE_FAIL: item A deveria estar DIVERGENTE, esta %', v_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.importacoes_nfe_itens
    WHERE id = v_item_a AND divergencia_obs = 'smoke: 3 unidades nao chegaram'
      AND conferido_por = v_gerente_id AND conferido_em IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: divergencia nao gravou auditoria completa (obs/conferido_por/conferido_em)';
  END IF;

  SELECT status_conferencia INTO v_status FROM public.importacoes_nfe_itens WHERE id = v_item_b;
  IF v_status <> 'CONFERIDO' THEN
    RAISE EXCEPTION 'SMOKE_FAIL: item B deveria estar CONFERIDO, esta %', v_status;
  END IF;

  -- CENARIO 3: CONFERIDO CREDITA A QUANTIDADE ACEITA (nao a da nota). Tudo
  -- conferido (mesmo com divergencia) -> confirmar aceita e credita o
  -- CONTADO: 7 para A (nota dizia 10), 20 para B.
  PERFORM public.confirmar_importacao_nfe(v_imp_id);

  SELECT quantidade_atual INTO v_qtd FROM public.estoque WHERE produto_id=v_produto_a AND loja_id=v_loja_id;
  IF v_qtd <> 7 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: produto A deveria ter 7 (conferido), tem % (nota dizia 10)', v_qtd;
  END IF;

  SELECT quantidade_atual INTO v_qtd FROM public.estoque WHERE produto_id=v_produto_b AND loja_id=v_loja_id;
  IF v_qtd <> 20 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: produto B deveria ter 20, tem %', v_qtd;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contas_pagar
    WHERE nfe_importacao_id = v_imp_id AND valor_total = 150.00 AND status = 'PENDENTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: contas_pagar nao foi gerada na confirmacao (ou valor/status errado)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.movimentos_estoque_log
    WHERE produto_id=v_produto_a AND tipo_codigo='ENTRADA_NFE' AND quantidade_delta=7
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: kardex nao registrou 7 (conferido) para produto A — nao 10 (nota) nem outro valor';
  END IF;

  -- EXTRA: segunda confirmacao bloqueia (nao duplica credito nem titulo).
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp_id);
    RAISE EXCEPTION 'SMOKE_FAIL: segunda confirmacao nao bloqueou';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IMPORT_NFE_STATUS_INVALIDO' THEN
      RAISE EXCEPTION 'SMOKE_FAIL: erro inesperado na segunda confirmacao: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'SMOKE_OK: FLX-05 verificado';
  RAISE NOTICE '  1) sem conferencia bloqueia -> IMPORT_NFE_CONFERENCIA_PENDENTE';
  RAISE NOTICE '  2) divergente registra -> DIVERGENTE + auditoria (obs/conferido_por/conferido_em)';
  RAISE NOTICE '  3) conferido credita a quantidade ACEITA (7), nunca a da nota (10)';
  RAISE NOTICE '  4) segunda confirmacao bloqueia -> IMPORT_NFE_STATUS_INVALIDO';
  RAISE NOTICE '  5) contas_pagar so nasce na confirmacao, com o valor da duplicata (150.00)';
  RAISE NOTICE 'Loja: %, Importacao: %', v_loja_id, v_imp_id;
  RAISE NOTICE '=========================================';
END
$$;
