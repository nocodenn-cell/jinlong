-- Smoke test da migration 20260927130000_t5_fix_v_kardex_unificado_anti_join_cancelamento.sql
-- Executar em ambiente DEV/STAGING no SQL Editor (papel com permissão de
-- escrita direta nas tabelas envolvidas, ex. service_role/postgres).
--
-- 100% autocontido: cria loja/usuário/caixa/produto sintéticos com
-- gen_random_uuid() e roda tudo dentro de uma transação que nunca comita
-- (ROLLBACK no final) — seguro para rodar contra um banco com dados reais.
--
-- Cenário (ver relatório T5, auditoria Jinlong 2026-09-27): venda de 2 un.,
-- cancelar, kardex deve mostrar EXATAMENTE 1 movimento de entrada vinculado
-- à venda — antes desta migration mostrava 2 (ENTRADA_DEVOLUCAO_CLIENTE +
-- ENTRADA_CANCELAMENTO_VENDA para o mesmo evento).

BEGIN;

DO $$
DECLARE
  v_loja_id uuid := gen_random_uuid();
  v_uid uuid := gen_random_uuid();
  v_caixa_id uuid := gen_random_uuid();
  v_produto_id uuid := gen_random_uuid();
  v_venda_id uuid := gen_random_uuid();
  v_res record;
  v_qtd_linhas_kardex int;
  v_soma_kardex numeric;
BEGIN
  INSERT INTO public.usuarios (id, loja_id, ativo, perfil) VALUES (v_uid, v_loja_id, true, 'GERENTE')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.caixas (id, loja_id, operador_id, status, saldo_atual)
  VALUES (v_caixa_id, v_loja_id, v_uid, 'ABERTO', 1000);
  INSERT INTO public.produtos (id, nome, preco_varejo, unidade_medida, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES (v_produto_id, 'SMOKE T5', 10, 'UN', 'china_manual', false, true, 'PUBLICADO', v_loja_id);
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
  VALUES (v_produto_id, v_loja_id, 9, 0, 0);

  INSERT INTO public.vendas (id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES (v_venda_id, v_caixa_id, v_uid, 20, 0, 20, 'DINHEIRO', 'CONCLUIDA');
  INSERT INTO public.itens_venda (id, venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco)
  VALUES (gen_random_uuid(), v_venda_id, v_produto_id, 2, 10, 10, 0, 'MANUAL');

  SELECT * INTO v_res FROM public.cancelar_venda_transacional(v_venda_id, 'smoke T5', v_uid);
  IF v_res.status_venda IS DISTINCT FROM 'CANCELADA' THEN
    RAISE EXCEPTION 'SMOKE_T5 FALHOU: cancelamento não retornou CANCELADA (veio %)', v_res.status_venda;
  END IF;

  SELECT count(*), COALESCE(SUM(quantidade_delta), 0)
  INTO v_qtd_linhas_kardex, v_soma_kardex
  FROM public.v_kardex_unificado
  WHERE referencia_id = v_venda_id AND produto_id = v_produto_id AND quantidade_delta > 0;

  IF v_qtd_linhas_kardex <> 1 THEN
    RAISE EXCEPTION 'SMOKE_T5 FALHOU: kardex mostra % movimento(s) de entrada para o cancelamento, esperado 1', v_qtd_linhas_kardex;
  END IF;
  IF v_soma_kardex <> 2 THEN
    RAISE EXCEPTION 'SMOKE_T5 FALHOU: soma do kardex para o cancelamento = %, esperado 2', v_soma_kardex;
  END IF;

  RAISE NOTICE 'SMOKE_T5_OK: cancelamento de 2 un. gera exatamente 1 movimento de entrada (%), vinculado à venda.', v_soma_kardex;
END $$;

ROLLBACK;
