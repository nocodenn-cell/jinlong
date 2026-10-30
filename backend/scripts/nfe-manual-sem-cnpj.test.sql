-- Regressão local: entrada manual sem CNPJ usa o fluxo existente e não duplica fornecedor/financeiro.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  loja uuid := 'f0000001-0000-4000-8000-000000000001';
  gerente uuid := 'f0000002-0000-4000-8000-000000000001';
  categoria uuid := 'f0000003-0000-4000-8000-000000000001';
  produto uuid := 'f0000004-0000-4000-8000-000000000001';
  itens jsonb;
  parcelas jsonb := '[{"numero":"001","data_vencimento":"2026-10-05","valor":150}]';
  resultado jsonb;
  importacao uuid;
  fornecedor uuid;
  item uuid;
  falhou boolean := false;
BEGIN
  INSERT INTO auth.users(id) VALUES (gerente) ON CONFLICT DO NOTHING;
  -- Multiempresa: lojas e categorias exigem empresa_id (trigger tg_preenche_empresa_id).
  INSERT INTO public.lojas(id,nome,codigo,ativo,empresa_id) VALUES(loja,'Teste sem CNPJ','SEM-CNPJ',true,'f5100000-0000-4000-8000-0000000000e1') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.usuarios(id,nome,perfil,ativo,loja_id) VALUES(gerente,'Teste','GERENTE',true,loja)
    ON CONFLICT(id) DO UPDATE SET perfil='GERENTE',loja_id=EXCLUDED.loja_id;
  INSERT INTO public.categorias(id,nome,empresa_id) VALUES(categoria,'Teste','f5100000-0000-4000-8000-0000000000e1') ON CONFLICT DO NOTHING;
  INSERT INTO public.produtos(id,codigo_barras,nome,categoria_id,preco_varejo,preco_custo,origem,tem_nf,ativo,status_publicacao,loja_id)
    VALUES(produto,'7899999990099','Teste sem CNPJ',categoria,300,10,'brasil_nf',true,true,'PUBLICADO',loja)
    ON CONFLICT(id) DO UPDATE SET preco_varejo=300,preco_custo=10,loja_id=EXCLUDED.loja_id;
  DELETE FROM public.estoque WHERE produto_id=produto AND loja_id=loja;
  PERFORM set_config('request.jwt.claim.sub',gerente::text,true);
  itens := jsonb_build_array(jsonb_build_object('nome_produto','Teste','ref_fornecedor','SEM-CNPJ-ITEM',
    'q_com',10,'v_un_com',15,'fator',1,'acao','VINCULAR','produto_id_destino',produto));
  resultado := public.importar_nfe_transacao('MANUAL'||repeat('1',38),'SEM-CNPJ-1','', 'Fornecedor sem documento',loja,itens,true,parcelas);
  importacao := (resultado->>'importacao_id')::uuid;
  SELECT fornecedor_id INTO fornecedor FROM public.importacoes_nfe WHERE id=importacao;
  IF NOT EXISTS(SELECT 1 FROM public.fornecedores WHERE id=fornecedor AND cnpj IS NULL) THEN
    RAISE EXCEPTION 'Fornecedor não foi salvo sem CNPJ';
  END IF;
  SELECT id INTO item FROM public.importacoes_nfe_itens WHERE importacao_nfe_id=importacao;
  PERFORM public.registrar_conferencia_nfe(importacao,jsonb_build_array(jsonb_build_object('item_id',item,'quantidade_conferida',10,'divergencia_obs',null)));
  PERFORM public.confirmar_importacao_nfe(importacao);
  IF (SELECT quantidade_atual FROM public.estoque WHERE produto_id=produto AND loja_id=loja) IS DISTINCT FROM 10::numeric THEN
    RAISE EXCEPTION 'Estoque incorreto';
  END IF;
  IF (SELECT sum(valor_total) FROM public.contas_pagar WHERE nfe_importacao_id=importacao) IS DISTINCT FROM 150::numeric THEN
    RAISE EXCEPTION 'Contas a pagar incorretas';
  END IF;
  BEGIN
    PERFORM public.confirmar_importacao_nfe(importacao);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IMPORT_NFE_STATUS_INVALIDO' THEN RAISE; END IF;
    falhou := true;
  END;
  IF NOT falhou OR (SELECT count(*) FROM public.contas_pagar WHERE nfe_importacao_id=importacao) <> 1 THEN
    RAISE EXCEPTION 'Reconfirmação duplicou financeiro';
  END IF;
  resultado := public.importar_nfe_transacao('MANUAL'||repeat('2',38),'SEM-CNPJ-2',NULL,' fornecedor sem documento ',loja,itens,true,parcelas);
  IF (SELECT fornecedor_id FROM public.importacoes_nfe WHERE id=(resultado->>'importacao_id')::uuid) IS DISTINCT FROM fornecedor THEN
    RAISE EXCEPTION 'Fornecedor duplicado';
  END IF;
  falhou := false;
  BEGIN
    PERFORM public.importar_nfe_transacao(repeat('3',44),'XML','', 'Fornecedor',loja,itens,true,parcelas);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IMPORT_NFE_CNPJ_INVALIDO' THEN RAISE; END IF;
    falhou := true;
  END;
  IF NOT falhou THEN RAISE EXCEPTION 'XML sem CNPJ aceito'; END IF;
  falhou := false;
  BEGIN
    PERFORM public.importar_nfe_transacao('MANUAL'||repeat('4',38),'MANUAL','123','Fornecedor',loja,itens,true,parcelas);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IMPORT_NFE_CNPJ_INVALIDO' THEN RAISE; END IF;
    falhou := true;
  END;
  IF NOT falhou THEN RAISE EXCEPTION 'CNPJ parcial aceito'; END IF;
  RAISE NOTICE 'PASS: estoque, contas_pagar, idempotência, fornecedor reutilizado e XML protegido';
END
$test$;
ROLLBACK;
