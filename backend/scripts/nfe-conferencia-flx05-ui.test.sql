-- Jīn Lóng — plano de remediação PR1: fluxo ponta a ponta de conferência de
-- NF-e (FLX-05), cobrindo os pontos que motivaram este PR:
--   1. importar_nfe_transacao NÃO credita estoque nem custo na importação.
--   2. confirmar_importacao_nfe recusa (IMPORT_NFE_CONFERENCIA_PENDENTE)
--      enquanto houver item EM_CONFERENCIA — prova de "erro parcial".
--   3. registrar_conferencia_nfe grava quantidade CONFERIDA (não a da nota) e
--      marca DIVERGENTE quando os números não batem.
--   4. confirmar_importacao_nfe credita a quantidade CONFERIDA (não a da
--      nota), atualiza preco_custo de produto já existente, gera
--      movimentos_estoque_log (auditoria/kardex) e contas_pagar a partir da
--      duplicata.
--   5. Idempotência: confirmar/registrar de novo após CONCLUIDA falha com
--      IMPORT_NFE_STATUS_INVALIDO, sem duplicar crédito de estoque.
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK — não persiste
-- nada em produção.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja       uuid := 'f0000001-0000-4000-8000-000000000001';
  v_gerente    uuid := 'f0000002-0000-4000-8000-000000000001';
  v_categoria  uuid := 'f0000003-0000-4000-8000-000000000001';
  v_produto_ex uuid := 'f0000004-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja, 'FLX05 Loja', 'FLX05-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'FLX05 Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'FLX05 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  -- Produto pré-existente com custo desatualizado — prova que
  -- confirmar_importacao_nfe atualiza preco_custo de item VINCULADO.
  -- preco_varejo=300.00 é deliberadamente bem acima do custo inicial (99.99)
  -- E do custo pós-confirmação (150.00, ver passo 4): trg_fn_produtos_margem
  -- (migrations 124/125) rejeita qualquer UPDATE que deixe preco_varejo <
  -- preco_custo, então o valor precisa sobreviver às DUAS fases.
  INSERT INTO public.produtos (
    id, codigo_barras, nome, categoria_id, preco_varejo, preco_custo,
    origem, tem_nf, ativo, status_publicacao, loja_id
  )
  VALUES (
    v_produto_ex, '7899999990099', 'FLX05 Produto Existente', v_categoria,
    300.00, 99.99, 'brasil_nf', true, true, 'PUBLICADO', v_loja
  )
  ON CONFLICT (id) DO UPDATE SET
    preco_varejo = 300.00, preco_custo = 99.99, ativo = true, status_publicacao = 'PUBLICADO', loja_id = EXCLUDED.loja_id;

  -- Zera saldo de estoque do produto existente para a asserção de crédito ser exata.
  DELETE FROM public.estoque WHERE produto_id = v_produto_ex AND loja_id = v_loja;

  -- Limpa resíduo de execuções anteriores (mesmo CNPJ/chave sintéticos).
  DELETE FROM public.importacoes_nfe WHERE chave_acesso = '35260800000000000000550010000000011000000019';
  DELETE FROM public.fornecedores WHERE cnpj = '11222333000181' AND loja_id = v_loja;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) importar_nfe_transacao processa 2 itens (1 novo, 1 vinculado a produto
--    existente) e NÃO credita estoque nem custo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $importa$
DECLARE
  v_loja       uuid := 'f0000001-0000-4000-8000-000000000001';
  v_gerente    uuid := 'f0000002-0000-4000-8000-000000000001';
  v_produto_ex uuid := 'f0000004-0000-4000-8000-000000000001';
  v_resultado  jsonb;
  v_imp_id     uuid;
  v_status     text;
  v_custo_ex   numeric;
  v_saldo_ex   numeric;
  v_novo_produto_id uuid;
  v_saldo_novo numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  v_resultado := public.importar_nfe_transacao(
    p_chave_acesso    => '35260800000000000000550010000000011000000019',
    p_numero_nf       => 'FLX05-1',
    p_fornecedor_cnpj => '11222333000181',
    p_fornecedor_nome => 'FLX05 Fornecedor',
    p_loja_id         => v_loja,
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'nome_produto', 'FLX05 Produto Novo', 'gtin', null,
        'ref_fornecedor', 'REF-NOVO-001', 'ncm', null, 'u_com', 'UN',
        'q_com', 10, 'v_un_com', 120.00, 'fator', 1,
        'atualizar_custo', true, 'acao', 'CRIAR', 'produto_id_destino', null
      ),
      jsonb_build_object(
        'nome_produto', 'FLX05 Produto Existente', 'gtin', null,
        'ref_fornecedor', 'REF-EXISTENTE-001', 'ncm', null, 'u_com', 'UN',
        'q_com', 10, 'v_un_com', 150.00, 'fator', 1,
        'atualizar_custo', true, 'acao', 'VINCULAR', 'produto_id_destino', v_produto_ex::text
      )
    ),
    p_atualizar_custo => true,
    p_duplicatas      => jsonb_build_array(
      jsonb_build_object('numero', 'DUP-1', 'data_vencimento', (current_date + 30)::text, 'valor', 1350.00)
    )
  );

  IF (v_resultado->>'itens_processados')::int <> 2 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: esperava 2 itens processados, veio %', v_resultado->>'itens_processados';
  END IF;
  IF (v_resultado->>'produtos_novos')::int <> 1 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: esperava 1 produto novo, veio %', v_resultado->>'produtos_novos';
  END IF;
  IF (v_resultado->>'produtos_vinculados')::int <> 1 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: esperava 1 produto vinculado, veio %', v_resultado->>'produtos_vinculados';
  END IF;

  v_imp_id := (v_resultado->>'importacao_id')::uuid;
  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'FLX05_FALHOU: importar_nfe_transacao não retornou importacao_id';
  END IF;

  SELECT status INTO v_status FROM public.importacoes_nfe WHERE id = v_imp_id;
  IF v_status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'FLX05_FALHOU: status esperado EM_CONFERENCIA, veio %', v_status;
  END IF;

  -- Nem custo nem estoque do produto existente mudaram ainda.
  SELECT preco_custo INTO v_custo_ex FROM public.produtos WHERE id = v_produto_ex;
  IF v_custo_ex <> 99.99 THEN
    RAISE EXCEPTION 'FLX05_FALHOU (achado central do PR): importar_nfe_transacao já alterou preco_custo (%), deveria só acontecer em confirmar_importacao_nfe', v_custo_ex;
  END IF;

  SELECT quantidade_atual INTO v_saldo_ex FROM public.estoque WHERE produto_id = v_produto_ex AND loja_id = v_loja;
  IF v_saldo_ex IS NOT NULL AND v_saldo_ex <> 0 THEN
    RAISE EXCEPTION 'FLX05_FALHOU (achado central do PR): importar_nfe_transacao já creditou estoque (%), deveria ficar em 0 até a confirmação', v_saldo_ex;
  END IF;

  SELECT produto_id INTO v_novo_produto_id
    FROM public.vinculos_fornecedor_produto
   WHERE loja_id = v_loja AND ref_fornecedor = 'REF-NOVO-001';
  SELECT quantidade_atual INTO v_saldo_novo FROM public.estoque WHERE produto_id = v_novo_produto_id AND loja_id = v_loja;
  IF v_saldo_novo IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: produto novo deveria nascer com saldo 0 (veio %)', v_saldo_novo;
  END IF;

  RAISE NOTICE 'Passo 1 OK: NF-e importada (importacao_id=%), catálogo atualizado, ZERO crédito de estoque/custo — confirma o bug relatado no mapa.', v_imp_id;

  PERFORM set_config('flx05.imp_id', v_imp_id::text, false);
  PERFORM set_config('flx05.produto_novo_id', v_novo_produto_id::text, false);
