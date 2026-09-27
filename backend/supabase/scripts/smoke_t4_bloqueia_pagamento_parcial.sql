-- Smoke test da migration 20260927120000_t4_bloqueia_pagamento_parcial_finalizar_venda.sql
-- Executar em ambiente DEV/STAGING no SQL Editor (papel com permissão para
-- chamar finalizar_venda_transacional_canonica_v4_unscoped diretamente, ex.
-- service_role/postgres — a função unscoped não é exposta a authenticated).
--
-- 100% autocontido: cria loja/usuário/caixa/produto/cliente sintéticos com
-- gen_random_uuid() e roda tudo dentro de uma transação que nunca comita
-- (ROLLBACK no final) — seguro para rodar contra um banco com dados reais,
-- nada fica gravado.
--
-- Cenários (ver relatório T4, auditoria Jinlong 2026-09-27):
--   1) pagamento == total                              -> aceita
--   2) pagamento > total                                -> rejeita (preexistente, preservado)
--   3) pagamento < total, sem cliente_id                -> rejeita
--   4) pagamento < total, COM cliente_id (o bug relatado) -> rejeita (antes: aceitava e criava contas_receber)
--   5) nenhum dos cenários rejeitados grava vendas nem contas_receber

BEGIN;

DO $$
DECLARE
  v_loja_id uuid := gen_random_uuid();
  v_uid uuid := gen_random_uuid();
  v_caixa_id uuid := gen_random_uuid();
  v_produto_id uuid := gen_random_uuid();
  v_cliente_id uuid := gen_random_uuid();
  v_venda_aceita uuid := gen_random_uuid();
  v_venda_excede uuid := gen_random_uuid();
  v_venda_insuf_sem_cliente uuid := gen_random_uuid();
  v_venda_insuf_com_cliente uuid := gen_random_uuid();
  v_total numeric := 51.80;
  v_pago_parcial numeric := 25.90;
  v_res record;
  v_erro text;
