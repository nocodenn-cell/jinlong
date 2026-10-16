-- Regressão de 20261015130000_ajuste_estoque_motivo_coerente_com_sinal.sql
-- (achado de 2026-10-15: "motivo=PERDA" gravado com delta +2 no kardex).
--
-- Com dados sintéticos (1 loja, 1 GERENTE, 1 produto com saldo 10), prova:
--   1. PERDA aumentando saldo  -> AJUSTE_ESTOQUE_MOTIVO_SINAL_INVALIDO, saldo intacto.
--   2. QUEBRA aumentando saldo -> idem.
--   3. COMPRA reduzindo saldo  -> idem.
--   4. PERDA reduzindo saldo   -> OK, kardex SAIDA_AVARIA -2.
--   5. COMPRA aumentando saldo -> OK, kardex ENTRADA_AJUSTE +3.
--   6. ACERTO_INVENTARIO nos dois sentidos -> OK.
--   7. PERDA sem mudar saldo (só mínimo) -> OK, nenhum movimento novo.
--
-- Chamada como service_role (sem JWT) com p_ator_id explícito, igual ao
-- adapter do app. Tudo dentro de transação com ROLLBACK final.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_categoria uuid := 'f000000b-0000-4000-8000-000000000003';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000004';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja, 'SINAL Loja', 'SINAL-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id, idioma_preferido) VALUES
    (v_gerente, 'SINAL Gerente', 'GERENTE', true, v_loja, 'pt')
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'SINAL Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto, '7899999990109', 'SINAL Produto', v_categoria, 10.00, 'china_manual', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto, v_loja, 10, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE SET quantidade_atual = 10, estoque_minimo = 0;
END
$setup$;

SET LOCAL ROLE service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativos 1–3 — motivo contradiz o sinal
-- ═══════════════════════════════════════════════════════════════════════════

DO $negativos$
DECLARE
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000004';
  v_caso record;
  v_saldo numeric;
BEGIN
  FOR v_caso IN
    SELECT * FROM (VALUES ('PERDA', 12::numeric), ('QUEBRA', 11::numeric), ('COMPRA', 9::numeric)) t(motivo, novo)
  LOOP
    BEGIN
      PERFORM public.ajustar_estoque_manual_seguro(
        v_produto, v_loja, v_caso.novo, 0, v_caso.motivo, 'teste sinal', v_gerente, 10, 0
      );
      RAISE EXCEPTION 'SINAL_FALHOU: % de 10 para % foi aceito', v_caso.motivo, v_caso.novo;
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM <> 'AJUSTE_ESTOQUE_MOTIVO_SINAL_INVALIDO' THEN RAISE; END IF;
        RAISE NOTICE 'Negativo OK: % 10 -> % recusado.', v_caso.motivo, v_caso.novo;
    END;
  END LOOP;

  SELECT quantidade_atual INTO v_saldo FROM public.estoque WHERE produto_id = v_produto AND loja_id = v_loja;
  IF v_saldo <> 10 THEN
    RAISE EXCEPTION 'SINAL_FALHOU: saldo mudou após recusas (%)', v_saldo;
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimentos_estoque_log WHERE produto_id = v_produto) THEN
    RAISE EXCEPTION 'SINAL_FALHOU: recusa gravou kardex';
  END IF;
END
$negativos$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivos 4–7 — motivo coerente segue funcionando
-- ═══════════════════════════════════════════════════════════════════════════

DO $positivos$
DECLARE
  v_loja uuid := 'f000000b-0000-4000-8000-00000000000a';
  v_gerente uuid := 'f000000b-0000-4000-8000-00000000000b';
  v_produto uuid := 'f000000b-0000-4000-8000-000000000004';
  v_saldo numeric;
  v_minimo numeric;
  v_movs int;
BEGIN
  -- 4. PERDA 10 -> 8
  PERFORM public.ajustar_estoque_manual_seguro(v_produto, v_loja, 8, 0, 'PERDA', NULL, v_gerente, 10, 0);
  IF NOT EXISTS (
    SELECT 1 FROM public.movimentos_estoque_log
    WHERE produto_id = v_produto AND tipo_codigo = 'SAIDA_AVARIA' AND quantidade_delta = -2
  ) THEN
    RAISE EXCEPTION 'SINAL_FALHOU: PERDA -2 não gravou SAIDA_AVARIA';
  END IF;

  -- 5. COMPRA 8 -> 11
  PERFORM public.ajustar_estoque_manual_seguro(v_produto, v_loja, 11, 0, 'COMPRA', NULL, v_gerente, 8, 0);
  IF NOT EXISTS (
    SELECT 1 FROM public.movimentos_estoque_log
    WHERE produto_id = v_produto AND tipo_codigo = 'ENTRADA_AJUSTE' AND quantidade_delta = 3
  ) THEN
    RAISE EXCEPTION 'SINAL_FALHOU: COMPRA +3 não gravou ENTRADA_AJUSTE';
  END IF;

  -- 6. ACERTO_INVENTARIO 11 -> 15 -> 12
  PERFORM public.ajustar_estoque_manual_seguro(v_produto, v_loja, 15, 0, 'ACERTO_INVENTARIO', NULL, v_gerente, 11, 0);
  PERFORM public.ajustar_estoque_manual_seguro(v_produto, v_loja, 12, 0, 'ACERTO_INVENTARIO', NULL, v_gerente, 15, 0);

  -- 7. PERDA só alterando mínimo (delta 0)
  SELECT count(*) INTO v_movs FROM public.movimentos_estoque_log WHERE produto_id = v_produto;
  PERFORM public.ajustar_estoque_manual_seguro(v_produto, v_loja, 12, 3, 'PERDA', NULL, v_gerente, 12, 0);
  IF (SELECT count(*) FROM public.movimentos_estoque_log WHERE produto_id = v_produto) <> v_movs THEN
    RAISE EXCEPTION 'SINAL_FALHOU: ajuste só de mínimo gravou kardex';
  END IF;

  SELECT quantidade_atual, estoque_minimo INTO v_saldo, v_minimo
  FROM public.estoque WHERE produto_id = v_produto AND loja_id = v_loja;
  IF v_saldo <> 12 OR v_minimo <> 3 THEN
    RAISE EXCEPTION 'SINAL_FALHOU: saldo/mínimo finais inesperados (%/%)', v_saldo, v_minimo;
  END IF;

  RAISE NOTICE 'Positivos OK: PERDA -2, COMPRA +3, ACERTO ±, PERDA só mínimo.';
END
$positivos$;

RESET ROLE;
ROLLBACK;