END
$importa$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) confirmar_importacao_nfe recusa com itens ainda EM_CONFERENCIA (erro
--    parcial) — nada foi creditado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $gate_pendente$
DECLARE
  v_gerente uuid := 'f0000002-0000-4000-8000-000000000001';
  v_imp_id  uuid := current_setting('flx05.imp_id')::uuid;
  v_falhou  boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_CONFERENCIA_PENDENTE' THEN
      v_falhou := true;
    ELSE
      RAISE EXCEPTION 'FLX05_FALHOU: erro inesperado no gate de conferência pendente: %', SQLERRM;
    END IF;
  END;

  IF NOT v_falhou THEN
    RAISE EXCEPTION 'FLX05_FALHOU: confirmar_importacao_nfe deveria recusar com item EM_CONFERENCIA e não recusou';
  END IF;

  RAISE NOTICE 'Passo 2 OK: confirmar_importacao_nfe recusou com IMPORT_NFE_CONFERENCIA_PENDENTE (tudo-ou-nada preservado).';
END
$gate_pendente$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) registrar_conferencia_nfe grava a contagem física — um item bate com a
--    nota (CONFERIDO), o outro diverge de propósito (DIVERGENTE).
-- ═══════════════════════════════════════════════════════════════════════════

DO $confere$
DECLARE
  v_gerente     uuid := 'f0000002-0000-4000-8000-000000000001';
  v_imp_id      uuid := current_setting('flx05.imp_id')::uuid;
  v_produto_novo uuid := current_setting('flx05.produto_novo_id')::uuid;
  v_produto_ex  uuid := 'f0000004-0000-4000-8000-000000000001';
  v_item_novo   uuid;
  v_item_ex     uuid;
  v_resultado   jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  SELECT id INTO v_item_novo FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp_id AND produto_id = v_produto_novo;
  SELECT id INTO v_item_ex   FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp_id AND produto_id = v_produto_ex;

  -- Item novo: conferido igual à nota (10 -> 10) = CONFERIDO.
  -- Item existente: divergente de propósito (10 na nota, 8 conferidos) = DIVERGENTE.
  v_resultado := public.registrar_conferencia_nfe(
    v_imp_id,
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_novo, 'quantidade_conferida', 10, 'divergencia_obs', null),
      jsonb_build_object('item_id', v_item_ex, 'quantidade_conferida', 8, 'divergencia_obs', 'faltaram 2 unidades na caixa')
    )
  );

  IF (v_resultado->>'itens_conferidos')::int <> 1 OR (v_resultado->>'itens_divergentes')::int <> 1 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: esperava 1 conferido + 1 divergente, veio %', v_resultado;
  END IF;

  PERFORM 1 FROM public.importacoes_nfe_itens
   WHERE id = v_item_ex AND status_conferencia = 'DIVERGENTE' AND quantidade_conferida = 8;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FLX05_FALHOU: item existente não ficou DIVERGENTE com quantidade_conferida=8';
  END IF;

  RAISE NOTICE 'Passo 3 OK: conferência registrada (1 CONFERIDO, 1 DIVERGENTE com observação).';
