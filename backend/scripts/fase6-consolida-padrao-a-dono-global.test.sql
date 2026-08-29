-- Jīn Lóng — plano de remediação, PR2 (Fase 6): consolida DONO no mesmo
-- escopo de ADMIN (Padrão A) em ajustar_estoque_manual,
-- atualizar_produto_com_faixa_atacado e na policy de precos_atacado.
--
-- Prova, para cada uma das 3 superfícies: GERENTE de uma loja continua
-- bloqueado ao mexer em outra loja; DONO (e ADMIN, sanity check) agora
-- consegue, onde antes não conseguia. Dados sintéticos, tudo dentro de uma
-- transação com ROLLBACK — não persiste nada em produção.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja_a     uuid := 'a0000001-0000-4000-8000-000000000001';
  v_loja_b     uuid := 'a0000001-0000-4000-8000-000000000002';
  v_gerente_a  uuid := 'a0000002-0000-4000-8000-000000000001';
  v_dono       uuid := 'a0000002-0000-4000-8000-000000000002';
  v_admin      uuid := 'a0000002-0000-4000-8000-000000000003';
  v_categoria  uuid := 'a0000003-0000-4000-8000-000000000001';
  v_produto_a  uuid := 'a0000004-0000-4000-8000-000000000001';
  v_produto_b  uuid := 'a0000004-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente_a), (v_dono), (v_admin) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja_a, 'Fase6 Loja A', 'FASE6-A', true),
    (v_loja_b, 'Fase6 Loja B', 'FASE6-B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_gerente_a, 'Fase6 Gerente A', 'GERENTE', true, v_loja_a),
    (v_dono, 'Fase6 Dono', 'DONO', true, v_loja_a),
    (v_admin, 'Fase6 Admin', 'ADMIN', true, v_loja_a)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'Fase6 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  -- Produtos com preco_varejo folgado acima do custo (trg_fn_produtos_margem).
  INSERT INTO public.produtos (
    id, codigo_barras, nome, categoria_id, preco_varejo, preco_custo,
    origem, tem_nf, ativo, status_publicacao, loja_id
  ) VALUES
    (v_produto_a, '7899999991001', 'Fase6 Produto A', v_categoria, 200.00, 50.00, 'brasil_nf', true, true, 'PUBLICADO', v_loja_a),
    (v_produto_b, '7899999991002', 'Fase6 Produto B', v_categoria, 200.00, 50.00, 'brasil_nf', true, true, 'PUBLICADO', v_loja_b)
  ON CONFLICT (id) DO UPDATE SET
    preco_varejo = 200.00, preco_custo = 50.00, ativo = true, status_publicacao = 'PUBLICADO', loja_id = EXCLUDED.loja_id;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version) VALUES
    (v_produto_a, v_loja_a, 10, 0, 0),
    (v_produto_b, v_loja_b, 10, 0, 0)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 10, version = public.estoque.version + 1;

  DELETE FROM public.precos_atacado WHERE produto_id IN (v_produto_a, v_produto_b);
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ajustar_estoque_manual — GERENTE bloqueado fora da própria loja; DONO e
--    ADMIN conseguem (Padrão A).
-- ═══════════════════════════════════════════════════════════════════════════

DO $ajuste$
DECLARE
  v_loja_b    uuid := 'a0000001-0000-4000-8000-000000000002';
  v_gerente_a uuid := 'a0000002-0000-4000-8000-000000000001';
  v_dono      uuid := 'a0000002-0000-4000-8000-000000000002';
  v_admin     uuid := 'a0000002-0000-4000-8000-000000000003';
  v_produto_b uuid := 'a0000004-0000-4000-8000-000000000002';
  v_falhou    boolean := false;
