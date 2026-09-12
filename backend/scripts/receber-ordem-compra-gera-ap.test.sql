-- Prova o fechamento Compra -> Financeiro
-- (migration 20260911130000_receber_ordem_compra_gera_contas_pagar.sql).
--
-- Invariantes provadas:
--   1. Conferencia continua obrigatoria antes de qualquer credito.
--   2. O titulo nasce pela quantidade CONFERIDA, nao pela pedida.
--   3. Um recebimento gera no maximo UM titulo (idempotencia).
--   4. Ordem sem data_vencimento nao gera titulo (regra declarada, nao inventada).
--   5. Ordem com fornecedor apenas em texto livre nao gera titulo.
--
-- Dados sinteticos, tudo dentro de uma transacao com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja    uuid := 'e3000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e3000002-0000-4000-8000-000000000001';
  v_forn    uuid := 'e3000003-0000-4000-8000-000000000001';
  v_prod    uuid := 'e3000004-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'OCAP Loja', 'OCAP-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'OCAP Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.fornecedores (id, loja_id, nome, cnpj)
  VALUES (v_forn, v_loja, 'Fornecedor OCAP', '99888777000166')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, loja_id, nome, preco_varejo, preco_custo, ativo, origem)
  VALUES (v_prod, v_loja, 'Produto OCAP', 100.00, 10.00, true, 'china_manual')
  ON CONFLICT (id) DO UPDATE SET ativo = true;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Caso 1 — ordem completa: fornecedor cadastrado + vencimento.
-- Pedido de 10, conferido 8. O titulo deve refletir 8.
-- ═══════════════════════════════════════════════════════════════════════════
DO $caso1$
DECLARE
  v_loja    uuid := 'e3000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e3000002-0000-4000-8000-000000000001';
  v_forn    uuid := 'e3000003-0000-4000-8000-000000000001';
  v_prod    uuid := 'e3000004-0000-4000-8000-000000000001';
  v_oc      uuid := 'e3000010-0000-4000-8000-000000000001';
  v_item    uuid := 'e3000011-0000-4000-8000-000000000001';
  v_conta   record;
  v_delta   numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  INSERT INTO public.ordens_compra (
    id, loja_id, fornecedor_id, status, data_emissao, data_vencimento, created_by
  ) VALUES (
    v_oc, v_loja, v_forn, 'EM_TRANSITO', CURRENT_DATE, DATE '2026-12-20', v_gerente
  );

  INSERT INTO public.ordens_compra_itens (
    id, ordem_id, produto_id, quantidade, preco_unitario, unidade_medida
  ) VALUES (
    v_item, v_oc, v_prod, 10, 12.50, 'UN'
  );

  -- Invariante 1: sem conferencia, recebimento e recusado.
  BEGIN
    PERFORM public.receber_ordem_compra(v_oc);
    RAISE EXCEPTION 'FALHA: recebeu sem conferencia.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%OC_CONFERENCIA_PENDENTE%' THEN RAISE; END IF;
      RAISE NOTICE 'OK: conferencia obrigatoria antes do credito.';
  END;

  PERFORM public.registrar_conferencia_ordem_compra(
    v_oc,
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantidade_conferida', 8))
  );

  PERFORM public.receber_ordem_compra(v_oc);

  -- Invariante 2: titulo pela quantidade conferida (8 x 12,50 = 100,00).
  SELECT * INTO v_conta FROM public.contas_pagar WHERE ordem_compra_id = v_oc;

  IF v_conta IS NULL THEN
    RAISE EXCEPTION 'FALHA: recebimento nao gerou conta a pagar.';
  END IF;

  IF v_conta.valor_total <> 100.00 THEN
    RAISE EXCEPTION 'FALHA: valor deveria ser 100.00 (8 x 12.50), veio %.', v_conta.valor_total;
  END IF;

  IF v_conta.vencimento <> DATE '2026-12-20' THEN
    RAISE EXCEPTION 'FALHA: vencimento deveria vir da ordem, veio %.', v_conta.vencimento;
  END IF;

  IF v_conta.fornecedor_id <> v_forn OR v_conta.status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'FALHA: fornecedor/status do titulo incorretos (% / %).',
      v_conta.fornecedor_id, v_conta.status;
  END IF;

  -- Estoque creditado pela mesma grandeza.
  SELECT sum(quantidade_delta) INTO v_delta
    FROM public.movimentos_estoque_log
   WHERE tipo_codigo = 'ENTRADA_OC' AND observacao LIKE '%' || v_oc::text || '%';

  IF COALESCE(v_delta, 0) <> 8 THEN
    RAISE EXCEPTION 'FALHA: kardex deveria registrar +8, veio %.', COALESCE(v_delta, 0);
  END IF;

  RAISE NOTICE 'OK: titulo R$ 100,00 venc. 2026-12-20 e kardex +8, ambos pela quantidade conferida.';

  -- Invariante 3: reexecutar e recusado; continua havendo UM titulo.
  BEGIN
    PERFORM public.receber_ordem_compra(v_oc);
    RAISE EXCEPTION 'FALHA: recebimento repetido foi aceito.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%OC_STATUS_INVALIDO%' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.contas_pagar WHERE ordem_compra_id = v_oc) <> 1 THEN
    RAISE EXCEPTION 'FALHA: mais de um titulo para a mesma ordem.';
  END IF;

  RAISE NOTICE 'OK: recebimento repetido recusado e titulo unico por ordem.';