END
$confere$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) confirmar_importacao_nfe credita a quantidade CONFERIDA (não a da
--    nota), atualiza custo do produto existente, grava kardex e contas_pagar.
-- ═══════════════════════════════════════════════════════════════════════════

DO $confirma$
DECLARE
  v_gerente      uuid := 'f0000002-0000-4000-8000-000000000001';
  v_imp_id       uuid := current_setting('flx05.imp_id')::uuid;
  v_produto_novo uuid := current_setting('flx05.produto_novo_id')::uuid;
  v_produto_ex   uuid := 'f0000004-0000-4000-8000-000000000001';
  v_saldo_novo   numeric;
  v_saldo_ex     numeric;
  v_custo_ex     numeric;
  v_status       text;
  v_kardex_delta numeric;
  v_kardex_obs   text;
  v_cp_valor     numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM public.confirmar_importacao_nfe(v_imp_id);

  SELECT status INTO v_status FROM public.importacoes_nfe WHERE id = v_imp_id;
  IF v_status <> 'CONCLUIDA' THEN
    RAISE EXCEPTION 'FLX05_FALHOU: status pós-confirmação deveria ser CONCLUIDA, veio %', v_status;
  END IF;

  -- Produto novo: creditado com a quantidade CONFERIDA (10), igual à nota neste caso.
  SELECT quantidade_atual INTO v_saldo_novo FROM public.estoque WHERE produto_id = v_produto_novo AND loja_id = 'f0000001-0000-4000-8000-000000000001';
  IF v_saldo_novo <> 10 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: saldo do produto novo deveria ser 10, veio %', v_saldo_novo;
  END IF;

  -- Produto existente: creditado com a quantidade CONFERIDA (8), NÃO a da nota (10) —
  -- esta é a prova central de "nunca creditar do XML, sempre da conferência".
  SELECT quantidade_atual INTO v_saldo_ex FROM public.estoque WHERE produto_id = v_produto_ex AND loja_id = 'f0000001-0000-4000-8000-000000000001';
  IF v_saldo_ex <> 8 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: saldo do produto existente deveria ser 8 (quantidade conferida, não os 10 da nota), veio %', v_saldo_ex;
  END IF;

  -- Custo do produto existente atualizado de 99.99 para 150.00 (v_un_com/fator do item).
  SELECT preco_custo INTO v_custo_ex FROM public.produtos WHERE id = v_produto_ex;
  IF v_custo_ex <> 150.00 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: preco_custo do produto existente deveria ser 150.00, veio %', v_custo_ex;
  END IF;

  -- Kardex: linha ENTRADA_NFE para o item divergente, delta = quantidade conferida, observação menciona divergência.
  SELECT quantidade_delta, observacao INTO v_kardex_delta, v_kardex_obs
    FROM public.movimentos_estoque_log
   WHERE produto_id = v_produto_ex AND tipo_codigo = 'ENTRADA_NFE'
   ORDER BY created_at DESC LIMIT 1;
  IF v_kardex_delta IS NULL THEN
    RAISE EXCEPTION 'FLX05_FALHOU: nenhuma linha ENTRADA_NFE no kardex para o produto existente';
  END IF;
  IF v_kardex_delta <> 8 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: delta do kardex deveria ser 8, veio %', v_kardex_delta;
  END IF;
  IF position('divergente' IN v_kardex_obs) = 0 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: observação do kardex deveria mencionar divergência, veio: %', v_kardex_obs;
  END IF;

  -- contas_pagar: duplicata materializada só agora, com valor/vencimento do XML.
  SELECT valor_total INTO v_cp_valor
    FROM public.contas_pagar
   WHERE nfe_importacao_id = v_imp_id AND nfe_numero = 'DUP-1';
  IF v_cp_valor IS NULL THEN
    RAISE EXCEPTION 'FLX05_FALHOU: contas_pagar não foi gerada a partir da duplicata';
  END IF;
  IF v_cp_valor <> 1350.00 THEN
    RAISE EXCEPTION 'FLX05_FALHOU: valor de contas_pagar deveria ser 1350.00, veio %', v_cp_valor;
  END IF;

  RAISE NOTICE 'Passo 4 OK: estoque creditado pela quantidade CONFERIDA, custo atualizado, kardex e contas_pagar gravados.';
