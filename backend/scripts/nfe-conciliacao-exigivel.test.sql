-- Limites da conciliação financeira da NF-e (contrato SSOT-003 + 20261030120000).
--
-- Valor exigível = Σ(quantidade_conferida × custo_unitario), sem arredondamento.
-- Duplicatas devem somar o exigível com tolerância de R$ 0,01.
--
-- Cenários:
--   T1  arredondamento do custo unitário gravado (ROUND 2 no import): divergência
--       falsa. Documentado, não corrigido nesta sprint (ver relatório).
--   T2  recebimento parcial com duplicata do documento: recusado (sem redução implícita).
--   T3  recebimento parcial com duplicata igual ao conferido: aceito (redução explícita).
--   T4  duplicatas que batem exatamente com o exigível: aceito, AP = soma.
--
-- Transacional: tudo em BEGIN ... ROLLBACK. Dados sintéticos na FIXTURE-S1 (loja A).

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
  v_falhou boolean;
  v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  -- T1: 7 x 3,335 => custo gravado 3,34 (exigível 23,38), documento 23,345 (duplicata 23,35).
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000041000000019', p_numero_nf => 'CNC-T1',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'CNC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','CNC T1','gtin',null,'ref_fornecedor','CNC-T1','ncm',null,'u_com','UN','q_com',7,'v_un_com',3.335,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',23.35)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 7, 'divergencia_obs', null)));
  v_falhou := false;
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_DUPLICATAS_DIVERGENTES' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  -- Resultado esperado HOJE: recusado (limite conhecido). Se algum dia aceito, revisar a tolerância.
  -- Com a regra documental (20261030130000) o exigível por unidade é ROUND(3,335 × 7, 2) = 23,35:
  -- a divergência artificial desaparece e a duplicata 23,35 é aceita. Ver nfe-precisao-documental.test.sql.
  IF v_falhou THEN RAISE EXCEPTION 'CNC T1: divergência artificial voltou (arredondamento do custo)'; END IF;
  RAISE NOTICE 'CNC T1 OK (sem divergência artificial)';

  -- T2: parcial 6 de 10 com duplicata do documento (100): deve recusar, AP inexistente.
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000051000000019', p_numero_nf => 'CNC-T2',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'CNC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','CNC T2','gtin',null,'ref_fornecedor','CNC-T2','ncm',null,'u_com','UN','q_com',10,'v_un_com',10.00,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',100)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 6, 'divergencia_obs', 'recebimento parcial')));
  v_falhou := false;
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_DUPLICATAS_DIVERGENTES' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  SELECT count(*) INTO v_apn FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF NOT v_falhou OR v_apn <> 0 THEN RAISE EXCEPTION 'CNC T2: parcial com duplicata do documento deveria ser recusado sem AP (AP=%)', v_apn; END IF;
  RAISE NOTICE 'CNC T2 OK';

  -- T3: mesma NF parcial, operador informa duplicata igual ao conferido (60): aceito, redução explícita.
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000061000000019', p_numero_nf => 'CNC-T3',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'CNC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','CNC T3','gtin',null,'ref_fornecedor','CNC-T3','ncm',null,'u_com','UN','q_com',10,'v_un_com',10.00,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',60)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 6, 'divergencia_obs', 'recebimento parcial')));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT count(*), coalesce(sum(valor_total), 0) INTO v_apn, v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF v_apn <> 1 OR v_ap <> 60 THEN RAISE EXCEPTION 'CNC T3: AP esperada 1 de 60,00, veio % de %', v_apn, v_ap; END IF;
  RAISE NOTICE 'CNC T3 OK';

  -- T4: duplicatas em duas parcelas somando o exigível exato (50 + 50 = 100).
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '35260800000000000000550090000000071000000019', p_numero_nf => 'CNC-T4',
    p_fornecedor_cnpj => '99888777000166', p_fornecedor_nome => 'CNC FORN', p_loja_id => v_loja,
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','CNC T4','gtin',null,'ref_fornecedor','CNC-T4','ncm',null,'u_com','UN','q_com',10,'v_un_com',10.00,'fator',1,'atualizar_custo',true,'acao','CRIAR','produto_id_destino',null)),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(
      jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',50),
      jsonb_build_object('numero','2','data_vencimento',(current_date+60)::text,'valor',50)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 10, 'divergencia_obs', null)));
  PERFORM public.confirmar_importacao_nfe(v_imp);
  SELECT count(*), coalesce(sum(valor_total), 0) INTO v_apn, v_ap FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;
  IF v_apn <> 2 OR v_ap <> 100 THEN RAISE EXCEPTION 'CNC T4: esperado 2 APs somando 100,00, veio % de %', v_apn, v_ap; END IF;
  RAISE NOTICE 'CNC T4 OK';
END
$t$;

ROLLBACK;