BEGIN
  -- GERENTE de A tentando ajustar estoque de produto da loja B: continua recusado.
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  BEGIN
    PERFORM public.ajustar_estoque_manual(v_produto_b, v_loja_b, 20, 0, 'ACERTO_INVENTARIO', null, null);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'AJUSTE_ESTOQUE_LOJA_INVALIDA' THEN v_falhou := true;
    ELSE RAISE EXCEPTION 'FASE6_FALHOU: GERENTE cross-loja recebeu erro inesperado em ajustar_estoque_manual: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'FASE6_FALHOU (BLOCKER): GERENTE de outra loja conseguiu ajustar estoque cross-loja — Padrão A quebrado.';
  END IF;

  -- DONO (Padrão A, novo comportamento): consegue ajustar estoque de loja que não é a sua.
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  PERFORM public.ajustar_estoque_manual(v_produto_b, v_loja_b, 25, 0, 'ACERTO_INVENTARIO', null, null);
  PERFORM 1 FROM public.estoque WHERE produto_id = v_produto_b AND loja_id = v_loja_b AND quantidade_atual = 25;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FASE6_FALHOU: DONO deveria ter conseguido ajustar estoque cross-loja (Padrão A).';
  END IF;

  -- ADMIN (sanity — já era global antes, continua): mesmo teste.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.ajustar_estoque_manual(v_produto_b, v_loja_b, 30, 0, 'ACERTO_INVENTARIO', null, null);
  PERFORM 1 FROM public.estoque WHERE produto_id = v_produto_b AND loja_id = v_loja_b AND quantidade_atual = 30;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FASE6_FALHOU: ADMIN deveria continuar conseguindo ajustar estoque cross-loja.';
  END IF;

  RAISE NOTICE 'Passo 1 OK: ajustar_estoque_manual — GERENTE bloqueado, DONO e ADMIN globais.';
END
$ajuste$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) atualizar_produto_com_faixa_atacado — mesma prova.
-- ═══════════════════════════════════════════════════════════════════════════

DO $produto$
DECLARE
  v_gerente_a uuid := 'a0000002-0000-4000-8000-000000000001';
  v_dono      uuid := 'a0000002-0000-4000-8000-000000000002';
  v_produto_b uuid := 'a0000004-0000-4000-8000-000000000002';
  v_falhou    boolean := false;
  v_nome      text;
BEGIN
  -- GERENTE de A tentando editar produto da loja B: continua recusado (mesma
  -- mensagem de "não encontrado", não vaza existência de produto alheio).
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  BEGIN
    PERFORM public.atualizar_produto_com_faixa_atacado(
      v_produto_b, jsonb_build_object('nome', 'Tentativa GERENTE cross-loja'), null, null
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO' THEN v_falhou := true;
    ELSE RAISE EXCEPTION 'FASE6_FALHOU: GERENTE cross-loja recebeu erro inesperado em atualizar_produto_com_faixa_atacado: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'FASE6_FALHOU (BLOCKER): GERENTE de outra loja conseguiu editar produto cross-loja — Padrão A quebrado.';
  END IF;

  SELECT nome INTO v_nome FROM public.produtos WHERE id = v_produto_b;
  IF v_nome <> 'Fase6 Produto B' THEN
    RAISE EXCEPTION 'FASE6_FALHOU: produto B foi alterado apesar da tentativa do GERENTE ter sido recusada (nome=%).', v_nome;
  END IF;

  -- DONO (Padrão A, novo comportamento): consegue editar produto de outra loja.
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  PERFORM public.atualizar_produto_com_faixa_atacado(
    v_produto_b, jsonb_build_object('nome', 'Fase6 Produto B (editado por DONO)'), null, null
  );
  SELECT nome INTO v_nome FROM public.produtos WHERE id = v_produto_b;
  IF v_nome <> 'Fase6 Produto B (editado por DONO)' THEN
    RAISE EXCEPTION 'FASE6_FALHOU: DONO deveria ter conseguido editar produto cross-loja (Padrão A), nome ficou %.', v_nome;
  END IF;

  RAISE NOTICE 'Passo 2 OK: atualizar_produto_com_faixa_atacado — GERENTE bloqueado, DONO global.';
END
$produto$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) precos_atacado — RLS agora escopada por loja. GERENTE só mexe na
--    própria loja e não pode criar/editar faixa GLOBAL (loja_id NULL);
--    consegue ENXERGAR uma faixa global (USING), só não escrever nela
--    (WITH CHECK). DONO cria faixa global e faixa de outra loja.
-- ═══════════════════════════════════════════════════════════════════════════