END
$confirma$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Idempotência: confirmar/registrar de novo após CONCLUIDA falha, sem
--    duplicar crédito de estoque.
-- ═══════════════════════════════════════════════════════════════════════════

DO $idempotencia$
DECLARE
  v_gerente    uuid := 'f0000002-0000-4000-8000-000000000001';
  v_imp_id     uuid := current_setting('flx05.imp_id')::uuid;
  v_produto_ex uuid := 'f0000004-0000-4000-8000-000000000001';
  v_item_ex    uuid;
  v_saldo_antes numeric;
  v_saldo_depois numeric;
  v_falhou_confirmar boolean := false;
  v_falhou_conferir  boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  SELECT quantidade_atual INTO v_saldo_antes FROM public.estoque WHERE produto_id = v_produto_ex AND loja_id = 'f0000001-0000-4000-8000-000000000001';

  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_STATUS_INVALIDO' THEN v_falhou_confirmar := true;
    ELSE RAISE EXCEPTION 'FLX05_FALHOU: erro inesperado ao reconfirmar: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou_confirmar THEN
    RAISE EXCEPTION 'FLX05_FALHOU: confirmar_importacao_nfe deveria recusar reconfirmação de importação já CONCLUIDA';
  END IF;

  SELECT id INTO v_item_ex FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp_id AND produto_id = v_produto_ex;
  BEGIN
    PERFORM public.registrar_conferencia_nfe(
      v_imp_id,
      jsonb_build_array(jsonb_build_object('item_id', v_item_ex, 'quantidade_conferida', 999, 'divergencia_obs', null))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_STATUS_INVALIDO' THEN v_falhou_conferir := true;
    ELSE RAISE EXCEPTION 'FLX05_FALHOU: erro inesperado ao reconferir: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou_conferir THEN
    RAISE EXCEPTION 'FLX05_FALHOU: registrar_conferencia_nfe deveria recusar conferência de importação já CONCLUIDA';
  END IF;

  SELECT quantidade_atual INTO v_saldo_depois FROM public.estoque WHERE produto_id = v_produto_ex AND loja_id = 'f0000001-0000-4000-8000-000000000001';
  IF v_saldo_depois <> v_saldo_antes THEN
    RAISE EXCEPTION 'FLX05_FALHOU: saldo mudou após tentativas de reconfirmação/reconferência (% -> %) — duplicou crédito', v_saldo_antes, v_saldo_depois;
  END IF;

  RAISE NOTICE 'Passo 5 OK: reconfirmação e reconferência recusadas (IMPORT_NFE_STATUS_INVALIDO), saldo não duplicou (%).', v_saldo_depois;
END
$idempotencia$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Adversarial: NaN/Infinity em quantidade_conferida — mesma classe de
--    defeito fechada pela D0-03 para remessas (Postgres numeric trata NaN e
--    Infinity como maiores que qualquer valor finito em comparação direta;
--    um guard só de sinal (`< 0`) não barra esses valores).
-- ═══════════════════════════════════════════════════════════════════════════

DO $setup_adversarial$
DECLARE
  v_loja_a    uuid := 'f0000001-0000-4000-8000-000000000001';
  v_gerente_b uuid := 'f0000006-0000-4000-8000-000000000001';
  v_loja_b    uuid := 'f0000005-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente_b) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja_b, 'FLX05 Loja B', 'FLX05-B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente_b, 'FLX05 Gerente B (outra loja)', 'GERENTE', true, v_loja_b)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.importacoes_nfe WHERE chave_acesso = '35260800000000000000550010000000022000000028';
