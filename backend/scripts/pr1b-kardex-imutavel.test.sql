-- PR-1B — regressão de 20260903190000_kardex_estoque_log_imutavel.sql
-- (achado P0 #2 da auditoria Jīn Lóng: movimentos_estoque_log editável/
-- apagável via API apesar de descrito como imutável).
--
-- Prova, com dados sintéticos (1 loja, 1 GERENTE, 1 ADMIN, 1 produto), os
-- cenários exigidos:
--   1. GERENTE UPDATE no kardex -> NEGADO.
--   2. GERENTE DELETE no kardex -> NEGADO.
--   3. ADMIN UPDATE/DELETE no kardex -> NEGADO.
--   4. service_role também não consegue UPDATE/DELETE (bloqueado pelo
--      trigger, não pelo grant — grant não foi tocado para este papel).
--   5. GERENTE INSERT direto (fora de RPC) -> NEGADO (nenhum caminho
--      legítimo de app insere direto; só RPC SECURITY DEFINER).
--   6. Fluxo legítimo (ajustar_estoque_manual, SECURITY DEFINER, chamado
--      como service_role real — sem JWT — com p_ator_id explícito) continua
--      gravando movimento novo normalmente.
-- E confirma que a linha semente não foi alterada por nenhuma tentativa.
--
-- Mesmo padrão de `PERFORM set_config(...); SET LOCAL ROLE ...;` usado em
-- pr1a-usuarios-perfil-grant-coluna.test.sql e
-- fase3-tenant-isolation-transferencias-remessas.test.sql. Tudo dentro de
-- uma transação com ROLLBACK final — nada persiste.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'f000000a-0000-4000-8000-00000000000a';
  v_gerente uuid := 'f000000a-0000-4000-8000-00000000000b';
  v_admin uuid := 'f000000a-0000-4000-8000-00000000000c';
  v_categoria uuid := 'f000000a-0000-4000-8000-000000000003';
  v_produto uuid := 'f000000a-0000-4000-8000-000000000004';
  v_seed_movimento uuid := 'f000000a-0000-4000-8000-000000000005';
  v_tipo_codigo text;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente), (v_admin)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja, 'PR1B Loja', 'PR1B-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id, idioma_preferido) VALUES
    (v_gerente, 'PR1B Gerente', 'GERENTE', true, v_loja, 'pt'),
    (v_admin, 'PR1B Admin', 'ADMIN', true, v_loja, 'pt')
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'PR1B Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto, '7899999990099', 'PR1B Produto', v_categoria, 10.00, 'china_manual', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto, v_loja, 100, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE SET quantidade_atual = 100;

  -- Semente: uma linha de kardex já gravada, para atacar nos negativos.
  SELECT codigo INTO v_tipo_codigo FROM public.tipos_movimento_estoque LIMIT 1;
  INSERT INTO public.movimentos_estoque_log
    (id, loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao)
  VALUES (v_seed_movimento, v_loja, v_produto, v_tipo_codigo, 1, v_gerente, 'PR1B semente')
  ON CONFLICT (id) DO UPDATE SET observacao = 'PR1B semente';
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1 — GERENTE tenta UPDATE na linha semente
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_gerente_update$
DECLARE
  v_gerente uuid := 'f000000a-0000-4000-8000-00000000000b';
  v_seed uuid := 'f000000a-0000-4000-8000-000000000005';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.movimentos_estoque_log SET quantidade_delta = 999 WHERE id = v_seed;
    RAISE EXCEPTION 'PR1B_FALHOU: GERENTE conseguiu UPDATE no kardex';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 1 OK: GERENTE UPDATE negado por grant (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_gerente_update$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 2 — GERENTE tenta DELETE na linha semente
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_gerente_delete$
DECLARE
  v_gerente uuid := 'f000000a-0000-4000-8000-00000000000b';
  v_seed uuid := 'f000000a-0000-4000-8000-000000000005';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    DELETE FROM public.movimentos_estoque_log WHERE id = v_seed;
    RAISE EXCEPTION 'PR1B_FALHOU: GERENTE conseguiu DELETE no kardex';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 2 OK: GERENTE DELETE negado por grant (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_gerente_delete$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 3 — ADMIN tenta UPDATE e DELETE na linha semente
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_admin$
DECLARE
  v_admin uuid := 'f000000a-0000-4000-8000-00000000000c';
  v_seed uuid := 'f000000a-0000-4000-8000-000000000005';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.movimentos_estoque_log SET quantidade_delta = 999 WHERE id = v_seed;
    RAISE EXCEPTION 'PR1B_FALHOU: ADMIN conseguiu UPDATE no kardex';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 3a OK: ADMIN UPDATE negado por grant (%).', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.movimentos_estoque_log WHERE id = v_seed;
    RAISE EXCEPTION 'PR1B_FALHOU: ADMIN conseguiu DELETE no kardex';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 3b OK: ADMIN DELETE negado por grant (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_admin$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 4 — service_role tenta UPDATE/DELETE: grant não foi tocado para
-- este papel, então quem barra aqui é o TRIGGER (defesa em profundidade),
-- não o grant. Prova que a segunda camada funciona de verdade.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_service_role$
DECLARE
  v_seed uuid := 'f000000a-0000-4000-8000-000000000005';
BEGIN
  SET LOCAL ROLE service_role;

  BEGIN
    UPDATE public.movimentos_estoque_log SET quantidade_delta = 999 WHERE id = v_seed;
    RAISE EXCEPTION 'PR1B_FALHOU: service_role conseguiu UPDATE no kardex';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'MOVIMENTOS_ESTOQUE_LOG_IMUTAVEL%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo 4a OK: service_role UPDATE negado pelo trigger (%).', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.movimentos_estoque_log WHERE id = v_seed;
    RAISE EXCEPTION 'PR1B_FALHOU: service_role conseguiu DELETE no kardex';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'MOVIMENTOS_ESTOQUE_LOG_IMUTAVEL%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo 4b OK: service_role DELETE negado pelo trigger (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_service_role$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 5 — GERENTE tenta INSERT direto (fora de qualquer RPC): também
-- passa a ser negado, já que nenhum caminho legítimo de app faz isso (todo
-- INSERT real ocorre dentro de RPC SECURITY DEFINER, que roda como owner e
-- não depende deste grant).
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_gerente_insert_direto$
DECLARE
  v_gerente uuid := 'f000000a-0000-4000-8000-00000000000b';
  v_loja uuid := 'f000000a-0000-4000-8000-00000000000a';
  v_produto uuid := 'f000000a-0000-4000-8000-000000000004';
  v_tipo_codigo text;
BEGIN
  SELECT codigo INTO v_tipo_codigo FROM public.tipos_movimento_estoque LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.movimentos_estoque_log
      (loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao)
    VALUES (v_loja, v_produto, v_tipo_codigo, 12345, v_gerente, 'PR1B tentativa de forjar kardex');
    RAISE EXCEPTION 'PR1B_FALHOU: GERENTE conseguiu INSERT direto no kardex (forjando movimento sem passar por RPC)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 5 OK: GERENTE INSERT direto negado por grant (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_gerente_insert_direto$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo — fluxo legítimo (ajustar_estoque_manual, SECURITY DEFINER)
-- continua gravando um movimento novo normalmente
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_fluxo_legitimo$
DECLARE
  v_gerente uuid := 'f000000a-0000-4000-8000-00000000000b';
  v_loja uuid := 'f000000a-0000-4000-8000-00000000000a';
  v_produto uuid := 'f000000a-0000-4000-8000-000000000004';
  v_antes int;
  v_depois int;
BEGIN
  SELECT count(*) INTO v_antes FROM public.movimentos_estoque_log WHERE produto_id = v_produto;

  -- ajustar_estoque_manual_seguro (snapshot obrigatório desde 20261005224553).
  -- Clientes antigos (7 args) falham fechados; o app usa _seguro via service_role.
  --
  -- set_config(..., true) com is_local=true dura até o FIM DA TRANSAÇÃO, não
  -- só do statement — RESET ROLE muda o papel, mas não limpa
  -- request.jwt.claim.sub setado no bloco $neg_admin$ acima. Sem limpar
  -- aqui, auth.uid() ainda resolveria para o ADMIN e COALESCE(auth.uid(),
  -- p_ator_id) nunca chegaria a usar p_ator_id — o teste não estaria
  -- exercitando o caminho real de produção (service_role sem JWT).
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  SET LOCAL ROLE service_role;

  PERFORM public.ajustar_estoque_manual_seguro(
    p_produto_id => v_produto,
    p_loja_id => v_loja,
    p_quantidade_atual => 90,
    p_estoque_minimo => 0,
    p_motivo_codigo => 'ACERTO_INVENTARIO',
    p_observacao => NULL,
    p_ator_id => v_gerente,
    p_quantidade_esperada => 100,
    p_minimo_esperado => 0
  );

  RESET ROLE;

  SELECT count(*) INTO v_depois FROM public.movimentos_estoque_log WHERE produto_id = v_produto;

  IF v_depois <> v_antes + 1 THEN
    RAISE EXCEPTION 'PR1B_FALHOU: ajustar_estoque_manual_seguro não gravou movimento novo (antes=%, depois=%)', v_antes, v_depois;
  END IF;

  RAISE NOTICE 'Positivo OK: ajustar_estoque_manual_seguro gravou 1 movimento novo no kardex (antes=%, depois=%).', v_antes, v_depois;
END
$pos_fluxo_legitimo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Defesa em profundidade — a linha semente não mudou em nenhuma tentativa
-- ═══════════════════════════════════════════════════════════════════════════

DO $confirma_semente_intocada$
DECLARE
  v_seed uuid := 'f000000a-0000-4000-8000-000000000005';
  v_delta numeric;
  v_obs text;
BEGIN
  SELECT quantidade_delta, observacao INTO v_delta, v_obs
  FROM public.movimentos_estoque_log WHERE id = v_seed;

  IF v_delta IS NULL THEN
    RAISE EXCEPTION 'PR1B_FALHOU: linha semente sumiu (DELETE passou em algum momento)';
  END IF;
  IF v_delta <> 1 OR v_obs <> 'PR1B semente' THEN
    RAISE EXCEPTION 'PR1B_FALHOU: linha semente foi alterada (delta=%, obs=%)', v_delta, v_obs;
  END IF;

  RAISE NOTICE 'Defesa em profundidade OK: linha semente do kardex permanece intocada.';
END
$confirma_semente_intocada$;

SELECT 'PR-1B KARDEX ESTOQUE LOG IMUTAVEL: OK' AS resultado;
ROLLBACK;
