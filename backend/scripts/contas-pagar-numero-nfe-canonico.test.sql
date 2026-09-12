-- Prova a correção de origem do número da NF-e em contas_pagar
-- (migration 20260911120000_contas_pagar_numero_nfe_canonico.sql).
--
-- Invariante: ao confirmar uma importação de NF-e, cada parcela vira um título
-- cujo `nfe_numero` é o número da NOTA e cujo `parcela_numero` é o número da
-- duplicata. Antes da correção ambos recebiam o número da duplicata, e a tela
-- de Contas a pagar mostrava "NF-e #1"/"NF-e #2" para qualquer nota.
--
-- Prova também que a correção não afeta as invariantes já existentes:
-- conferência obrigatória antes do crédito e quantidade vinda da conferência.
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja    uuid := 'e2000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e2000002-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'CPNum Loja', 'CPNUM-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'CPNum Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.importacoes_nfe
   WHERE chave_acesso = '35260900000000000000550010000000991000000999';
  DELETE FROM public.fornecedores WHERE cnpj = '55666777000188' AND loja_id = v_loja;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Importa uma NF-e nº 77821 com duas parcelas, confere e confirma.
-- ═══════════════════════════════════════════════════════════════════════════
DO $fluxo$
DECLARE
  v_loja     uuid := 'e2000001-0000-4000-8000-000000000001';
  v_gerente  uuid := 'e2000002-0000-4000-8000-000000000001';
  v_imp      uuid;
  v_item     uuid;
  v_res      jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  v_res := public.importar_nfe_transacao(
    p_chave_acesso    => '35260900000000000000550010000000991000000999',
    p_numero_nf       => '77821',
    p_fornecedor_cnpj => '55666777000188',
    p_fornecedor_nome => 'Fornecedor CPNum',
    p_loja_id         => v_loja,
    p_itens           => jsonb_build_array(jsonb_build_object(
      'nome_produto',       'Produto CPNum',
      'gtin',               '7890000000991',
      'ref_fornecedor',     'CPNUM-001',
      'ncm',                '39269090',
      'u_com',              'UN',
      'q_com',              5,
      'v_un_com',           10.00,
      'fator',              1,
      'atualizar_custo',    false,
      'acao',               'CRIAR',
      'produto_id_destino', NULL
    )),
    p_atualizar_custo => false,
    p_duplicatas      => jsonb_build_array(
      jsonb_build_object('numero', '1', 'data_vencimento', '2026-11-10', 'valor', 30.00),
      jsonb_build_object('numero', '2', 'data_vencimento', '2026-12-10', 'valor', 20.00)
    )
  );

  SELECT id INTO v_imp FROM public.importacoes_nfe
   WHERE chave_acesso = '35260900000000000000550010000000991000000999';

  IF v_imp IS NULL THEN
    RAISE EXCEPTION 'FALHA: importação não foi criada (%).', v_res;
  END IF;

  -- Invariante preservada: sem conferência, confirmar é recusado.
  BEGIN
    PERFORM public.confirmar_importacao_nfe(v_imp);
    RAISE EXCEPTION 'FALHA: confirmou sem conferência dos itens.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%IMPORT_NFE_CONFERENCIA_PENDENTE%' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'OK: conferência continua obrigatória antes do crédito.';
  END;

  SELECT id INTO v_item FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = v_imp LIMIT 1;

  PERFORM public.registrar_conferencia_nfe(
    v_imp,
    jsonb_build_array(jsonb_build_object(
      'item_id', v_item, 'quantidade_conferida', 5, 'divergencia_obs', NULL
    ))
  );

  PERFORM public.confirmar_importacao_nfe(v_imp);
END
$fluxo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Asserções sobre os títulos gerados.
-- ═══════════════════════════════════════════════════════════════════════════
DO $assert$
DECLARE
  v_imp        uuid;
  v_total      int;
  v_errados    int;
  v_p1         record;
BEGIN
  SELECT id INTO v_imp FROM public.importacoes_nfe
   WHERE chave_acesso = '35260900000000000000550010000000991000000999';

  SELECT count(*) INTO v_total
    FROM public.contas_pagar WHERE nfe_importacao_id = v_imp;

  IF v_total <> 2 THEN
    RAISE EXCEPTION 'FALHA: esperava 2 títulos, veio %.', v_total;
  END IF;

  -- Nenhum título pode carregar o número da parcela no campo da nota.
  SELECT count(*) INTO v_errados
    FROM public.contas_pagar
   WHERE nfe_importacao_id = v_imp
     AND nfe_numero IS DISTINCT FROM '77821';

  IF v_errados > 0 THEN
    RAISE EXCEPTION 'FALHA: % título(s) com nfe_numero != número da nota.', v_errados;
  END IF;

  SELECT nfe_numero, parcela_numero, vencimento, valor_total, status
    INTO v_p1
    FROM public.contas_pagar
   WHERE nfe_importacao_id = v_imp AND parcela_numero = '1';

  IF v_p1 IS NULL THEN
    RAISE EXCEPTION 'FALHA: parcela 1 não encontrada por parcela_numero.';
  END IF;

  IF v_p1.vencimento <> DATE '2026-11-10' OR v_p1.valor_total <> 30.00 THEN
    RAISE EXCEPTION 'FALHA: parcela 1 com vencimento/valor errados (% / %).',
      v_p1.vencimento, v_p1.valor_total;
  END IF;

  IF v_p1.status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'FALHA: parcela 1 deveria nascer PENDENTE, veio %.', v_p1.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contas_pagar
     WHERE nfe_importacao_id = v_imp
       AND parcela_numero = '2' AND valor_total = 20.00
       AND vencimento = DATE '2026-12-10'
  ) THEN
    RAISE EXCEPTION 'FALHA: parcela 2 não confere.';
  END IF;

  RAISE NOTICE 'OK: 2 títulos com nfe_numero=77821 e parcela_numero 1/2, valores e vencimentos da nota.';
END
$assert$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Estoque creditado pela quantidade CONFERIDA, com kardex rastreável.
-- ═══════════════════════════════════════════════════════════════════════════
DO $estoque$
DECLARE
  v_imp   uuid;
  v_delta numeric;
BEGIN
  SELECT id INTO v_imp FROM public.importacoes_nfe
   WHERE chave_acesso = '35260900000000000000550010000000991000000999';

  SELECT sum(quantidade_delta) INTO v_delta
    FROM public.movimentos_estoque_log
   WHERE tipo_codigo = 'ENTRADA_NFE'
     AND observacao LIKE '%' || v_imp::text || '%';

  IF COALESCE(v_delta, 0) <> 5 THEN
    RAISE EXCEPTION 'FALHA: kardex deveria registrar +5, veio %.', COALESCE(v_delta, 0);
  END IF;

  RAISE NOTICE 'OK: kardex com +5 de ENTRADA_NFE rastreável à importação.';
END
$estoque$;

ROLLBACK;