END
$setup_adversarial$;

DO $nova_importacao$
DECLARE
  v_loja_a    uuid := 'f0000001-0000-4000-8000-000000000001';
  v_gerente_a uuid := 'f0000002-0000-4000-8000-000000000001';
  v_resultado jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);

  v_resultado := public.importar_nfe_transacao(
    p_chave_acesso    => '35260800000000000000550010000000022000000028',
    p_numero_nf       => 'FLX05-2',
    p_fornecedor_cnpj => '11222333000181',
    p_fornecedor_nome => 'FLX05 Fornecedor',
    p_loja_id         => v_loja_a,
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'nome_produto', 'FLX05 Produto Adversarial', 'gtin', null,
        'ref_fornecedor', 'REF-ADV-001', 'ncm', null, 'u_com', 'UN',
        'q_com', 5, 'v_un_com', 20.00, 'fator', 1,
        'atualizar_custo', true, 'acao', 'CRIAR', 'produto_id_destino', null
      )
    ),
    p_atualizar_custo => true,
    p_duplicatas      => null
  );

  PERFORM set_config('flx05.imp_id_2', (v_resultado->>'importacao_id')::text, false);
END
$nova_importacao$;

DO $nan_infinity$
DECLARE
  v_gerente_a uuid := 'f0000002-0000-4000-8000-000000000001';
  v_imp_id_2  uuid := current_setting('flx05.imp_id_2')::uuid;
  v_item_id_2 uuid;
  v_falhou_nan boolean := false;
  v_falhou_inf boolean := false;
  v_qtd_apos  numeric;
  v_status_apos text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  SELECT id INTO v_item_id_2 FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp_id_2;

  BEGIN
    PERFORM public.registrar_conferencia_nfe(
      v_imp_id_2,
      jsonb_build_array(jsonb_build_object('item_id', v_item_id_2, 'quantidade_conferida', 'NaN'::numeric, 'divergencia_obs', null))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_CONFERENCIA_QTD_INVALIDA' THEN v_falhou_nan := true;
    ELSE RAISE EXCEPTION 'FLX05_FALHOU: NaN não foi rejeitado com o código esperado, veio: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou_nan THEN
    RAISE EXCEPTION 'FLX05_FALHOU (BLOCKER): registrar_conferencia_nfe aceitou quantidade_conferida = NaN sem erro — corromperia estoque.quantidade_atual em confirmar_importacao_nfe';
  END IF;

  BEGIN
    PERFORM public.registrar_conferencia_nfe(
      v_imp_id_2,
      jsonb_build_array(jsonb_build_object('item_id', v_item_id_2, 'quantidade_conferida', 'Infinity'::numeric, 'divergencia_obs', null))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_CONFERENCIA_QTD_INVALIDA' THEN v_falhou_inf := true;
    ELSE RAISE EXCEPTION 'FLX05_FALHOU: Infinity não foi rejeitado com o código esperado, veio: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou_inf THEN
    RAISE EXCEPTION 'FLX05_FALHOU (BLOCKER): registrar_conferencia_nfe aceitou quantidade_conferida = Infinity sem erro';
  END IF;

  SELECT quantidade_conferida, status_conferencia INTO v_qtd_apos, v_status_apos
    FROM public.importacoes_nfe_itens WHERE id = v_item_id_2;
  IF v_qtd_apos IS NOT NULL OR v_status_apos <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'FLX05_FALHOU: item foi alterado apesar de NaN/Infinity terem sido rejeitados (qtd=%, status=%)', v_qtd_apos, v_status_apos;
  END IF;

  RAISE NOTICE 'Passo 6 OK: NaN e Infinity rejeitados em quantidade_conferida (mesma classe de defeito da D0-03), item permanece intocado.';
END
$nan_infinity$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) Adversarial: GERENTE de outra loja não consegue mutar (conferir/
--    confirmar) uma importação que não é da sua loja, manipulando
--    importacao_id — teste no ponto de MUTAÇÃO, não só de listagem.
-- ═══════════════════════════════════════════════════════════════════════════

DO $tenant_negative$
DECLARE
  v_gerente_b uuid := 'f0000006-0000-4000-8000-000000000001';
  v_imp_id_2  uuid := current_setting('flx05.imp_id_2')::uuid;
  v_item_id_2 uuid;
  v_falhou_conferir  boolean := false;
  v_falhou_confirmar boolean := false;
  v_qtd_apos numeric;
  v_status_apos text;
  v_status_importacao_apos text;
BEGIN
  SELECT id INTO v_item_id_2 FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp_id_2;

  PERFORM set_config('request.jwt.claim.sub', v_gerente_b::text, true);

  BEGIN
    PERFORM public.registrar_conferencia_nfe(
      v_imp_id_2,
      jsonb_build_array(jsonb_build_object('item_id', v_item_id_2, 'quantidade_conferida', 5, 'divergencia_obs', null))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_LOJA' THEN v_falhou_conferir := true;
    ELSE RAISE EXCEPTION 'FLX05_FALHOU (BLOCKER): GERENTE de outra loja recebeu erro inesperado (não IMPORT_NFE_LOJA) ao tentar conferir importação alheia: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou_conferir THEN
    RAISE EXCEPTION 'FLX05_FALHOU (BLOCKER DE SEGURANCA PARA PR1): GERENTE de outra loja conseguiu registrar conferência em importação que não é da sua loja, manipulando importacao_id.';
  END IF;

  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp_id_2);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'IMPORT_NFE_LOJA' THEN v_falhou_confirmar := true;
    ELSE RAISE EXCEPTION 'FLX05_FALHOU (BLOCKER): GERENTE de outra loja recebeu erro inesperado (não IMPORT_NFE_LOJA) ao tentar confirmar importação alheia: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou_confirmar THEN
    RAISE EXCEPTION 'FLX05_FALHOU (BLOCKER DE SEGURANCA PARA PR1): GERENTE de outra loja conseguiu confirmar (creditar estoque de) importação que não é da sua loja, manipulando importacao_id.';
  END IF;

  -- Nada mudou: nem o item, nem o status da importação, apesar das duas tentativas.
  SELECT quantidade_conferida, status_conferencia INTO v_qtd_apos, v_status_apos
    FROM public.importacoes_nfe_itens WHERE id = v_item_id_2;
  SELECT status INTO v_status_importacao_apos FROM public.importacoes_nfe WHERE id = v_imp_id_2;

  IF v_qtd_apos IS NOT NULL OR v_status_apos <> 'EM_CONFERENCIA' OR v_status_importacao_apos <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'FLX05_FALHOU: estado mudou apesar de ambas as tentativas cross-loja terem sido recusadas (qtd=%, status_item=%, status_importacao=%)', v_qtd_apos, v_status_apos, v_status_importacao_apos;
  END IF;

  RAISE NOTICE 'Passo 7 OK: GERENTE de outra loja recusado em registrar_conferencia_nfe E confirmar_importacao_nfe (IMPORT_NFE_LOJA), sem alterar estado — autorização provada no ponto de mutação.';
END
$tenant_negative$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) Estático: prova que o lock FOR UPDATE (achado de revisão pré-merge —
--    condição de corrida entre chamadas concorrentes de
--    registrar_conferencia_nfe/confirmar_importacao_nfe sobre a mesma
--    importação) está de fato no corpo das duas funções. Duas sessões
--    Postgres simultâneas de verdade não cabem num script psql sequencial
--    de uma conexão só — esta é a prova disponível neste harness; a garantia
--    em si vem do bloqueio de linha padrão do Postgres em SELECT ... FOR
--    UPDATE, mesmo padrão já usado em decrementar_estoque_seguro e
--    transferir_estoque_seguro neste schema.
-- ═══════════════════════════════════════════════════════════════════════════

