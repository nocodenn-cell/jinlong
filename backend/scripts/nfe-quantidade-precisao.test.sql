-- Quantidade com mais de três casas decimais na NF-e (qCom).
--
-- Fatos verificados antes deste teste:
--   * O parser lê qCom como number (sem truncamento).
--   * importar_nfe_transacao grava quantidade_nfe = qCom × fator em numeric(10,3). O Postgres
--     ARREDONDA (meio para cima) ao atribuir: 0,0004 vira 0,000; 1,0005 vira 1,001.
--   * A quantidade conferida é digitada pelo operador, também em numeric(10,3).
--   * A regra documental (20261030130000) usa vProd quando a quantidade conferida é igual à
--     quantidade GRAVADA (quantidade_nfe). Logo, o arredondamento de estoque pode acabar
--     contando, na conciliação, um valor documental de uma quantidade que não entrou no estoque.
--
-- Estes cenários demonstram o comportamento ATUAL (inclui defeito). Não corrigem nada.
-- Transacional: BEGIN ... ROLLBACK. Dados sintéticos na FIXTURE-S1 (loja A, gerente A).

\set ON_ERROR_STOP on
BEGIN;

DO $t$
DECLARE
  v_loja uuid := 'f5100000-0000-4000-8000-0000000000a1';
  v_gerente uuid := 'f5100000-0000-4000-8000-000000000002';
  v_res jsonb;
  v_imp uuid;
  v_it uuid;
  v_qtd_gravada numeric;
  v_estoque numeric;
  v_ap numeric;
  v_apn int;
  v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  -- Q1: qCom 0,0004 x vUnCom 1000,00 (vProd 0,40). A quantidade gravada arredonda para 0,000.
  BEGIN
    v_res := public.importar_nfe_transacao(
      p_chave_acesso => '35260800000000000000550090000000171000000019', p_numero_nf => 'QTD-Q1',
      p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'QTD FORN', p_loja_id => v_loja,
      p_itens => jsonb_build_array(jsonb_build_object('nome_produto','QTD Q1','gtin',null,'ref_fornecedor','QTD-Q1','ncm',null,'u_com','KG','q_com',0.0004,'v_un_com',1000.00,'v_prod',0.40,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
      p_atualizar_custo => true,
      p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',0.40)));
    v_imp := (v_res->>'importacao_id')::uuid;
    SELECT id, quantidade_nfe INTO v_it, v_qtd_gravada FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
    RAISE NOTICE 'Q1 quantidade gravada para qCom 0,0004: %', v_qtd_gravada;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Q1 RESULTADO: importação recusada com % (recusa explícita, sem estoque)', SQLERRM;
    v_imp := NULL;
  END;
  IF v_imp IS NULL THEN
    RAISE NOTICE 'Q1 conclusão: qCom 0,0004 é recusado pelo CHECK quantidade_nfe > 0 do banco';
  ELSE
  BEGIN
    PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 0, 'divergencia_obs', null)));
    PERFORM public.confirmar_importacao_nfe(v_imp);
    SELECT coalesce(sum(valor_total), 0) INTO v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
    RAISE NOTICE 'Q1 RESULTADO: confirmada; AP=% para item com quantidade 0 (DEFEITO se AP > 0 sem estoque)', v_ap;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Q1 RESULTADO: recusada com % (ok se a recusa for explícita)', SQLERRM;
  END;
  END IF;

  -- Q2: qCom 1,0004 × vUnCom 1000,00 (vProd 1000,40). Quantidade gravada = 1,000 (-0,0004 em estoque).
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000181000000019', p_numero_nf => 'QTD-Q2',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'QTD FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','QTD Q2','gtin',null,'ref_fornecedor','QTD-Q2','ncm',null,'u_com','KG','q_com',1.0004,'v_un_com',1000.00,'v_prod',1000.40,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',1000.40)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id, quantidade_nfe INTO v_it, v_qtd_gravada FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 1.000, 'divergencia_obs', null)));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT quantidade_atual INTO v_estoque FROM public.estoque e JOIN public.importacoes_nfe_itens i ON i.produto_id = e.produto_id
   WHERE i.id = v_it AND e.loja_id = v_loja;
  SELECT coalesce(sum(valor_total), 0) INTO v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  RAISE NOTICE 'Q2 RESULTADO: qCom 1,0004 => estoque %, quantidade gravada %, AP % (diferença de quantidade = 0,0004 sem contrapartida no estoque)', v_estoque, v_qtd_gravada, v_ap;

  -- Q3: parcial com quantidade conferida 0,500 de uma NF de 1,0004 x 1000,00 (exigível 500,00)
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000191000000019', p_numero_nf => 'QTD-Q3',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'QTD FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','QTD Q3','gtin',null,'ref_fornecedor','QTD-Q3','ncm',null,'u_com','KG','q_com',1.0004,'v_un_com',1000.00,'v_prod',1000.40,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',500.00)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 0.500, 'divergencia_obs', 'parcial')));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT coalesce(sum(valor_total), 0) INTO v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  RAISE NOTICE 'Q3 RESULTADO: parcial 0,500 de 1,0004 x 1000 => AP % (esperado 500,00)', v_ap;
END
$t$;

ROLLBACK;
