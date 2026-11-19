-- Gate de Convergência A02-2.1 — repetição de `fechar_caixa_atomico` com
-- valor_contado divergente.
--
-- Achado provado (BEGIN...ROLLBACK contra produção): no caminho "já fechado"
-- (replay dentro de 24h), a RPC devolvia sempre o valor_fechamento já
-- persistido, ignorando por completo um p_valor_contado divergente na nova
-- chamada — sem erro algum. Corrigido por
-- 20260902100200_fechar_caixa_repeticao_valor_divergente.sql.
--
-- Prova as 2 propriedades da correção:
--   1. Replay com o MESMO valor_contado -> sucesso silencioso, o_ja_fechado=true.
--   2. Replay com valor_contado DIFERENTE -> RAISE EXCEPTION explícita, não
--      substituição silenciosa pelo valor antigo.
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.empresas (id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', 'Fixture empresa (suite SQL)') ON CONFLICT (id) DO NOTHING;

DO $setup$
DECLARE
  v_loja uuid := 'f2000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f2000002-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_operador) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', v_loja, 'GateA02 Loja', 'GATEA02', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_operador, 'GateA02 Operador', 'OPERADOR', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  -- Sem caixa ABERTO nem FECHADO ainda para este operador nesta suíte.
  DELETE FROM public.caixas WHERE operador_id = v_operador;
END
$setup$;

DO $gate_a02$
DECLARE
  v_loja uuid := 'f2000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f2000002-0000-4000-8000-000000000001';
  r1 record;
  r2 record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);

  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (v_operador, 'ABERTO', now(), 1000, v_loja);

  -- Fecha com valor_contado = 1000 (bate com o valor_inicial, sem vendas -> diferenca 0).
  SELECT * INTO r1 FROM public.fechar_caixa_atomico(v_operador, 1000, 'gate-a02');
  IF r1.o_ja_fechado IS NOT FALSE OR r1.o_valor_contado <> 1000 THEN
    RAISE EXCEPTION 'GATE_A02_SETUP_FALHOU: primeiro fechamento inesperado (ja_fechado=%, contado=%)', r1.o_ja_fechado, r1.o_valor_contado;
  END IF;

  -- Replay positivo: MESMO valor_contado -> sucesso silencioso, ja_fechado=true.
  SELECT * INTO r2 FROM public.fechar_caixa_atomico(v_operador, 1000, 'gate-a02-replay');
  IF r2.o_ja_fechado IS NOT TRUE OR r2.o_valor_contado <> 1000 THEN
    RAISE EXCEPTION 'GATE_A02_FALHOU: replay com o mesmo valor_contado deveria devolver ja_fechado=true e contado=1000 (achou ja_fechado=%, contado=%)',
      r2.o_ja_fechado, r2.o_valor_contado;
  END IF;
  RAISE NOTICE 'Positivo OK: replay com o mesmo valor_contado (1000) foi silencioso, ja_fechado=true.';

  -- Negativo: valor_contado DIVERGENTE (500) -> rejeitado explicitamente.
  BEGIN
    PERFORM public.fechar_caixa_atomico(v_operador, 500, 'gate-a02-divergente');
    RAISE EXCEPTION 'GATE_A02_FALHOU: repetir fechamento com valor_contado divergente (500) devolveu sucesso silencioso — A02-2.1 reaberto';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo OK (A02-2.1): valor_contado divergente na repetição foi rejeitado explicitamente (%).', SQLERRM;
  END;
END
$gate_a02$;

SELECT 'GATE A02-2.1 FECHAMENTO REPETICAO VALOR DIVERGENTE: OK' AS resultado;
ROLLBACK;