DO $lock_presente$
DECLARE
  v_def_registrar text := pg_get_functiondef('public.registrar_conferencia_nfe(uuid,jsonb)'::regprocedure);
  v_def_confirmar text := pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure);
BEGIN
  IF position('FOR UPDATE' IN v_def_registrar) = 0 THEN
    RAISE EXCEPTION 'FLX05_FALHOU (BLOCKER): registrar_conferencia_nfe sem FOR UPDATE — condição de corrida com confirmar_importacao_nfe reaberta.';
  END IF;
  IF position('FOR UPDATE' IN v_def_confirmar) = 0 THEN
    RAISE EXCEPTION 'FLX05_FALHOU (BLOCKER): confirmar_importacao_nfe sem FOR UPDATE — duas confirmações concorrentes podem duplicar estoque/contas_pagar.';
  END IF;

  RAISE NOTICE 'Passo 8 OK: FOR UPDATE presente em registrar_conferencia_nfe e confirmar_importacao_nfe (prova estática — sem sessões concorrentes reais neste harness).';
END
$lock_presente$;

DO $resumo$
BEGIN
  RAISE NOTICE 'FLX05 UI (PR1) — todos os passos OK: quantidade, custo, estoque, idempotência, erro parcial, auditoria (kardex + contas_pagar), NaN/Infinity, isolamento cross-loja no ponto de mutação e lock FOR UPDATE contra corrida verificados.';
END
$resumo$;

ROLLBACK;
