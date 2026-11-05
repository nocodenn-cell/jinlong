-- Jīn Lóng — plano de remediação, PR2 (Fase 6): consolida DONO no mesmo
-- escopo de ADMIN (Padrão A) em ajustar_estoque_manual e
-- atualizar_produto_com_faixa_atacado. precos_atacado NÃO faz parte deste
-- escopo — ver cabeçalho da migration 20260829120000 para o porquê (a
-- feature de atacado do GERENTE sempre escreve loja_id NULL por design;
-- restringi-la quebraria o fluxo existente sem substituto).
--
-- Prova, para cada uma das 2 superfícies: GERENTE de uma loja continua
-- bloqueado ao mexer em outra loja; DONO (e o ex-ADMIN, agora DONO) agora
-- consegue, onde antes não conseguia. Dados sintéticos, tudo dentro de uma
-- transação com ROLLBACK — não persiste nada em produção.

\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.empresas (id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', 'Fixture empresa (suite SQL)') ON CONFLICT (id) DO NOTHING;

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

  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES
    ('fa5e0000-0000-4000-8000-0000000000f1', v_loja_a, 'Fase6 Loja A', 'FASE6-A', true),
    ('fa5e0000-0000-4000-8000-0000000000f1', v_loja_b, 'Fase6 Loja B', 'FASE6-B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_gerente_a, 'Fase6 Gerente A', 'GERENTE', true, v_loja_a),
    (v_dono, 'Fase6 Dono', 'DONO', true, v_loja_a),
    (v_admin, 'Fase6 Ex-Admin (agora DONO)', 'DONO', true, v_loja_a)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  -- Vínculos de empresa (modelo multiempresa): sem eles o usuário não pertence a empresa nenhuma e o guard
  -- de produto nega tudo. DONO = papel de empresa (sem loja), na empresa dos produtos da loja B (fa5e...);
  -- GERENTE = papel restrito à loja A, na empresa real da loja A (a loja já existe na base com outra empresa).
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
  SELECT v.usuario_id, v.empresa_id, v.loja_id, v.papel, true
    FROM (VALUES
      (v_gerente_a, (SELECT l.empresa_id FROM public.lojas l WHERE l.id = v_loja_a), v_loja_a, 'GERENTE'),
      (v_dono, 'fa5e0000-0000-4000-8000-0000000000f1'::uuid, NULL::uuid, 'DONO'),
      (v_admin, 'fa5e0000-0000-4000-8000-0000000000f1'::uuid, NULL::uuid, 'DONO')
    ) AS v(usuario_id, empresa_id, loja_id, papel)
   WHERE NOT EXISTS (
      SELECT 1 FROM public.usuario_vinculos x
       WHERE x.usuario_id = v.usuario_id AND x.empresa_id = v.empresa_id
         AND x.papel = v.papel AND x.ativo
   );

  INSERT INTO public.categorias (empresa_id, id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', v_categoria, 'Fase6 Categoria')
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

-- #623 (20261028110000): o perfil ADMIN foi descontinuado. O usuário que antes era ADMIN
-- vira DONO (o perfil mais amplo que restou) e esta prova garante que ADMIN não volta.
DO $sem_admin$
BEGIN
  BEGIN
    UPDATE public.usuarios SET perfil = 'ADMIN' WHERE id = 'a0000002-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'FASE6_FALHOU: perfil ADMIN ainda pode ser gravado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PERFIL_ADMIN_DESCONTINUADO%' THEN RAISE; END IF;
    RAISE NOTICE 'OK: perfil ADMIN recusado (%).', SQLERRM;
  END;
END
$sem_admin$;

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
    PERFORM public.ajustar_estoque_manual_seguro(
      v_produto_b, v_loja_b, 20, 0, 'ACERTO_INVENTARIO', null, null, 10, 0);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'AJUSTE_ESTOQUE_LOJA_INVALIDA' THEN v_falhou := true;
    ELSE RAISE EXCEPTION 'FASE6_FALHOU: GERENTE cross-loja recebeu erro inesperado em ajustar_estoque_manual_seguro: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'FASE6_FALHOU (BLOCKER): GERENTE de outra loja conseguiu ajustar estoque cross-loja — Padrão A quebrado.';
  END IF;

  -- DONO (Padrão A, novo comportamento): consegue ajustar estoque de loja que não é a sua.
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  PERFORM public.ajustar_estoque_manual_seguro(
    v_produto_b, v_loja_b, 25, 0, 'ACERTO_INVENTARIO', null, null, 10, 0);
  PERFORM 1 FROM public.estoque WHERE produto_id = v_produto_b AND loja_id = v_loja_b AND quantidade_atual = 25;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FASE6_FALHOU: DONO deveria ter conseguido ajustar estoque cross-loja (Padrão A).';
  END IF;

  -- Ex-ADMIN (agora DONO; ADMIN descontinuado no #623): mesmo teste, mesmo resultado esperado.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.ajustar_estoque_manual_seguro(
    v_produto_b, v_loja_b, 30, 0, 'ACERTO_INVENTARIO', null, null, 25, 0);
  PERFORM 1 FROM public.estoque WHERE produto_id = v_produto_b AND loja_id = v_loja_b AND quantidade_atual = 30;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FASE6_FALHOU: o ex-ADMIN (agora DONO) deveria conseguir ajustar estoque cross-loja.';
  END IF;

  RAISE NOTICE 'Passo 1 OK: ajustar_estoque_manual_seguro — GERENTE bloqueado, DONO global (ADMIN descontinuado).';
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
-- 3) ajustar_estoque_manual e atualizar_produto_com_faixa_atacado — conta
--    desativada (usuarios.ativo = false) com JWT ainda válido continua
--    tratada como restrita à própria loja, mesmo sendo DONO/ADMIN. Sem este
--    guard, o Padrão A abriria escopo global para uma conta desativada.
-- ═══════════════════════════════════════════════════════════════════════════

DO $inativo$
DECLARE
  v_loja_a      uuid := 'a0000001-0000-4000-8000-000000000001';
  v_loja_b      uuid := 'a0000001-0000-4000-8000-000000000002';
  v_dono_inativo uuid := 'a0000002-0000-4000-8000-000000000004';
  v_produto_b   uuid := 'a0000004-0000-4000-8000-000000000002';
  v_falhou      boolean := false;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_dono_inativo) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_dono_inativo, 'Fase6 Dono Inativo', 'DONO', false, v_loja_a)
  ON CONFLICT (id) DO UPDATE SET perfil = 'DONO', ativo = false, loja_id = v_loja_a;

  -- DONO desativado tentando ajustar estoque de outra loja: bloqueado.
  PERFORM set_config('request.jwt.claim.sub', v_dono_inativo::text, true);
  BEGIN
    PERFORM public.ajustar_estoque_manual_seguro(
      v_produto_b, v_loja_b, 40, 0, 'ACERTO_INVENTARIO', null, null, 30, 0);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'AJUSTE_ESTOQUE_LOJA_INVALIDA' THEN v_falhou := true;
    ELSE RAISE EXCEPTION 'FASE6_FALHOU: DONO desativado recebeu erro inesperado em ajustar_estoque_manual_seguro: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'FASE6_FALHOU (BLOCKER): DONO desativado conseguiu ajustar estoque cross-loja — regressão de escopo.';
  END IF;

  -- DONO desativado tentando editar produto de outra loja: bloqueado.
  v_falhou := false;
  BEGIN
    PERFORM public.atualizar_produto_com_faixa_atacado(
      v_produto_b, jsonb_build_object('nome', 'Tentativa DONO inativo cross-loja'), null, null
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO' THEN v_falhou := true;
    ELSE RAISE EXCEPTION 'FASE6_FALHOU: DONO desativado recebeu erro inesperado em atualizar_produto_com_faixa_atacado: %', SQLERRM; END IF;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'FASE6_FALHOU (BLOCKER): DONO desativado conseguiu editar produto cross-loja — regressão de escopo.';
  END IF;

  RAISE NOTICE 'Passo 3 OK: DONO/ADMIN desativado continua restrito à própria loja em ambas as funções.';
END
$inativo$;

DO $resumo$
BEGIN
  RAISE NOTICE 'FASE6 (PR2) — todos os passos OK: ajustar_estoque_manual e atualizar_produto_com_faixa_atacado convergidos ao Padrão A (GERENTE restrito, DONO/ADMIN globais quando ativos; contas desativadas permanecem restritas).';
END
$resumo$;

ROLLBACK;
