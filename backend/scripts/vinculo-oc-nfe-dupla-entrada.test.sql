-- Prova a guarda de dupla entrada OC <-> NF-e
-- (migration 20260911140000_vinculo_oc_nfe_guarda_dupla_entrada.sql).
--
-- Cenarios provados:
--   A. Ordem recebida primeiro -> confirmar a NF-e vinculada e RECUSADO.
--   B. NF-e confirmada primeiro -> receber a ordem vinculada e RECUSADO,
--      e a ordem ja foi encerrada como RECEBIDA pela confirmacao da nota.
--   C. Ordem com nota vinculada nao gera titulo proprio (o financeiro segue as
--      duplicatas da nota, sem duplicar a divida).
--   D. Uma ordem nao aceita duas notas vinculadas.
--
-- Dados sinteticos, tudo dentro de uma transacao com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja    uuid := 'e4000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e4000002-0000-4000-8000-000000000001';
  v_forn    uuid := 'e4000003-0000-4000-8000-000000000001';
  v_prod    uuid := 'e4000004-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'DUPE Loja', 'DUPE-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'DUPE Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.fornecedores (id, loja_id, nome, cnpj)
  VALUES (v_forn, v_loja, 'Fornecedor DUPE', '11222333000144')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, loja_id, nome, preco_varejo, preco_custo, ativo, origem, codigo_barras)
  VALUES (v_prod, v_loja, 'Produto DUPE', 100.00, 10.00, true, 'china_manual', '7890000004444')
  ON CONFLICT (id) DO UPDATE SET ativo = true;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- A. Ordem recebida primeiro: a NF-e vinculada nao pode creditar de novo.
-- ═══════════════════════════════════════════════════════════════════════════
DO $casoA$
DECLARE
  v_loja    uuid := 'e4000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e4000002-0000-4000-8000-000000000001';
  v_forn    uuid := 'e4000003-0000-4000-8000-000000000001';
  v_prod    uuid := 'e4000004-0000-4000-8000-000000000001';
  v_oc      uuid := 'e4000010-0000-4000-8000-000000000001';
  v_item    uuid := 'e4000011-0000-4000-8000-000000000001';
  v_imp     uuid;
  v_impitem uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  INSERT INTO public.ordens_compra (id, loja_id, fornecedor_id, status, data_emissao, data_vencimento, created_by)
  VALUES (v_oc, v_loja, v_forn, 'EM_TRANSITO', CURRENT_DATE, DATE '2026-12-01', v_gerente);
  INSERT INTO public.ordens_compra_itens (id, ordem_id, produto_id, quantidade, preco_unitario, unidade_medida)
  VALUES (v_item, v_oc, v_prod, 6, 10.00, 'UN');

  PERFORM public.importar_nfe_transacao(
    p_chave_acesso    => '35260900000000000000550010000000441000000441',
    p_numero_nf       => '44001',
    p_fornecedor_cnpj => '11222333000144',
    p_fornecedor_nome => 'Fornecedor DUPE',
    p_loja_id         => v_loja,
    p_itens           => jsonb_build_array(jsonb_build_object(
      'nome_produto','Produto DUPE','gtin','7890000004444','ref_fornecedor','DUPE-1',
      'ncm','39269090','u_com','UN','q_com',6,'v_un_com',10.00,'fator',1,
      'atualizar_custo',false,'acao','VINCULAR','produto_id_destino', v_prod)),
    p_atualizar_custo => false,
    p_duplicatas      => jsonb_build_array(
      jsonb_build_object('numero','1','data_vencimento','2026-12-01','valor',60.00))
  );

  SELECT id INTO v_imp FROM public.importacoes_nfe
   WHERE chave_acesso = '35260900000000000000550010000000441000000441';

  PERFORM public.vincular_importacao_nfe_ordem_compra(v_imp, v_oc);

  -- Recebe a ordem primeiro.
  PERFORM public.registrar_conferencia_ordem_compra(
    v_oc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantidade_conferida', 6)));
  PERFORM public.receber_ordem_compra(v_oc);

  -- Caso C: com nota vinculada, a ordem NAO gera titulo proprio.
  IF EXISTS (SELECT 1 FROM public.contas_pagar WHERE ordem_compra_id = v_oc) THEN
    RAISE EXCEPTION 'FALHA: ordem com nota vinculada gerou titulo proprio (divida duplicada).';
  END IF;
  RAISE NOTICE 'OK (C): ordem com NF-e vinculada nao gera titulo proprio.';

  -- Agora a nota nao pode mais creditar.
  SELECT id INTO v_impitem FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp LIMIT 1;
  PERFORM public.registrar_conferencia_nfe(
    v_imp, jsonb_build_array(jsonb_build_object(
      'item_id', v_impitem, 'quantidade_conferida', 6, 'divergencia_obs', NULL)));

  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp);
    RAISE EXCEPTION 'FALHA: NF-e creditou estoque de ordem ja recebida.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%IMPORT_NFE_OC_JA_RECEBIDA%' THEN RAISE; END IF;
      RAISE NOTICE 'OK (A): NF-e de ordem ja recebida foi recusada.';
  END;