BEGIN
  INSERT INTO public.usuarios (id, loja_id, ativo) VALUES (v_uid, v_loja_id, true);
  INSERT INTO public.caixas (id, loja_id, operador_id, status) VALUES (v_caixa_id, v_loja_id, v_uid, 'ABERTO');
  INSERT INTO public.produtos (id, preco_custo, nome, ativo, status_publicacao, unidade_medida, origem, tem_nf)
  VALUES (v_produto_id, 10, 'Produto SMOKE T4', true, 'PUBLICADO', 'UN', 'china_manual', false);
  INSERT INTO public.clientes (id, loja_id, nome, tipo, limite_credito, ativo)
  VALUES (v_cliente_id, v_loja_id, 'Cliente SMOKE T4', 'PF', 9999, true);
  INSERT INTO public.formas_pagamento (loja_id, codigo, ativo) VALUES
    (v_loja_id, 'DINHEIRO', true), (v_loja_id, 'PIX', true),
    (v_loja_id, 'CARTAO_DEBITO', true), (v_loja_id, 'CARTAO_CREDITO', true)
  ON CONFLICT DO NOTHING;

  -- 1) pagamento == total -> aceita
  SELECT * INTO v_res FROM public.finalizar_venda_transacional_canonica_v4_unscoped(
    v_venda_aceita, v_caixa_id, v_uid, v_loja_id, 'PIX',
    v_total, 0, v_total,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'PIX', 'valor', v_total)),
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id,
      'quantidade', 1, 'preco_original', v_total, 'preco_unitario', v_total, 'tipo_preco', 'MANUAL')),
    NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
  );
  IF v_res.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SMOKE_T4 CASO 1 FALHOU: esperado CONCLUIDA, veio %', v_res.status;
  END IF;

  -- 2) pagamento > total -> rejeita (comportamento preexistente, preservado)
  BEGIN
    PERFORM * FROM public.finalizar_venda_transacional_canonica_v4_unscoped(
      v_venda_excede, v_caixa_id, v_uid, v_loja_id, 'PIX',
      v_total, 0, v_total,
      jsonb_build_array(jsonb_build_object('forma_pagamento', 'PIX', 'valor', v_total + 10)),
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id,
        'quantidade', 1, 'preco_original', v_total, 'preco_unitario', v_total, 'tipo_preco', 'MANUAL')),
      NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'SMOKE_T4 CASO 2 FALHOU: deveria ter rejeitado pagamento > total';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF POSITION('PAGAMENTOS_EXCEDEM_TOTAL' IN v_erro) = 0 THEN
      RAISE EXCEPTION 'SMOKE_T4 CASO 2 FALHOU: erro inesperado: %', v_erro;
    END IF;
  END;

  -- 3) pagamento < total, sem cliente -> rejeita
  BEGIN
    PERFORM * FROM public.finalizar_venda_transacional_canonica_v4_unscoped(
      v_venda_insuf_sem_cliente, v_caixa_id, v_uid, v_loja_id, 'PIX',
      v_total, 0, v_total,
      jsonb_build_array(jsonb_build_object('forma_pagamento', 'PIX', 'valor', v_pago_parcial)),
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id,
        'quantidade', 1, 'preco_original', v_total, 'preco_unitario', v_total, 'tipo_preco', 'MANUAL')),
      NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'SMOKE_T4 CASO 3 FALHOU: deveria ter rejeitado pagamento parcial sem cliente';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF POSITION('PAGAMENTOS_INSUFICIENTES' IN v_erro) = 0 THEN
      RAISE EXCEPTION 'SMOKE_T4 CASO 3 FALHOU: erro inesperado: %', v_erro;
    END IF;
  END;

  -- 4) REPRODUÇÃO DO BUG relatado: pagamento < total, COM cliente_id preenchido.
  -- Antes desta migration: aceitava e criava contas_receber automaticamente.
  BEGIN
    PERFORM * FROM public.finalizar_venda_transacional_canonica_v4_unscoped(
      v_venda_insuf_com_cliente, v_caixa_id, v_uid, v_loja_id, 'PIX',
      v_total, 0, v_total,
      jsonb_build_array(jsonb_build_object('forma_pagamento', 'PIX', 'valor', v_pago_parcial)),
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id,
        'quantidade', 1, 'preco_original', v_total, 'preco_unitario', v_total, 'tipo_preco', 'MANUAL')),
      NULL, NULL, false, false, NULL, NULL, NULL, NULL, v_cliente_id
    );
    RAISE EXCEPTION 'SMOKE_T4 CASO 4 FALHOU (BUG NAO CORRIGIDO): venda subpaga com cliente_id foi aceita';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF POSITION('PAGAMENTOS_INSUFICIENTES' IN v_erro) = 0 THEN
      RAISE EXCEPTION 'SMOKE_T4 CASO 4 FALHOU: erro inesperado: %', v_erro;
    END IF;
  END;

  -- 5) Nenhuma tentativa de criar contas_receber ou vendas nos cenários rejeitados
  IF EXISTS (SELECT 1 FROM public.contas_receber WHERE venda_id IN (v_venda_insuf_sem_cliente, v_venda_insuf_com_cliente)) THEN
    RAISE EXCEPTION 'SMOKE_T4 CASO 5 FALHOU: contas_receber foi criado em cenário rejeitado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vendas WHERE id IN (v_venda_insuf_sem_cliente, v_venda_insuf_com_cliente)) THEN
    RAISE EXCEPTION 'SMOKE_T4 CASO 5 FALHOU: venda foi persistida em cenário rejeitado';
  END IF;

  RAISE NOTICE 'SMOKE_T4_OK: pagamento=total aceita; >total, <total sem cliente e <total com cliente rejeitam; nenhum contas_receber criado.';
END $$;

ROLLBACK;
