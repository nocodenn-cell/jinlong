-- Item 14 do Plano Mestre de Fechamento dos Gaps.
--
-- Prova o invariante financeiro: uma duplicata (parcela a pagar) malformada
-- na importação de NF-e agora ABORTA a importação inteira
-- (IMPORT_NFE_DUPLICATA_INVALIDA) em vez de ser descartada em silêncio —
-- nada fica staged (nem importacoes_nfe, nem itens, nem estoque placeholder,
-- nem vínculo fornecedor/produto). Controle positivo confirma que uma
-- duplicata válida continua funcionando normalmente.
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK — não persiste
-- nada em produção.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja    uuid := 'e1000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e1000002-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja, 'NFEDup Loja', 'NFEDUP-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'NFEDup Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  -- Limpa resíduo de execuções anteriores (mesmas chaves sintéticas).
  DELETE FROM public.importacoes_nfe WHERE chave_acesso IN (
    '35260800000000000000550010000000021000000029',
    '35260800000000000000550010000000031000000039'
  );
  DELETE FROM public.fornecedores WHERE cnpj = '22333444000199' AND loja_id = v_loja;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1: data_vencimento nula aborta a importação inteira.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg1$
DECLARE
  v_loja    uuid := 'e1000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e1000002-0000-4000-8000-000000000001';
  v_chave   text := '35260800000000000000550010000000021000000029';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  BEGIN
    PERFORM public.importar_nfe_transacao(
      p_chave_acesso    => v_chave,
      p_numero_nf       => 'NFEDUP-1',
      p_fornecedor_cnpj => '22333444000199',
      p_fornecedor_nome => 'NFEDup Fornecedor',
      p_loja_id         => v_loja,
      p_itens           => jsonb_build_array(
        jsonb_build_object(
          'nome_produto', 'NFEDup Produto 1', 'gtin', null,
          'ref_fornecedor', 'REF-NFEDUP-001', 'ncm', null, 'u_com', 'UN',
          'q_com', 5, 'v_un_com', 10.00, 'fator', 1,
          'atualizar_custo', true, 'acao', 'CRIAR', 'produto_id_destino', null
        )
      ),
      p_atualizar_custo => true,
      -- data_vencimento nula: (NULL)::date é NULL, não erro de cast — mas a
      -- coluna é NOT NULL, então o INSERT falha no laço de duplicatas.
      p_duplicatas      => jsonb_build_array(
        jsonb_build_object('numero', 'DUP-RUIM', 'data_vencimento', null, 'valor', 50.00)
      )
    );
    RAISE EXCEPTION 'NFEDUP_FALHOU: esperava IMPORT_NFE_DUPLICATA_INVALIDA, importação não abortou';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'IMPORT_NFE_DUPLICATA_INVALIDA%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 1 OK: data_vencimento nula abortou a importação (%).', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM public.importacoes_nfe WHERE chave_acesso = v_chave) THEN
    RAISE EXCEPTION 'NFEDUP_FALHOU: importacoes_nfe persistiu apesar do abort';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vinculos_fornecedor_produto vp
             JOIN public.fornecedores f ON f.id = vp.fornecedor_id
             WHERE f.cnpj = '22333444000199' AND vp.ref_fornecedor = 'REF-NFEDUP-001') THEN
    RAISE EXCEPTION 'NFEDUP_FALHOU: vinculo_fornecedor_produto persistiu apesar do abort';
  END IF;
  IF EXISTS (SELECT 1 FROM public.produtos WHERE nome = 'NFEDup Produto 1') THEN
    RAISE EXCEPTION 'NFEDUP_FALHOU: produto novo persistiu apesar do abort (estoque teria entrado sem AP)';
  END IF;
  RAISE NOTICE 'Negativo 1 OK: nada ficou staged (importacoes_nfe/vinculo/produto ausentes).';
END
$neg1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 2: valor <= 0 (viola CHECK valor > 0) também aborta.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg2$
DECLARE
  v_loja    uuid := 'e1000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e1000002-0000-4000-8000-000000000001';
  v_chave   text := '35260800000000000000550010000000021000000029';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  BEGIN
    PERFORM public.importar_nfe_transacao(
      p_chave_acesso    => v_chave,
      p_numero_nf       => 'NFEDUP-1B',
      p_fornecedor_cnpj => '22333444000199',
      p_fornecedor_nome => 'NFEDup Fornecedor',
      p_loja_id         => v_loja,
      p_itens           => jsonb_build_array(
        jsonb_build_object(
          'nome_produto', 'NFEDup Produto 1B', 'gtin', null,
          'ref_fornecedor', 'REF-NFEDUP-001B', 'ncm', null, 'u_com', 'UN',
          'q_com', 5, 'v_un_com', 10.00, 'fator', 1,
          'atualizar_custo', true, 'acao', 'CRIAR', 'produto_id_destino', null
        )
      ),
      p_atualizar_custo => true,
      p_duplicatas      => jsonb_build_array(
        jsonb_build_object('numero', 'DUP-ZERO', 'data_vencimento', (current_date + 30)::text, 'valor', 0)
      )
    );
    RAISE EXCEPTION 'NFEDUP_FALHOU: esperava IMPORT_NFE_DUPLICATA_INVALIDA para valor=0, importação não abortou';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'IMPORT_NFE_DUPLICATA_INVALIDA%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 2 OK: valor=0 abortou a importação (%).', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM public.produtos WHERE nome = 'NFEDup Produto 1B') THEN
    RAISE EXCEPTION 'NFEDUP_FALHOU: produto novo (1B) persistiu apesar do abort';
  END IF;
END
$neg2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo: duplicata válida continua funcionando normalmente (não regrediu).
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos$
DECLARE
  v_loja      uuid := 'e1000001-0000-4000-8000-000000000001';
  v_gerente   uuid := 'e1000002-0000-4000-8000-000000000001';
  v_chave     text := '35260800000000000000550010000000031000000039';
  v_resultado jsonb;
  v_imp_id    uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  v_resultado := public.importar_nfe_transacao(
    p_chave_acesso    => v_chave,
    p_numero_nf       => 'NFEDUP-2',
    p_fornecedor_cnpj => '22333444000199',
    p_fornecedor_nome => 'NFEDup Fornecedor',
    p_loja_id         => v_loja,
    p_itens           => jsonb_build_array(
      jsonb_build_object(
        'nome_produto', 'NFEDup Produto 2', 'gtin', null,
        'ref_fornecedor', 'REF-NFEDUP-002', 'ncm', null, 'u_com', 'UN',
        'q_com', 5, 'v_un_com', 10.00, 'fator', 1,
        'atualizar_custo', true, 'acao', 'CRIAR', 'produto_id_destino', null
      )
    ),
    p_atualizar_custo => true,
    p_duplicatas      => jsonb_build_array(
      jsonb_build_object('numero', 'DUP-BOA', 'data_vencimento', (current_date + 30)::text, 'valor', 50.00)
    )
  );

  v_imp_id := (v_resultado->>'importacao_id')::uuid;
  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'NFEDUP_FALHOU: importação válida não retornou importacao_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.importacoes_nfe_duplicatas
    WHERE importacao_nfe_id = v_imp_id AND numero_duplicata = 'DUP-BOA' AND valor = 50.00
  ) THEN
    RAISE EXCEPTION 'NFEDUP_FALHOU: duplicata válida não foi persistida (regressão)';
  END IF;
  RAISE NOTICE 'Positivo OK: duplicata válida continua sendo gravada normalmente.';
END
$pos$;

ROLLBACK;
