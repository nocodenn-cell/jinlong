-- Política de quantidade comercial da NF-e (20261030140000_nfe_qtd_precisao).
--
-- Verifica:
--   Q1  qCom que zera no estoque (0,0004) é recusado com IMPORT_NFE_QTD_PRECISAO (sem CHECK opaco);
--   Q2  qCom com mais de 3 casas na unidade de estoque (1,0004) é recusado (sem arredondamento);
--   Q3  qCom que cabe exatamente após o fator (0,0005 × 2000 = 1,000) é aceito;
--   Q4  qCom e uCom são preservados no item;
--   Q5  parcial sobre quantidade exata segue a regra documental (AP proporcional correta).
--
-- Transacional: BEGIN ... ROLLBACK. Dados sintéticos na FIXTURE-S1 (loja A, gerente A).

\set ON_ERROR_STOP on
BEGIN;

-- Fixture própria desta transação (o CI não tem empresa, loja nem gerente pré-existentes).
INSERT INTO auth.users (id) VALUES ('f5100000-0000-4000-8000-000000000002') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.empresas (id, nome, status) VALUES ('f5100000-0000-4000-8000-0000000000e1', 'FIXTURE-S1 Empresa 1', 'ATIVA') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.lojas (id, nome, codigo, ativo, empresa_id) VALUES ('f5100000-0000-4000-8000-0000000000a1', 'FIXTURE-S1 Loja A', 'FS1-A', true, 'f5100000-0000-4000-8000-0000000000e1') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES ('f5100000-0000-4000-8000-000000000002', 'FIXTURE-S1 Gerente A', 'GERENTE', true, 'f5100000-0000-4000-8000-0000000000a1') ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;
DO $t$
DECLARE
  v_loja uuid := 'f5100000-0000-4000-8000-0000000000a1';
  v_gerente uuid := 'f5100000-0000-4000-8000-000000000002';
  v_res jsonb;
  v_imp uuid;
  v_it uuid;
  v_ap numeric;
  v_qc numeric;
  v_un text;
  v_recusou boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  -- Q1
  v_recusou := false;
  BEGIN
    PERFORM public.importar_nfe_transacao(
      p_chave_acesso => '35260800000000000000550090000000171000000019', p_numero_nf => 'QTD-Q1',
      p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'QTD FORN', p_loja_id => v_loja,
      p_itens => jsonb_build_array(jsonb_build_object('nome_produto','QTD Q1','gtin',null,'ref_fornecedor','QTD-Q1','ncm',null,'u_com','KG','q_com',0.0004,'v_un_com',1000.00,'v_prod',0.40,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
      p_atualizar_custo => true,
      p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',0.40)));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_QTD_PRECISAO' THEN v_recusou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_recusou THEN RAISE EXCEPTION 'Q1 falhou: qCom 0,0004 deveria ser recusado com IMPORT_NFE_QTD_PRECISAO'; END IF;
  RAISE NOTICE 'Q1 OK';

  -- Q2
  v_recusou := false;
  BEGIN
    PERFORM public.importar_nfe_transacao(
      p_chave_acesso => '35260800000000000000550090000000181000000019', p_numero_nf => 'QTD-Q2',
      p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'QTD FORN', p_loja_id => v_loja,
      p_itens => jsonb_build_array(jsonb_build_object('nome_produto','QTD Q2','gtin',null,'ref_fornecedor','QTD-Q2','ncm',null,'u_com','KG','q_com',1.0004,'v_un_com',1000.00,'v_prod',1000.40,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
      p_atualizar_custo => true,
      p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',1000.40)));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_QTD_PRECISAO' THEN v_recusou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_recusou THEN RAISE EXCEPTION 'Q2 falhou: qCom 1,0004 deveria ser recusado'; END IF;
  RAISE NOTICE 'Q2 OK';

  -- Q3 + Q4: qCom 0,0005 × fator 2000 = 1,000 (exato), preserva qCom e uCom
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000201000000019', p_numero_nf => 'QTD-Q3',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'QTD FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','QTD Q3','gtin',null,'ref_fornecedor','QTD-Q3','ncm',null,'u_com','CX','q_com',0.0005,'v_un_com',2000.00,'v_prod',1.00,'fator',2000,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',1.00)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id, quantidade_comercial_documento, unidade_comercial INTO v_it, v_qc, v_un FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  IF v_qc <> 0.0005 OR v_un <> 'CX' THEN RAISE EXCEPTION 'Q4 falhou: qCom %, uCom % (esperado 0,0005 e CX)', v_qc, v_un; END IF;
  RAISE NOTICE 'Q3/Q4 OK: qCom 0,0005 x fator 2000 aceito e preservado';

  -- Q5: parcial 0,5 de qCom 1,000 x 1000,00 => exigível 500,00
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000211000000019', p_numero_nf => 'QTD-Q5',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'QTD FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','QTD Q5','gtin',null,'ref_fornecedor','QTD-Q5','ncm',null,'u_com','KG','q_com',1.000,'v_un_com',1000.00,'v_prod',1000.00,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',500.00)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 0.500, 'divergencia_obs', 'parcial')));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT coalesce(sum(valor_total), 0) INTO v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF v_ap <> 500.00 THEN RAISE EXCEPTION 'Q5 falhou: AP % (esperado 500,00)', v_ap; END IF;
  RAISE NOTICE 'Q5 OK';
END
$t$;

ROLLBACK;
