-- Prova: confirmar_importacao_nfe credita estoque mesmo quando o custo da
-- nota estouraria trg_fn_produtos_margem (atacado < novo custo < varejo).
-- Sem o predicado de 20260830110000 a transação aborta com
-- PRODUTO_ATACADO_ABAIXO_CUSTO, a chave fica presa e o saldo não entra.
-- Dados sintéticos; ROLLBACK no fim.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja      uuid := 'a1000001-0000-4000-8000-000000000001';
  v_gerente   uuid := 'a1000002-0000-4000-8000-000000000001';
  v_categoria uuid := 'a1000003-0000-4000-8000-000000000001';
  v_apertado  uuid := 'a1000004-0000-4000-8000-000000000001';
  v_folgado   uuid := 'a1000005-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'FLX05 Margem Loja', 'FLX05-M', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'FLX05 Margem Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'FLX05 Margem')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  -- Atacado 60 entre custo antigo 50 e custo da nota 80 — o caso real do PDV.
  INSERT INTO public.produtos (
    id, codigo_barras, nome, categoria_id, preco_varejo, preco_atacado, preco_custo,
    origem, tem_nf, ativo, status_publicacao, loja_id, permitir_abaixo_custo
  ) VALUES (
    v_apertado, '7899999990199', 'FLX05 Atacado Apertado', v_categoria,
    100.00, 60.00, 50.00, 'brasil_nf', true, true, 'PUBLICADO', v_loja, false
  )
  ON CONFLICT (id) DO UPDATE SET
    preco_varejo = 100.00, preco_atacado = 60.00, preco_custo = 50.00,
    permitir_abaixo_custo = false, ativo = true, loja_id = EXCLUDED.loja_id;

  -- Varejo e atacado cabem o novo custo — prova que o UPDATE de custo continua.
  INSERT INTO public.produtos (
    id, codigo_barras, nome, categoria_id, preco_varejo, preco_atacado, preco_custo,
    origem, tem_nf, ativo, status_publicacao, loja_id, permitir_abaixo_custo
  ) VALUES (
    v_folgado, '7899999990299', 'FLX05 Margem Folgada', v_categoria,
    200.00, 150.00, 50.00, 'brasil_nf', true, true, 'PUBLICADO', v_loja, false
  )
  ON CONFLICT (id) DO UPDATE SET
    preco_varejo = 200.00, preco_atacado = 150.00, preco_custo = 50.00,
    permitir_abaixo_custo = false, ativo = true, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.estoque WHERE produto_id IN (v_apertado, v_folgado) AND loja_id = v_loja;
  DELETE FROM public.importacoes_nfe WHERE chave_acesso = '35260800000000000000550010000000021000000026';
  DELETE FROM public.fornecedores WHERE cnpj = '22333444000192' AND loja_id = v_loja;
END
$setup$;

DO $prova_trigger_ainda_bloqueia$
DECLARE
  v_apertado uuid := 'a1000004-0000-4000-8000-000000000001';
  v_falhou boolean := false;
BEGIN
  BEGIN
    UPDATE public.produtos SET preco_custo = 80.00 WHERE id = v_apertado;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PRODUTO_ATACADO_ABAIXO_CUSTO%' THEN
      v_falhou := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'FLX05_MARGEM_FALHOU: trg_fn_produtos_margem deveria recusar UPDATE direto de custo 80 sobre atacado 60';
  END IF;
END
$prova_trigger_ainda_bloqueia$;