END
$caso1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Caso 2 — ordem sem data_vencimento: credita estoque, nao gera titulo.
-- ═══════════════════════════════════════════════════════════════════════════
DO $caso2$
DECLARE
  v_loja    uuid := 'e3000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e3000002-0000-4000-8000-000000000001';
  v_forn    uuid := 'e3000003-0000-4000-8000-000000000001';
  v_prod    uuid := 'e3000004-0000-4000-8000-000000000001';
  v_oc      uuid := 'e3000020-0000-4000-8000-000000000001';
  v_item    uuid := 'e3000021-0000-4000-8000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  INSERT INTO public.ordens_compra (id, loja_id, fornecedor_id, status, data_emissao, created_by)
  VALUES (v_oc, v_loja, v_forn, 'EM_TRANSITO', CURRENT_DATE, v_gerente);

  INSERT INTO public.ordens_compra_itens (id, ordem_id, produto_id, quantidade, preco_unitario, unidade_medida)
  VALUES (v_item, v_oc, v_prod, 4, 9.00, 'UN');

  PERFORM public.registrar_conferencia_ordem_compra(
    v_oc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantidade_conferida', 4))
  );
  PERFORM public.receber_ordem_compra(v_oc);

  IF EXISTS (SELECT 1 FROM public.contas_pagar WHERE ordem_compra_id = v_oc) THEN
    RAISE EXCEPTION 'FALHA: gerou titulo sem data de vencimento na ordem.';
  END IF;

  IF (SELECT status FROM public.ordens_compra WHERE id = v_oc) <> 'RECEBIDA' THEN
    RAISE EXCEPTION 'FALHA: recebimento sem prazo deveria concluir mesmo assim.';
  END IF;

  RAISE NOTICE 'OK: sem prazo acordado nao nasce titulo, e o recebimento nao e bloqueado.';
END
$caso2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Caso 3 — fornecedor apenas em texto livre: nao gera titulo.
-- ═══════════════════════════════════════════════════════════════════════════
DO $caso3$
DECLARE
  v_loja    uuid := 'e3000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e3000002-0000-4000-8000-000000000001';
  v_prod    uuid := 'e3000004-0000-4000-8000-000000000001';
  v_oc      uuid := 'e3000030-0000-4000-8000-000000000001';
  v_item    uuid := 'e3000031-0000-4000-8000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  INSERT INTO public.ordens_compra (
    id, loja_id, fornecedor_id, fornecedor_nome, status, data_emissao, data_vencimento, created_by
  ) VALUES (
    v_oc, v_loja, NULL, 'Fornecedor sem cadastro', 'EM_TRANSITO',
    CURRENT_DATE, DATE '2026-12-20', v_gerente
  );

  INSERT INTO public.ordens_compra_itens (id, ordem_id, produto_id, quantidade, preco_unitario, unidade_medida)
  VALUES (v_item, v_oc, v_prod, 3, 5.00, 'UN');

  PERFORM public.registrar_conferencia_ordem_compra(
    v_oc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantidade_conferida', 3))
  );
  PERFORM public.receber_ordem_compra(v_oc);

  IF EXISTS (SELECT 1 FROM public.contas_pagar WHERE ordem_compra_id = v_oc) THEN
    RAISE EXCEPTION 'FALHA: gerou titulo para fornecedor sem cadastro.';
  END IF;

  RAISE NOTICE 'OK: fornecedor so em texto livre nao vira obrigacao financeira.';
END
$caso3$;

ROLLBACK;
