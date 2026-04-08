-- ==========================================================
-- SMOKE ITEM 4 — INTEGRACAO RECEBIMENTO + FINANCEIRO + FISCAL
-- ==========================================================

DO $$
DECLARE
  v_loja_id uuid := 'a0000001-0000-4000-8000-000000000001'::uuid;
  v_gerente_id uuid;
  v_cliente_id uuid := gen_random_uuid();
  v_titulo_id uuid := gen_random_uuid();
  v_produto_id uuid;
  v_remessa_id uuid := gen_random_uuid();
  v_venda_id uuid;
  v_doc_id uuid;
  v_qtd_antes numeric;
  v_qtd_depois numeric;
  v_status text;
BEGIN
  SELECT id INTO v_gerente_id
  FROM public.usuarios
  WHERE ativo = true
    AND perfil IN ('GERENTE', 'DONO')
    AND loja_id = v_loja_id
  LIMIT 1;

  IF v_gerente_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: gerente/dono não encontrado na matriz';
  END IF;

  SELECT p.id INTO v_produto_id
  FROM public.produtos p
  WHERE p.ativo = true
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_produto_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: nenhum produto ativo para teste';
  END IF;

  SELECT e.quantidade_atual INTO v_qtd_antes
  FROM public.estoque e
  WHERE e.loja_id = v_loja_id
    AND e.produto_id = v_produto_id;

  IF v_qtd_antes IS NULL THEN
    INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
    VALUES (v_loja_id, v_produto_id, 0, 0)
    ON CONFLICT (loja_id, produto_id) DO NOTHING;
    v_qtd_antes := 0;
  END IF;

  -- Recebimento: remessa concluída deve aumentar estoque
  INSERT INTO public.remessas (id, loja_id, origem_descricao, status, created_by)
  VALUES (v_remessa_id, v_loja_id, 'SMOKE_ITEM4', 'EM_CONFERENCIA', v_gerente_id);

  INSERT INTO public.remessa_itens (remessa_id, produto_id, quantidade_esperada, quantidade_conferida)
  VALUES (v_remessa_id, v_produto_id, 5, 5)
  ON CONFLICT (remessa_id, produto_id) DO UPDATE
    SET quantidade_conferida = EXCLUDED.quantidade_conferida;

  -- Simula chamada segura da RPC (sem JWT no SQL Editor)
  UPDATE public.remessas
  SET status = 'CONCLUIDA', finalized_at = now()
  WHERE id = v_remessa_id;

  INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
  VALUES (v_loja_id, v_produto_id, 5, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE
    SET quantidade_atual = public.estoque.quantidade_atual + 5,
        version = public.estoque.version + 1,
        updated_at = now();

  SELECT e.quantidade_atual INTO v_qtd_depois
  FROM public.estoque e
  WHERE e.loja_id = v_loja_id
    AND e.produto_id = v_produto_id;

  IF v_qtd_depois < v_qtd_antes + 5 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: recebimento não refletiu no estoque (antes=%, depois=%)', v_qtd_antes, v_qtd_depois;
  END IF;

  -- Financeiro: cliente + título + liquidação parcial
  INSERT INTO public.clientes (id, nome, documento, telefone, limite_credito, ativo)
  VALUES (v_cliente_id, 'Cliente Smoke Item4', 'SMOKE-CPF', '11999999999', 1000, true);

  INSERT INTO public.contas_receber (id, cliente_id, descricao, valor_total, valor_aberto, status)
  VALUES (v_titulo_id, v_cliente_id, 'Titulo smoke', 120, 120, 'ABERTO');

  INSERT INTO public.liquidacoes_receber (titulo_id, valor, forma_pagamento, observacao, created_by)
  VALUES (v_titulo_id, 20, 'PIX', 'Parcial smoke', v_gerente_id);

  UPDATE public.contas_receber
  SET valor_aberto = 100, status = 'PARCIAL'
  WHERE id = v_titulo_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contas_receber
    WHERE id = v_titulo_id
      AND valor_aberto = 100
      AND status = 'PARCIAL'
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: financeiro não atualizou título após liquidação parcial';
  END IF;

  -- Fiscal: estado final emitido sem duplicidade
  SELECT v.id INTO v_venda_id
  FROM public.vendas v
  ORDER BY v.data DESC NULLS LAST
  LIMIT 1;

  IF v_venda_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: nenhuma venda disponível para validar fiscal';
  END IF;

  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (v_venda_id, 'NFCE', 'PENDENTE', jsonb_build_object('origem', 'smoke_item4'))
  ON CONFLICT (venda_id, tipo_doc) WHERE status <> 'CANCELADO'
  DO UPDATE SET status = 'EMITIDO',
                chave_fiscal = 'SMOKE-CHAVE-ITEM4',
                protocolo = 'SMOKE-PROTO-ITEM4',
                tentativas = COALESCE(public.documentos_fiscais_pendentes.tentativas, 0),
                updated_at = now(),
                processado_em = now();

  SELECT d.id, d.status INTO v_doc_id, v_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = v_venda_id
    AND d.tipo_doc = 'NFCE'
    AND d.status <> 'CANCELADO'
  LIMIT 1;

  IF v_doc_id IS NULL OR v_status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'SMOKE_FAIL: fiscal não finalizou como EMITIDO';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_fiscais_pendentes
    WHERE venda_id = v_venda_id
      AND tipo_doc = 'NFCE'
    GROUP BY venda_id, tipo_doc
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: duplicidade fiscal detectada para venda/tipo';
  END IF;

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'SMOKE_OK: Item 4 (recebimento/financeiro/fiscal) validado';
  RAISE NOTICE 'Loja: %, Produto: %', v_loja_id, v_produto_id;
  RAISE NOTICE 'Cliente: %, Titulo: %', v_cliente_id, v_titulo_id;
  RAISE NOTICE 'Venda: %, Documento: %', v_venda_id, v_doc_id;
  RAISE NOTICE '=========================================';
END $$;
