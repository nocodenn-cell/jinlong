-- Gate de Convergência A04-4.1 / A04-4.2 — invariante "todo tier de atacado
-- ativo é menor que o varejo" nos dois sentidos de escrita.
--
-- A04-4.1 (criação/edição do tier com preço >= varejo) já era bloqueada pela
-- trigger trg_validar_tier_preco_menor_que_varejo (20260901000000) — este
-- teste reconfirma que continua bloqueada (regressão, não achado novo).
--
-- A04-4.2 (achado provado em produção via BEGIN...ROLLBACK): baixar
-- produtos.preco_varejo para um valor <= um tier ATIVO existente era
-- ACEITO sem erro, deixando `calcular_preco_produto` devolver um preço de
-- "atacado" maior que o varejo. Corrigido por
-- 20260902100100_guard_varejo_menor_que_tier_ativo.sql.
--
-- A trigger é CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED (achado
-- do gate de revisão pré-commit, não do gate original): o writer real
-- `atualizar_produto_com_faixa_atacado` atualiza produtos.preco_varejo e
-- depois precos_atacado na MESMA transação — uma trigger BEFORE simples
-- rejeitaria o primeiro UPDATE mesmo quando o estado final é válido. Por
-- ser deferida, os testes abaixo usam `SET CONSTRAINTS ... IMMEDIATE` no
-- ponto em que, numa chamada real, a transação faria commit.
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'f1000001-0000-4000-8000-000000000001';
  v_categoria uuid := 'f1000003-0000-4000-8000-000000000001';
  v_produto uuid := 'f1000004-0000-4000-8000-000000000001';
  v_produto_multi uuid := 'f1000004-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja, 'GateA04 Loja', 'GATEA04', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'GateA04 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto, '7899999990020', 'GateA04 Produto', v_categoria, 100.00, 10.00, 'brasil_nf', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id, preco_varejo = 100.00, preco_custo = 10.00;
  DELETE FROM public.precos_atacado WHERE produto_id = v_produto;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto_multi, '7899999990021', 'GateA04 Produto MultiStep', v_categoria, 100.00, 10.00, 'brasil_nf', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id, preco_varejo = 100.00, preco_custo = 10.00;
  DELETE FROM public.precos_atacado WHERE produto_id = v_produto_multi;
END
$setup$;

DO $gate_a04$
DECLARE
  v_produto uuid := 'f1000004-0000-4000-8000-000000000001';
  v_calc jsonb;
  v_varejo_final numeric;
  v_tier_ativo boolean;
