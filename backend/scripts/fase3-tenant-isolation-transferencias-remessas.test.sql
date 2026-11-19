-- Fase 3 do plano de remediação Jīn Lóng — tenant isolation.
-- Regressão de 20260828140000_fase3_tenant_isolation_transferencias_remessas.sql.
--
-- Prova, com dados sintéticos (3 lojas, 2 GERENTE, 1 DONO), as duas
-- autorizações negativas explicitamente pedidas pela missão:
--   1. GERENTE de uma loja tentando operar recurso de outra loja -> nega.
--   2. RPC chamada com loja_id incompatível com a sessão -> nega.
-- E confirma os dois caminhos positivos que não podem quebrar:
--   3. GERENTE participando da operação pela própria loja -> permite.
--   4. DONO cross-loja -> permite (mesmo padrão de descontos_venda/comissões).
--
-- `auth.uid()` no Supabase lê a claim `request.jwt.claim.sub` da sessão —
-- basta `set_config` para simular o operador ao chamar a RPC SECURITY
-- DEFINER diretamente (mesmo padrão de d0-remessa-conferencia-columns-drift
-- .test.sql). Tudo dentro de uma transação com ROLLBACK — nada persiste.

\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.empresas (id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', 'Fixture empresa (suite SQL)') ON CONFLICT (id) DO NOTHING;

DO $setup$
DECLARE
  v_loja_a uuid := 'f0000001-0000-4000-8000-00000000000a';
  v_loja_b uuid := 'f0000001-0000-4000-8000-00000000000b';
  v_loja_c uuid := 'f0000001-0000-4000-8000-00000000000c';
  v_gerente_a uuid := 'f0000002-0000-4000-8000-00000000000a';
  v_gerente_b uuid := 'f0000002-0000-4000-8000-00000000000b';
  v_dono uuid := 'f0000002-0000-4000-8000-0000000000d0';
  v_categoria uuid := 'f0000003-0000-4000-8000-000000000001';
  v_produto uuid := 'f0000004-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente_a), (v_gerente_b), (v_dono)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES
    ('fa5e0000-0000-4000-8000-0000000000f1', v_loja_a, 'Fase3 Loja A', 'FASE3-A', true),
    ('fa5e0000-0000-4000-8000-0000000000f1', v_loja_b, 'Fase3 Loja B', 'FASE3-B', true),
    ('fa5e0000-0000-4000-8000-0000000000f1', v_loja_c, 'Fase3 Loja C', 'FASE3-C', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_gerente_a, 'Fase3 Gerente A', 'GERENTE', true, v_loja_a),
    (v_gerente_b, 'Fase3 Gerente B', 'GERENTE', true, v_loja_b),
    (v_dono, 'Fase3 Dono', 'DONO', true, v_loja_a)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (empresa_id, id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', v_categoria, 'Fase3 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto, '7899999990001', 'Fase3 Produto', v_categoria, 10.00, 'china_manual', false, true, v_loja_a)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES
    (v_produto, v_loja_a, 100, 0),
    (v_produto, v_loja_b, 100, 0),
    (v_produto, v_loja_c, 100, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE SET quantidade_atual = 100;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1 — GERENTE loja A tenta transferir entre loja B e loja C
-- (nenhuma das duas é a dele) -> TRANSFERENCIA_LOJA_INVALIDA
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_transferencia_gerente_fora$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f0000002-0000-4000-8000-00000000000a', true);
  BEGIN
    PERFORM public.transferir_estoque_seguro(
      'f0000001-0000-4000-8000-00000000000b'::uuid,
      'f0000001-0000-4000-8000-00000000000c'::uuid,
      'f0000004-0000-4000-8000-000000000001'::uuid,
      1, NULL, 'fase3-neg-transferencia-' || gen_random_uuid()::text, NULL
    );
    RAISE EXCEPTION 'FASE3_FALHOU: GERENTE de loja A conseguiu transferir entre lojas B e C';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'TRANSFERENCIA_LOJA_INVALIDA%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo 1 OK: GERENTE fora das lojas envolvidas foi negado (%).', SQLERRM;
  END;
END
$neg_transferencia_gerente_fora$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo — GERENTE loja A transfere de A para B (participa pela origem) -> OK
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_transferencia_gerente_participa$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f0000002-0000-4000-8000-00000000000a', true);
  v_id := public.transferir_estoque_seguro(
    'f0000001-0000-4000-8000-00000000000a'::uuid,
    'f0000001-0000-4000-8000-00000000000b'::uuid,
    'f0000004-0000-4000-8000-000000000001'::uuid,
    1, NULL, 'fase3-pos-transferencia-' || gen_random_uuid()::text, NULL
  );
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FASE3_FALHOU: GERENTE participando da transferência (origem própria) foi negado';
  END IF;
  RAISE NOTICE 'Positivo OK: GERENTE da loja de origem conseguiu transferir.';
END
$pos_transferencia_gerente_participa$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo — DONO transfere entre B e C (nenhuma das duas é a dele: loja A) -> OK
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_transferencia_dono_cross_loja$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f0000002-0000-4000-8000-0000000000d0', true);
  v_id := public.transferir_estoque_seguro(
    'f0000001-0000-4000-8000-00000000000b'::uuid,
    'f0000001-0000-4000-8000-00000000000c'::uuid,
    'f0000004-0000-4000-8000-000000000001'::uuid,
    1, NULL, 'fase3-pos-dono-' || gen_random_uuid()::text, NULL
  );
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FASE3_FALHOU: DONO cross-loja foi negado (deveria ser permitido)';
  END IF;
  RAISE NOTICE 'Positivo OK: DONO cross-loja conseguiu transferir (padrão descontos_venda/comissões).';
END
$pos_transferencia_dono_cross_loja$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Legado transferir_estoque_entre_lojas — sem EXECUTE para a API (SEC-06,
-- 20260916120200). A guarda de tenant é provada acima na função canônica.
-- ═══════════════════════════════════════════════════════════════════════════

DO $legado_sem_execute$
DECLARE
  v_legado regprocedure := to_regprocedure('public.transferir_estoque_entre_lojas(uuid,uuid,uuid,numeric,text)');
BEGIN
  IF v_legado IS NOT NULL AND (
       has_function_privilege('authenticated', v_legado, 'EXECUTE')
    OR has_function_privilege('anon', v_legado, 'EXECUTE')
    OR has_function_privilege('service_role', v_legado, 'EXECUTE')) THEN
    RAISE EXCEPTION 'FASE3_FALHOU: transferir_estoque_entre_lojas (legado) ainda executável pela API';
  END IF;
  RAISE NOTICE 'Legado OK: transferir_estoque_entre_lojas sem EXECUTE para anon/authenticated/service_role.';
END
$legado_sem_execute$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Remessa: cria 2 remessas CONFERIDO (loja B) para os testes de
-- confirmar_remessa_entrada. Onda B (20260801120000_recebimento_
-- conferencia_explicita.sql) exige status CONFERIDO/DIVERGENTE e todos os
-- itens já contados — EM_CONFERENCIA não é mais aceito diretamente.
-- ═══════════════════════════════════════════════════════════════════════════

DO $setup_remessas$
DECLARE
  v_loja_b uuid := 'f0000001-0000-4000-8000-00000000000b';
  v_gerente_b uuid := 'f0000002-0000-4000-8000-00000000000b';
  v_produto uuid := 'f0000004-0000-4000-8000-000000000001';
  v_remessa_1 uuid := 'f0000005-0000-4000-8000-000000000001';
  v_remessa_2 uuid := 'f0000005-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.remessas (id, loja_id, origem_descricao, status, created_by) VALUES
    (v_remessa_1, v_loja_b, 'Fase3 remessa 1', 'CONFERIDO', v_gerente_b),
    (v_remessa_2, v_loja_b, 'Fase3 remessa 2', 'CONFERIDO', v_gerente_b)
  ON CONFLICT (id) DO UPDATE SET status = 'CONFERIDO';

  INSERT INTO public.remessa_itens (remessa_id, produto_id, quantidade_esperada, quantidade_conferida) VALUES
    (v_remessa_1, v_produto, 5, 5),
    (v_remessa_2, v_produto, 5, 5)
  ON CONFLICT DO NOTHING;
END
$setup_remessas$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 2 — GERENTE de loja A tenta confirmar remessa da loja B -> REMESSA_LOJA_INVALIDA
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_remessa_gerente_outra_loja$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f0000002-0000-4000-8000-00000000000a', true);
  BEGIN
    PERFORM public.confirmar_remessa_entrada('f0000005-0000-4000-8000-000000000001'::uuid);
    RAISE EXCEPTION 'FASE3_FALHOU: GERENTE de loja A confirmou remessa da loja B';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'REMESSA_LOJA_INVALIDA%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo 2 OK: GERENTE de outra loja foi negado ao confirmar remessa (%).', SQLERRM;
  END;
END
$neg_remessa_gerente_outra_loja$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo — GERENTE da própria loja confirma a remessa -> OK
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_remessa_gerente_propria_loja$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f0000002-0000-4000-8000-00000000000b', true);
  PERFORM public.confirmar_remessa_entrada('f0000005-0000-4000-8000-000000000001'::uuid);

  IF NOT EXISTS (
    SELECT 1 FROM public.remessas WHERE id = 'f0000005-0000-4000-8000-000000000001'::uuid AND status = 'CONCLUIDA'
  ) THEN
    RAISE EXCEPTION 'FASE3_FALHOU: remessa não foi concluída pelo GERENTE da própria loja';
  END IF;
  RAISE NOTICE 'Positivo OK: GERENTE da própria loja confirmou a remessa.';
END
$pos_remessa_gerente_propria_loja$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo — DONO (loja A) confirma remessa da loja B -> OK (cross-loja permitido)
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_remessa_dono_cross_loja$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f0000002-0000-4000-8000-0000000000d0', true);
  PERFORM public.confirmar_remessa_entrada('f0000005-0000-4000-8000-000000000002'::uuid);

  IF NOT EXISTS (
    SELECT 1 FROM public.remessas WHERE id = 'f0000005-0000-4000-8000-000000000002'::uuid AND status = 'CONCLUIDA'
  ) THEN
    RAISE EXCEPTION 'FASE3_FALHOU: DONO cross-loja não conseguiu confirmar remessa da loja B';
  END IF;
  RAISE NOTICE 'Positivo OK: DONO cross-loja confirmou remessa da loja B.';
END
$pos_remessa_dono_cross_loja$;

SELECT 'FASE3 TENANT ISOLATION TRANSFERENCIAS/REMESSAS: OK' AS resultado;
ROLLBACK;
