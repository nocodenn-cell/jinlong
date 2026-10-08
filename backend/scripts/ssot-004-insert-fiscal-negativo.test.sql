-- SSOT-004 — prova local de INSERT fiscal negado.
-- Roda no Postgres do Supabase local (schema completo), transação com ROLLBACK.
-- anon/authenticated não inserem direto. postgres (dono) segue via RPC SECURITY DEFINER.
-- Não usa PII. Não conecta no remoto.

\set ON_ERROR_STOP on
BEGIN;

DO $ssot004$
DECLARE
  v_loja uuid := 'f4000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f4000002-0000-4000-8000-000000000001';
  v_categoria uuid := 'f4000003-0000-4000-8000-000000000001';
  v_produto uuid := 'f4000004-0000-4000-8000-000000000001';
  v_caixa uuid;
  v_venda uuid := 'f4000005-0000-4000-8000-000000000001';
  v_doc uuid;
  v_negado boolean;
  r record;
BEGIN
  IF has_table_privilege('authenticated', 'public.documentos_fiscais_pendentes', 'INSERT') THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: authenticated ainda tem INSERT';
  END IF;
  IF has_table_privilege('anon', 'public.documentos_fiscais_pendentes', 'INSERT') THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: anon ainda tem INSERT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documentos_fiscais_pendentes'
      AND policyname = 'doc_fiscal_pendentes_insert_loja'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: policy doc_fiscal_pendentes_insert_loja ainda existe';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'public.fiscal_enfileirar_documento_venda(uuid,text,jsonb,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: service_role sem EXECUTE na RPC';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.fiscal_enfileirar_documento_venda(uuid,text,jsonb,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: anon ainda executa a RPC';
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  v_negado := false;
  BEGIN
    INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status)
    VALUES (gen_random_uuid(), 'NFC_E_STUB', 'PENDENTE');
  EXCEPTION WHEN insufficient_privilege THEN
    v_negado := true;
  END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT v_negado THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: authenticated conseguiu INSERT direto';
  END IF;

  PERFORM set_config('role', 'anon', true);
  v_negado := false;
  BEGIN
    INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status)
    VALUES (gen_random_uuid(), 'NFC_E_STUB', 'PENDENTE');
  EXCEPTION WHEN insufficient_privilege THEN
    v_negado := true;
  END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT v_negado THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: anon conseguiu INSERT direto';
  END IF;

  INSERT INTO auth.users (id) VALUES (v_operador) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'SSOT004 Loja', 'SSOT004', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_operador, 'SSOT004 Operador', 'OPERADOR', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;
  INSERT INTO public.categorias (id, nome)
  VALUES (v_categoria, 'SSOT004 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;
  INSERT INTO public.produtos (
    id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id
  ) VALUES (
    v_produto, '7899999940010', 'SSOT004 Produto', v_categoria, 10.00, 'brasil_nf', false, true, v_loja
  ) ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id;
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto, v_loja, 20, 0)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 20;
  INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo)
  VALUES (v_loja, 'PIX', 'Pix', true)
  ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;

  DELETE FROM public.caixas WHERE operador_id = v_operador;
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (v_operador, 'ABERTO', now(), 0, v_loja)
  RETURNING id INTO v_caixa;

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_venda, v_caixa, v_operador, v_loja, 'PIX',
    10, 0, 10,
    jsonb_build_array(jsonb_build_object('forma_pagamento', 'PIX', 'valor', 10)),
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', v_produto, 'quantidade', 1,
      'preco_original', 10, 'preco_unitario', 10, 'tipo_preco', 'VAREJO'
    ))
  );
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SSOT-004 SETUP FAIL: venda % / %', r.status, r.mensagem;
  END IF;

  v_doc := public.fiscal_enfileirar_documento_venda(v_venda, 'NFC_E_STUB', '{"origem":"ssot004"}'::jsonb, v_loja);
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: RPC não devolveu documento';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.documentos_fiscais_pendentes
    WHERE id = v_doc AND venda_id = v_venda AND status <> 'CANCELADO'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 FAIL: RPC não persistiu o documento';
  END IF;

  RAISE NOTICE 'SSOT-004 INSERT NEGADO + RPC OK';
END
$ssot004$;

ROLLBACK;