BEGIN
  -- A04-4.1 (regressão): criar tier com preço >= varejo é rejeitado (trigger
  -- não-deferrable de 20260901000000, checagem é imediata de verdade).
  BEGIN
    INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, ativo)
    VALUES (v_produto, 20, 110, true);
    RAISE EXCEPTION 'GATE_A04_FALHOU: criar tier(110) >= varejo(100) foi aceito — A04-4.1 reaberto';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'TIER_PRECO_MAIOR_OU_IGUAL_VAREJO%' THEN RAISE; END IF;
      RAISE NOTICE 'A04-4.1 OK: tier >= varejo continua rejeitado na criação (%).', SQLERRM;
  END;

  -- Tier legítimo: qtd>=10 a 90 (< varejo 100).
  INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, ativo)
  VALUES (v_produto, 10, 90, true);

  -- A04-4.2: baixar o varejo para 80 (< tier ativo de 90), SOZINHO na
  -- transação (o caso comum de edição rápida só do varejo) deve ser
  -- rejeitado. SET CONSTRAINTS ... IMMEDIATE simula o commit dessa
  -- transação isolada — é exatamente quando a checagem deferida dispara
  -- numa chamada real de uma única RPC.
  BEGIN
    UPDATE public.produtos SET preco_varejo = 80 WHERE id = v_produto;
    SET CONSTRAINTS trg_validar_varejo_maior_que_tiers_ativos IMMEDIATE;
    RAISE EXCEPTION 'GATE_A04_FALHOU: baixar varejo para 80 (sozinho) com tier ativo em 90 foi aceito — A04-4.2 reaberto';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'VAREJO_MENOR_OU_IGUAL_TIER_ATIVO%' THEN RAISE; END IF;
      RAISE NOTICE 'A04-4.2 OK: baixar varejo sozinho abaixo de um tier ativo foi rejeitado (%).', SQLERRM;
  END;
  SET CONSTRAINTS trg_validar_varejo_maior_que_tiers_ativos DEFERRED;

  SELECT preco_varejo INTO v_varejo_final FROM public.produtos WHERE id = v_produto;
  SELECT ativo INTO v_tier_ativo FROM public.precos_atacado WHERE produto_id = v_produto AND quantidade_minima = 10;
  IF v_varejo_final <> 100 THEN
    RAISE EXCEPTION 'GATE_A04_FALHOU: varejo mudou apesar da rejeição (esperado 100, achou %)', v_varejo_final;
  END IF;
  IF v_tier_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'GATE_A04_FALHOU: tier deveria continuar ativo=true';
  END IF;

  v_calc := public.calcular_preco_produto(v_produto, 10);
  IF (v_calc->>'preco')::numeric <> 90 OR v_calc->>'tipo' <> 'ATACADO' THEN
    RAISE EXCEPTION 'GATE_A04_FALHOU: calcular_preco_produto(qtd=10) inesperado: %', v_calc;
  END IF;
  RAISE NOTICE 'Consistência OK: varejo=100, tier=90 preservados; calcular_preco_produto(10) = %', v_calc;

  -- Sentido positivo (isolado): baixar o varejo para um valor que NÃO viola
  -- nenhum tier deve funcionar.
  UPDATE public.produtos SET preco_varejo = 95 WHERE id = v_produto;
  SET CONSTRAINTS trg_validar_varejo_maior_que_tiers_ativos IMMEDIATE;
  SET CONSTRAINTS trg_validar_varejo_maior_que_tiers_ativos DEFERRED;
  SELECT preco_varejo INTO v_varejo_final FROM public.produtos WHERE id = v_produto;
  IF v_varejo_final <> 95 THEN
    RAISE EXCEPTION 'GATE_A04_FALHOU: baixar varejo para 95 (> tier 90) deveria ser aceito';
  END IF;
  RAISE NOTICE 'Positivo OK: baixar varejo para um valor que preserva a invariante (95 > tier 90) foi aceito.';
END
$gate_a04$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Achado do gate de revisão pré-commit: `atualizar_produto_com_faixa_atacado`
-- (20260829120000) atualiza produtos.preco_varejo e DEPOIS precos_atacado na
-- MESMA transação. Uma trigger BEFORE simples rejeitaria o primeiro UPDATE
-- mesmo quando o estado final (varejo=80, tier=70) é válido. Prova que a
-- versão deferrable aceita esse caso — reproduz a MESMA sequência de dois
-- UPDATEs do caller real, sem invocar a RPC inteira.
-- ═══════════════════════════════════════════════════════════════════════════

DO $gate_a04_multi_step$
DECLARE
  v_produto uuid := 'f1000004-0000-4000-8000-000000000002';
  v_varejo_final numeric;
  v_tier_final numeric;
BEGIN
  INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, ativo)
  VALUES (v_produto, 10, 90, true);

  -- Mesma ordem do caller real: 1) varejo, 2) tier, mesma transação.
  BEGIN
    UPDATE public.produtos SET preco_varejo = 80 WHERE id = v_produto;
    UPDATE public.precos_atacado SET preco_unitario = 70
      WHERE produto_id = v_produto AND quantidade_minima = 10;
    SET CONSTRAINTS trg_validar_varejo_maior_que_tiers_ativos IMMEDIATE;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'GATE_A04_MULTI_STEP_FALHOU: edição legítima de varejo+tier juntos (caller real atualizar_produto_com_faixa_atacado) foi rejeitada — %', SQLERRM;
  END;
  SET CONSTRAINTS trg_validar_varejo_maior_que_tiers_ativos DEFERRED;

  SELECT preco_varejo INTO v_varejo_final FROM public.produtos WHERE id = v_produto;
  SELECT preco_unitario INTO v_tier_final FROM public.precos_atacado
    WHERE produto_id = v_produto AND quantidade_minima = 10;
  IF v_varejo_final <> 80 OR v_tier_final <> 70 THEN
    RAISE EXCEPTION 'GATE_A04_MULTI_STEP_FALHOU: estado final inesperado (varejo=%, tier=%)', v_varejo_final, v_tier_final;
  END IF;
  RAISE NOTICE 'Multi-step OK: varejo e tier baixados juntos na mesma transação (80/70), caller real não quebra.';
END
$gate_a04_multi_step$;

SELECT 'GATE A04-4.1/4.2 VAREJO X TIER ATIVO: OK' AS resultado;
ROLLBACK;
