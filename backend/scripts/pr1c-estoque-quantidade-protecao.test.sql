-- PR-1C — regressão de 20260904090000_estoque_quantidade_protecao.sql
-- (achado P1 da auditoria Jīn Lóng: estoque.quantidade_atual editável
-- direto via API, podendo ficar negativo e contornando o kardex).
--
-- Prova, com dados sintéticos (1 loja, 1 GERENTE, 2 produtos — um com linha
-- de estoque já existente, outro sem), os cenários exigidos:
--   1. GERENTE UPDATE direto em quantidade_atual -> NEGADO (grant).
--   2. GERENTE INSERT direto com quantidade_atual <> 0 -> NEGADO (policy).
--   3. GERENTE INSERT direto com quantidade_atual = 0 -> PERMITIDO
--      (mesmo caminho de garantirLinhaEstoque).
--   4. GERENTE DELETE direto -> NEGADO (achado de review pós-merge:
--      DELETE+INSERT(qtd=0) zerava saldo sem RPC/kardex — ver
--      20260904110000_estoque_fecha_bypass_delete_insert_e_nan.sql).
--   5. GERENTE consegue excluir a linha via RPC
--      excluir_linha_estoque_produto -> PERMITIDO (mesmo resultado da
--      exclusão de produto, agora só possível por esse caminho).
--   6. Fluxo legítimo (ajustar_estoque_manual, SECURITY DEFINER) continua
--      fazendo UPDATE de quantidade_atual normalmente.
--   7. CHECK constraint bloqueia quantidade negativa mesmo para quem
--      bypassa RLS/grant (service_role/owner) — invariante vale para
--      QUALQUER writer, não só authenticated.
--   8. CHECK constraint bloqueia NaN (numeric NaN >= 0 é true no Postgres
--      — achado de review pós-merge).
-- Tudo dentro de uma transação com ROLLBACK final — nada persiste.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_categoria uuid := 'f000000b-0000-4000-8000-000000000003';
  v_produto_com_linha uuid := 'f000000b-0000-4000-8000-000000000004';
  v_produto_sem_linha uuid := 'f000000b-0000-4000-8000-000000000005';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja, 'PR1C Loja', 'PR1C-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id, idioma_preferido) VALUES
    (v_gerente, 'PR1C Gerente', 'GERENTE', true, v_loja, 'pt')
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'PR1C Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES
    (v_produto_com_linha, '7899999990199', 'PR1C Produto Com Linha', v_categoria, 10.00, 'china_manual', false, true, v_loja),
    (v_produto_sem_linha, '7899999990299', 'PR1C Produto Sem Linha', v_categoria, 10.00, 'china_manual', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.estoque WHERE produto_id = v_produto_sem_linha;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto_com_linha, v_loja, 100, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE SET quantidade_atual = 100;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1 — GERENTE tenta UPDATE direto em quantidade_atual
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_update_direto$
DECLARE
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000004';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.estoque SET quantidade_atual = 999 WHERE produto_id = v_produto;
    RAISE EXCEPTION 'PR1C_FALHOU: GERENTE conseguiu UPDATE direto em quantidade_atual';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 1 OK: UPDATE direto negado por grant (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_update_direto$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 2 — GERENTE tenta INSERT direto com quantidade_atual <> 0
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_insert_quantidade_nao_zero$
DECLARE
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000005';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
    VALUES (v_produto, v_loja, 50, 0);
    RAISE EXCEPTION 'PR1C_FALHOU: GERENTE conseguiu forjar saldo inicial via INSERT com quantidade<>0';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE != '42501' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo 2 OK: INSERT com quantidade_atual<>0 negado pela policy (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_insert_quantidade_nao_zero$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo 1 — GERENTE consegue INSERT direto com quantidade_atual = 0
-- (mesmo caminho de garantirLinhaEstoque)
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_insert_quantidade_zero$
DECLARE
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000005';
  v_linhas int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto, v_loja, 0, 0);
  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  RESET ROLE;

  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'PR1C_FALHOU: garantirLinhaEstoque (quantidade_atual=0) não inseriu (linhas=%)', v_linhas;
  END IF;

  RAISE NOTICE 'Positivo 1 OK: INSERT direto com quantidade_atual=0 permitido normalmente.';
END
$pos_insert_quantidade_zero$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 4 — GERENTE tenta DELETE direto (fecha bypass DELETE+INSERT)
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_delete_direto$
DECLARE
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000005';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    DELETE FROM public.estoque WHERE produto_id = v_produto;
    RAISE EXCEPTION 'PR1C_FALHOU: GERENTE conseguiu DELETE direto em estoque';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 4 OK: DELETE direto negado por grant (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_delete_direto$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo 2 — GERENTE consegue excluir a linha via RPC dedicada
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_delete_via_rpc$
DECLARE
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000005';
  v_linhas int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  PERFORM public.excluir_linha_estoque_produto(v_produto, NULL);

  RESET ROLE;

  SELECT count(*) INTO v_linhas FROM public.estoque WHERE produto_id = v_produto;
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'PR1C_FALHOU: excluir_linha_estoque_produto não removeu a linha (restam=%)', v_linhas;
  END IF;

  RAISE NOTICE 'Positivo 2 OK: excluir_linha_estoque_produto (RPC) remove a linha normalmente.';
END
$pos_delete_via_rpc$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 5 — GERENTE de OUTRA loja não consegue excluir via RPC
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_delete_rpc_outra_loja$
DECLARE
  v_gerente_outro uuid := 'f000000b-0000-4000-8000-0000000000ff';
  v_loja_outra uuid := 'f000000b-0000-4000-8000-0000000000fe';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000004';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente_outro) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja_outra, 'PR1C Loja Outra', 'PR1C-FE', true)
    ON CONFLICT (id) DO UPDATE SET ativo = true;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id, idioma_preferido)
    VALUES (v_gerente_outro, 'PR1C Gerente Outro', 'GERENTE', true, v_loja_outra, 'pt')
    ON CONFLICT (id) DO UPDATE SET perfil = 'GERENTE', ativo = true, loja_id = v_loja_outra;

  PERFORM set_config('request.jwt.claim.sub', v_gerente_outro::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.excluir_linha_estoque_produto(v_produto, NULL);
    RAISE EXCEPTION 'PR1C_FALHOU: GERENTE de outra loja excluiu estoque via RPC';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'EXCLUIR_ESTOQUE_LOJA_INVALIDA%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo 5 OK: RPC nega exclusão cross-loja (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_delete_rpc_outra_loja$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo 3 — fluxo legítimo (ajustar_estoque_manual, SECURITY DEFINER)
-- continua fazendo UPDATE de quantidade_atual normalmente
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_fluxo_legitimo$
DECLARE
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000004';
  v_depois numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  SET LOCAL ROLE service_role;

  PERFORM public.ajustar_estoque_manual(
    p_produto_id => v_produto,
    p_loja_id => v_loja,
    p_quantidade_atual => 80,
    p_estoque_minimo => 0,
    p_motivo_codigo => 'ACERTO_INVENTARIO',
    p_observacao => NULL,
    p_ator_id => v_gerente
  );

  RESET ROLE;

  SELECT quantidade_atual INTO v_depois FROM public.estoque WHERE produto_id = v_produto AND loja_id = v_loja;

  IF v_depois <> 80 THEN
    RAISE EXCEPTION 'PR1C_FALHOU: ajustar_estoque_manual não atualizou quantidade_atual (valor=%)', v_depois;
  END IF;

  RAISE NOTICE 'Positivo 3 OK: ajustar_estoque_manual (SECURITY DEFINER) atualizou quantidade_atual para %.', v_depois;
END
$pos_fluxo_legitimo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 3 — CHECK constraint bloqueia negativo mesmo bypassando
-- grant/RLS (como postgres/owner faria)
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_check_negativo$
DECLARE
  v_produto uuid := 'f000000b-0000-4000-8000-000000000004';
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
BEGIN
  BEGIN
    UPDATE public.estoque SET quantidade_atual = -1 WHERE produto_id = v_produto AND loja_id = v_loja;
    RAISE EXCEPTION 'PR1C_FALHOU: CHECK constraint não bloqueou quantidade_atual negativa (rodando como owner)';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'Negativo 3 OK: CHECK constraint bloqueou quantidade negativa mesmo como owner (%).', SQLERRM;
  END;
END
$neg_check_negativo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 6 — CHECK constraint bloqueia NaN mesmo bypassando grant/RLS
-- (numeric NaN >= 0 é true no Postgres — achado de review pós-merge)
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_check_nan$
DECLARE
  v_produto uuid := 'f000000b-0000-4000-8000-000000000004';
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
BEGIN
  BEGIN
    UPDATE public.estoque SET quantidade_atual = 'NaN'::numeric WHERE produto_id = v_produto AND loja_id = v_loja;
    RAISE EXCEPTION 'PR1C_FALHOU: CHECK constraint não bloqueou quantidade_atual = NaN (rodando como owner)';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'Negativo 6 OK: CHECK constraint bloqueou NaN mesmo como owner (%).', SQLERRM;
  END;
END
$neg_check_nan$;

SELECT 'PR-1C ESTOQUE QUANTIDADE PROTECAO: OK' AS resultado;
ROLLBACK;