DO $importa_confere_confirma$
DECLARE
  v_loja      uuid := 'a1000001-0000-4000-8000-000000000001';
  v_gerente   uuid := 'a1000002-0000-4000-8000-000000000001';
  v_apertado  uuid := 'a1000004-0000-4000-8000-000000000001';
  v_folgado   uuid := 'a1000005-0000-4000-8000-000000000001';
  v_resultado jsonb;
  v_imp_id    uuid;
  v_item_a    uuid;
  v_item_f    uuid;
  v_saldo_a   numeric;
  v_saldo_f   numeric;
  v_custo_a   numeric;
  v_custo_f   numeric;
  v_status    text;
  v_cp        numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  v_resultado := public.importar_nfe_transacao(
    p_chave_acesso    => '35260800000000000000550010000000021000000026',
    p_numero_nf       => 'FLX05-M1',
    p_fornecedor_cnpj => '22333444000192',
    p_fornecedor_nome => 'FLX05 Margem Forn',
    p_loja_id         => v_loja,
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'nome_produto', 'FLX05 Atacado Apertado', 'gtin', null,
        'ref_fornecedor', 'REF-APERTADO', 'ncm', null, 'u_com', 'UN',
        'q_com', 10, 'v_un_com', 80.00, 'fator', 1,
        'atualizar_custo', true, 'acao', 'VINCULAR', 'produto_id_destino', v_apertado::text
      ),
      jsonb_build_object(
        'nome_produto', 'FLX05 Margem Folgada', 'gtin', null,
        'ref_fornecedor', 'REF-FOLGADO', 'ncm', null, 'u_com', 'UN',
        'q_com', 5, 'v_un_com', 80.00, 'fator', 1,
        'atualizar_custo', true, 'acao', 'VINCULAR', 'produto_id_destino', v_folgado::text
      )
    ),
    p_atualizar_custo => true,
    p_duplicatas      => jsonb_build_array(
      jsonb_build_object('numero', 'DUP-M', 'data_vencimento', (current_date + 30)::text, 'valor', 1200.00)
    )
  );

  v_imp_id := (v_resultado->>'importacao_id')::uuid;
  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'FLX05_MARGEM_FALHOU: importacao_id ausente: %', v_resultado;
  END IF;

  SELECT id INTO v_item_a FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = v_imp_id AND produto_id = v_apertado;
  SELECT id INTO v_item_f FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = v_imp_id AND produto_id = v_folgado;

  PERFORM public.registrar_conferencia_nfe(
    v_imp_id,
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_a, 'quantidade_conferida', 10, 'divergencia_obs', null),
      jsonb_build_object('item_id', v_item_f, 'quantidade_conferida', 5, 'divergencia_obs', null)
    )
  );

  -- Sem o predicado isto levanta PRODUTO_ATACADO_ABAIXO_CUSTO e desfaz o estoque.
  PERFORM public.confirmar_importacao_nfe(v_imp_id);

  SELECT status INTO v_status FROM public.importacoes_nfe WHERE id = v_imp_id;
  IF v_status <> 'CONCLUIDA' THEN
    RAISE EXCEPTION 'FLX05_MARGEM_FALHOU: status deveria ser CONCLUIDA, veio %', v_status;
  END IF;

  SELECT quantidade_atual INTO v_saldo_a FROM public.estoque WHERE produto_id = v_apertado AND loja_id = v_loja;
  SELECT quantidade_atual INTO v_saldo_f FROM public.estoque WHERE produto_id = v_folgado AND loja_id = v_loja;
  IF v_saldo_a <> 10 THEN
    RAISE EXCEPTION 'FLX05_MARGEM_FALHOU: saldo apertado deveria ser 10, veio %', v_saldo_a;
  END IF;
  IF v_saldo_f <> 5 THEN
    RAISE EXCEPTION 'FLX05_MARGEM_FALHOU: saldo folgado deveria ser 5, veio %', v_saldo_f;
  END IF;

  SELECT preco_custo INTO v_custo_a FROM public.produtos WHERE id = v_apertado;
  SELECT preco_custo INTO v_custo_f FROM public.produtos WHERE id = v_folgado;
  IF v_custo_a <> 50.00 THEN
    RAISE EXCEPTION 'FLX05_MARGEM_FALHOU: custo apertado deveria permanecer 50 (não 80), veio %', v_custo_a;
  END IF;
  IF v_custo_f <> 80.00 THEN
    RAISE EXCEPTION 'FLX05_MARGEM_FALHOU: custo folgado deveria atualizar para 80, veio %', v_custo_f;
  END IF;

  SELECT valor_total INTO v_cp FROM public.contas_pagar
   WHERE nfe_importacao_id = v_imp_id AND nfe_numero = 'DUP-M';
  IF v_cp <> 1200.00 THEN
    RAISE EXCEPTION 'FLX05_MARGEM_FALHOU: contas_pagar deveria ser 1200, veio %', v_cp;
  END IF;

  RAISE NOTICE 'FLX05_MARGEM OK — estoque creditado, custo apertado preservado, custo folgado atualizado, AP gerada.';
END
$importa_confere_confirma$;

ROLLBACK;