END
$casoA$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B. NF-e confirmada primeiro: a ordem vinculada nao pode receber de novo.
-- ═══════════════════════════════════════════════════════════════════════════
DO $casoB$
DECLARE
  v_loja    uuid := 'e4000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e4000002-0000-4000-8000-000000000001';
  v_prod    uuid := 'e4000004-0000-4000-8000-000000000001';
  v_forn    uuid := 'e4000003-0000-4000-8000-000000000001';
  v_oc      uuid := 'e4000020-0000-4000-8000-000000000001';
  v_item    uuid := 'e4000021-0000-4000-8000-000000000001';
  v_imp     uuid;
  v_impitem uuid;
  v_delta   numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  INSERT INTO public.ordens_compra (id, loja_id, fornecedor_id, status, data_emissao, data_vencimento, created_by)
  VALUES (v_oc, v_loja, v_forn, 'EM_TRANSITO', CURRENT_DATE, DATE '2026-12-05', v_gerente);
  INSERT INTO public.ordens_compra_itens (id, ordem_id, produto_id, quantidade, preco_unitario, unidade_medida)
  VALUES (v_item, v_oc, v_prod, 4, 10.00, 'UN');

  PERFORM public.importar_nfe_transacao(
    p_chave_acesso    => '35260900000000000000550010000000551000000551',
    p_numero_nf       => '55002',
    p_fornecedor_cnpj => '11222333000144',
    p_fornecedor_nome => 'Fornecedor DUPE',
    p_loja_id         => v_loja,
    p_itens           => jsonb_build_array(jsonb_build_object(
      'nome_produto','Produto DUPE','gtin','7890000004444','ref_fornecedor','DUPE-1',
      'ncm','39269090','u_com','UN','q_com',4,'v_un_com',10.00,'fator',1,
      'atualizar_custo',false,'acao','VINCULAR','produto_id_destino', v_prod)),
    p_atualizar_custo => false,
    p_duplicatas      => jsonb_build_array(
      jsonb_build_object('numero','1','data_vencimento','2026-12-05','valor',40.00))
  );

  SELECT id INTO v_imp FROM public.importacoes_nfe
   WHERE chave_acesso = '35260900000000000000550010000000551000000551';
  PERFORM public.vincular_importacao_nfe_ordem_compra(v_imp, v_oc);

  -- Conferencia fisica da ordem feita ANTES da nota: o operador ja tinha
  -- contado a mercadoria quando a nota chegou. E o pior caso para a guarda.
  PERFORM public.registrar_conferencia_ordem_compra(
    v_oc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantidade_conferida', 4)));

  SELECT id INTO v_impitem FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp LIMIT 1;
  PERFORM public.registrar_conferencia_nfe(
    v_imp, jsonb_build_array(jsonb_build_object(
      'item_id', v_impitem, 'quantidade_conferida', 4, 'divergencia_obs', NULL)));
  PERFORM public.confirmar_importacao_nfe(v_imp);

  -- A confirmacao da nota encerrou a ordem.
  IF (SELECT status FROM public.ordens_compra WHERE id = v_oc) <> 'RECEBIDA' THEN
    RAISE EXCEPTION 'FALHA: confirmar a nota vinculada nao encerrou a ordem.';
  END IF;

  BEGIN
    PERFORM public.receber_ordem_compra(v_oc);
    RAISE EXCEPTION 'FALHA: ordem recebeu estoque ja creditado pela NF-e.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%OC_STATUS_INVALIDO%' AND SQLERRM NOT LIKE '%OC_NFE_JA_CREDITADA%' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'OK (B): ordem de NF-e ja creditada foi recusada (%).', SQLERRM;
  END;

  -- Credito unico: 4 unidades, nao 8.
  SELECT COALESCE(sum(quantidade_delta), 0) INTO v_delta
    FROM public.movimentos_estoque_log
   WHERE produto_id = v_prod
     AND (observacao LIKE '%' || v_oc::text || '%' OR observacao LIKE '%' || v_imp::text || '%');

  IF v_delta <> 4 THEN
    RAISE EXCEPTION 'FALHA: mercadoria creditada % vezes a quantidade (delta=%).', v_delta / 4, v_delta;
  END IF;
  RAISE NOTICE 'OK (B): kardex com credito unico de +4 para a mesma compra.';
END
$casoB$;

-- ═══════════════════════════════════════════════════════════════════════════
-- D. Uma ordem nao aceita duas notas vinculadas.
-- ═══════════════════════════════════════════════════════════════════════════
DO $casoD$
DECLARE
  v_loja    uuid := 'e4000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e4000002-0000-4000-8000-000000000001';
  v_prod    uuid := 'e4000004-0000-4000-8000-000000000001';
  v_forn    uuid := 'e4000003-0000-4000-8000-000000000001';
  v_oc      uuid := 'e4000030-0000-4000-8000-000000000001';
  v_item    uuid := 'e4000031-0000-4000-8000-000000000001';
  v_imp1    uuid;
  v_imp2    uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  INSERT INTO public.ordens_compra (id, loja_id, fornecedor_id, status, data_emissao, created_by)
  VALUES (v_oc, v_loja, v_forn, 'EM_TRANSITO', CURRENT_DATE, v_gerente);
  INSERT INTO public.ordens_compra_itens (id, ordem_id, produto_id, quantidade, preco_unitario, unidade_medida)
  VALUES (v_item, v_oc, v_prod, 2, 10.00, 'UN');

  PERFORM public.importar_nfe_transacao(
    p_chave_acesso    => '35260900000000000000550010000000661000000661',
    p_numero_nf       => '66003', p_fornecedor_cnpj => '11222333000144',
    p_fornecedor_nome => 'Fornecedor DUPE', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object(
      'nome_produto','Produto DUPE','gtin','7890000004444','ref_fornecedor','DUPE-1',
      'ncm','39269090','u_com','UN','q_com',2,'v_un_com',10.00,'fator',1,
      'atualizar_custo',false,'acao','VINCULAR','produto_id_destino', v_prod)),
    p_atualizar_custo => false, p_duplicatas => NULL);
  PERFORM public.importar_nfe_transacao(
    p_chave_acesso    => '35260900000000000000550010000000771000000771',
    p_numero_nf       => '77004', p_fornecedor_cnpj => '11222333000144',
    p_fornecedor_nome => 'Fornecedor DUPE', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object(
      'nome_produto','Produto DUPE','gtin','7890000004444','ref_fornecedor','DUPE-1',
      'ncm','39269090','u_com','UN','q_com',2,'v_un_com',10.00,'fator',1,
      'atualizar_custo',false,'acao','VINCULAR','produto_id_destino', v_prod)),
    p_atualizar_custo => false, p_duplicatas => NULL);

  SELECT id INTO v_imp1 FROM public.importacoes_nfe
   WHERE chave_acesso = '35260900000000000000550010000000661000000661';
  SELECT id INTO v_imp2 FROM public.importacoes_nfe
   WHERE chave_acesso = '35260900000000000000550010000000771000000771';

  PERFORM public.vincular_importacao_nfe_ordem_compra(v_imp1, v_oc);

  BEGIN
    PERFORM public.vincular_importacao_nfe_ordem_compra(v_imp2, v_oc);
    RAISE EXCEPTION 'FALHA: duas notas foram vinculadas a mesma ordem.';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'OK (D): indice unico impediu segunda nota na mesma ordem.';
  END;
END
$casoD$;

ROLLBACK;