DO $precos$
DECLARE
  v_loja_a    uuid := 'a0000001-0000-4000-8000-000000000001';
  v_loja_b    uuid := 'a0000001-0000-4000-8000-000000000002';
  v_gerente_a uuid := 'a0000002-0000-4000-8000-000000000001';
  v_dono      uuid := 'a0000002-0000-4000-8000-000000000002';
  v_produto_a uuid := 'a0000004-0000-4000-8000-000000000001';
  v_falhou_cross boolean := false;
  v_falhou_global boolean := false;
  v_visiveis  int;
  v_id_global uuid;
BEGIN
  -- RLS não se aplica à sessão de teste por padrão: este script conecta como
  -- superuser (postgres via psql -U postgres), que tem BYPASSRLS embutido.
  -- set_config('request.jwt.claim.sub', ...) sozinho (usado nos passos 1-2,
  -- que testam guards DENTRO de funções SECURITY DEFINER) não basta para
  -- policies de tabela crua — é preciso também assumir a ROLE authenticated
  -- de verdade (SET LOCAL ROLE), mesmo padrão já usado em
  -- fase1-hardening-grants-residuais.test.sql:153-162. Sem isto, TODO INSERT
  -- abaixo teria sucesso independente da policy, e o teste provaria nada.

  -- DONO cria uma faixa GLOBAL (loja_id NULL) para o produto A.
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
  VALUES (v_produto_a, 5, 180.00, NULL, true)
  RETURNING id INTO v_id_global;
  RESET ROLE;

  -- GERENTE de A consegue ENXERGAR a faixa global (USING permite leitura).
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_visiveis FROM public.precos_atacado WHERE id = v_id_global;
  IF v_visiveis <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'FASE6_FALHOU: GERENTE deveria conseguir ENXERGAR a faixa global (USING), viu % linha(s).', v_visiveis;
  END IF;

  -- GERENTE de A tentando criar faixa para a loja B (cross-loja): recusado pela RLS.
  BEGIN
    INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
    VALUES (v_produto_a, 10, 170.00, v_loja_b, true);
  EXCEPTION WHEN OTHERS THEN
    v_falhou_cross := true;
  END;
  IF NOT v_falhou_cross THEN
    RESET ROLE;
    RAISE EXCEPTION 'FASE6_FALHOU (BLOCKER): GERENTE conseguiu criar faixa de precos_atacado para OUTRA loja — RLS sem isolamento.';
  END IF;

  -- GERENTE de A tentando criar faixa GLOBAL (loja_id NULL): recusado — só
  -- DONO/ADMIN podem afetar todas as lojas de uma vez.
  BEGIN
    INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
    VALUES (v_produto_a, 15, 160.00, NULL, true);
  EXCEPTION WHEN OTHERS THEN
    v_falhou_global := true;
  END;
  IF NOT v_falhou_global THEN
    RESET ROLE;
    RAISE EXCEPTION 'FASE6_FALHOU (BLOCKER): GERENTE conseguiu criar faixa GLOBAL (loja_id NULL) de precos_atacado.';
  END IF;

  -- GERENTE de A consegue criar faixa da PRÓPRIA loja.
  INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
  VALUES (v_produto_a, 20, 150.00, v_loja_a, true);

  RESET ROLE;

  PERFORM 1 FROM public.precos_atacado WHERE produto_id = v_produto_a AND loja_id = v_loja_a AND quantidade_minima = 20;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FASE6_FALHOU: GERENTE deveria ter conseguido criar faixa da própria loja.';
  END IF;

  RAISE NOTICE 'Passo 3 OK: precos_atacado — GERENTE vê global mas só escreve na própria loja; DONO cria faixa global.';
END
$precos$;

DO $resumo$
BEGIN
  RAISE NOTICE 'FASE6 (PR2) — todos os passos OK: ajustar_estoque_manual, atualizar_produto_com_faixa_atacado e precos_atacado convergidos ao Padrão A (GERENTE restrito, DONO/ADMIN globais).';
END
$resumo$;

ROLLBACK;
