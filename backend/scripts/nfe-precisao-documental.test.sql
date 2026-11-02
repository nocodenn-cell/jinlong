-- Precisão documental da conciliação da NF-e (20261030130000_nfe_precisao_documental).
--
-- Prova que a conciliação:
--   (a) NÃO produz divergência artificial quando o valor documental (vProd) está correto;
--   (b) continua recusando divergência real (valor errado nas duplicatas);
--   (c) usa a regra documental com quantidade parcial, fator de conversão e itens sem dado documental.
--
-- Caso de origem: 7 × vUnCom 3,335 com vProd 23,35. Antes: exigível 23,38 (custo gravado 3,34) ⇒ recusava.
--
-- Transacional: BEGIN ... ROLLBACK. Dados sintéticos na FIXTURE-S1 (loja A, gerente A).
-- Execução local: docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -v ON_ERROR_STOP=1 < este arquivo

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
  v_apn int;
  v_ap numeric;
  v_exig numeric;
  v_falhou boolean;
  v_msg text;

  -- Importa uma NF de item único; devolve a importação.
  -- Parâmetros: chave, qCom, vUnCom, vProd (NULL = não informado), duplicata.
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  -- P1 — caso de origem, conferido = nominal, vProd 23,35, duplicata 23,35: ACEITA (sem divergência artificial)
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000081000000019', p_numero_nf => 'PRC-P1',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'PRC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','PRC P1','gtin',null,'ref_fornecedor','PRC-P1','ncm',null,'u_com','UN','q_com',7,'v_un_com',3.335,'v_prod',23.35,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',23.35)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 7, 'divergencia_obs', null)));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT count(*), coalesce(sum(valor_total), 0) INTO v_apn, v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF v_apn <> 1 OR v_ap <> 23.35 THEN RAISE EXCEPTION 'PRC P1 falhou: AP % de % (esperado 1 de 23,35)', v_apn, v_ap; END IF;
  RAISE NOTICE 'PRC P1 OK: 7 x 3,335 com vProd 23,35 aceito (sem divergência artificial)';

  -- P2 — mesma NF, duplicata 23,38 (valor do custo gravado): divergência REAL frente ao documento ⇒ RECUSA
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000091000000019', p_numero_nf => 'PRC-P2',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'PRC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','PRC P2','gtin',null,'ref_fornecedor','PRC-P2','ncm',null,'u_com','UN','q_com',7,'v_un_com',3.335,'v_prod',23.35,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',23.38)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 7, 'divergencia_obs', null)));
  v_falhou := false;
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'IMPORT_NFE_DUPLICATAS_DIVERGENTES%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  SELECT count(*) INTO v_apn FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF NOT v_falhou OR v_apn <> 0 THEN RAISE EXCEPTION 'PRC P2 falhou: divergência real aceita (AP=%)', v_apn; END IF;
  RAISE NOTICE 'PRC P2 OK: duplicata 23,38 recusada (divergência real frente ao documento 23,35)';

  -- P3 — conferido parcial 6 de 7 (sem vProd válido para o conferido): exigível = ROUND(6 / 1 × 3,335, 2) = 20,01
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000101000000019', p_numero_nf => 'PRC-P3',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'PRC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','PRC P3','gtin',null,'ref_fornecedor','PRC-P3','ncm',null,'u_com','UN','q_com',7,'v_un_com',3.335,'v_prod',23.35,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',20.01)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 6, 'divergencia_obs', 'recebimento parcial')));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT coalesce(sum(valor_total), 0) INTO v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF v_ap <> 20.01 THEN RAISE EXCEPTION 'PRC P3 falhou: AP % (esperado 20,01)', v_ap; END IF;
  RAISE NOTICE 'PRC P3 OK: parcial 6/7 usa a regra por unidade (20,01), não o vProd integral';

  -- P4 — parcial com duplicata do documento inteiro (23,35): RECUSA (sem redução implícita, sem quitação)
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000111000000019', p_numero_nf => 'PRC-P4',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'PRC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','PRC P4','gtin',null,'ref_fornecedor','PRC-P4','ncm',null,'u_com','UN','q_com',7,'v_un_com',3.335,'v_prod',23.35,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',23.35)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 6, 'divergencia_obs', 'recebimento parcial')));
  v_falhou := false;
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'IMPORT_NFE_DUPLICATAS_DIVERGENTES%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'PRC P4 falhou: parcial aceito com duplicata do documento inteiro'; END IF;
  RAISE NOTICE 'PRC P4 OK: parcial não quita o documento inteiro';

  -- P5 — fator de conversão 12: 2 caixas (qCom) a 36,00 cada; conferido 24 unidades ⇒ vProd 72,00
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000121000000019', p_numero_nf => 'PRC-P5',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'PRC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','PRC P5','gtin',null,'ref_fornecedor','PRC-P5','ncm',null,'u_com','CX','q_com',2,'v_un_com',36.00,'v_prod',72.00,'fator',12,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',72.00)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 24, 'divergencia_obs', null)));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT coalesce(sum(valor_total), 0) INTO v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF v_ap <> 72.00 THEN RAISE EXCEPTION 'PRC P5 falhou: AP % (esperado 72,00)', v_ap; END IF;
  RAISE NOTICE 'PRC P5 OK: fator 12 com vProd 72,00 aceito';

  -- P6 — mesmo caso fator 12, conferido 20 unidades: 20/12 × 36,00 = 60,00
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000131000000019', p_numero_nf => 'PRC-P6',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'PRC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','PRC P6','gtin',null,'ref_fornecedor','PRC-P6','ncm',null,'u_com','CX','q_com',2,'v_un_com',36.00,'v_prod',72.00,'fator',12,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',60.00)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 20, 'divergencia_obs', 'recebimento parcial')));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT coalesce(sum(valor_total), 0) INTO v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF v_ap <> 60.00 THEN RAISE EXCEPTION 'PRC P6 falhou: AP % (esperado 60,00)', v_ap; END IF;
  RAISE NOTICE 'PRC P6 OK: fator 12, parcial 20 unidades = 60,00';

  -- P7 — item sem dado documental (legado): cai no custo gravado (7 × 3,34 = 23,38)
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000141000000019', p_numero_nf => 'PRC-P7',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'PRC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','PRC P7','gtin',null,'ref_fornecedor','PRC-P7','ncm',null,'u_com','UN','q_com',7,'v_un_com',3.335,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',23.38)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  UPDATE public.importacoes_nfe_itens SET valor_unitario_documento = NULL, valor_total_documento = NULL WHERE id = v_it;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 7, 'divergencia_obs', null)));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT coalesce(sum(valor_total), 0) INTO v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF v_ap <> 23.38 THEN RAISE EXCEPTION 'PRC P7 falhou: AP % (esperado 23,38 pelo legado)', v_ap; END IF;
  RAISE NOTICE 'PRC P7 OK: legado sem dado documental usa o custo gravado (regra c)';

  -- P8 — limite da tolerância: diferença de R$ 0,02 ⇒ recusa (tolerância é 0,01)
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000151000000019', p_numero_nf => 'PRC-P8',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'PRC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','PRC P8','gtin',null,'ref_fornecedor','PRC-P8','ncm',null,'u_com','UN','q_com',7,'v_un_com',3.335,'v_prod',23.35,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',23.33)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 7, 'divergencia_obs', null)));
  v_falhou := false;
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'IMPORT_NFE_DUPLICATAS_DIVERGENTES%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'PRC P8 falhou: diferença de 0,02 aceita'; END IF;
  RAISE NOTICE 'PRC P8 OK: diferença de 0,02 recusada (tolerância 0,01)';
END
$t$;

ROLLBACK;
