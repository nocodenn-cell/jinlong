-- Gate — caixas: turno FECHADO exige data, valor contado e diferença de fechamento.
--
-- Prova a constraint `caixas_fechado_exige_dados_fechamento_chk`
-- (20260929120000_caixas_fechado_exige_dados_fechamento.sql):
--   1. FECHADO + campos completos                 -> permitido.
--   2. FECHADO + QUALQUER campo obrigatório nulo  -> rejeitado (23514), nos 3 campos.
--   3. ABERTO + campos de fechamento nulos        -> permitido.
--   4. Fluxo normal de fechamento pelos RPCs      -> permitido
--      (fechar_caixa_atomico e fechar_caixa_pdv_atomico).
--   5. Caminhos que produziam FECHADO incompleto  -> rejeitados:
--      UPDATE direto de status e RPC com p_valor_contado NULL.
--
-- Este teste FALHA (GATE_CHECK_AUSENTE) enquanto a migration não estiver aplicada.
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/caixas-fechado-exige-dados-fechamento.test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'f3000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f3000002-0000-4000-8000-000000000001';
  v_operador2 uuid := 'f3000002-0000-4000-8000-000000000002';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.caixas'::regclass
      AND conname = 'caixas_fechado_exige_dados_fechamento_chk'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'GATE_CHECK_AUSENTE: constraint caixas_fechado_exige_dados_fechamento_chk nao existe/validada — migration 20260929120000 nao aplicada';
  END IF;

  INSERT INTO auth.users (id) VALUES (v_operador), (v_operador2) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja, 'GateCaixaFechado Loja', 'GATECXFECH', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_operador, 'GateCxFech Operador 1', 'OPERADOR', true, v_loja),
    (v_operador2, 'GateCxFech Operador 2', 'OPERADOR', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;
  DELETE FROM public.caixas WHERE operador_id IN (v_operador, v_operador2);
END
$setup$;

-- 1) FECHADO completo permitido; 3) ABERTO sem campos permitido.
DO $positivos$
DECLARE
  v_loja uuid := 'f3000001-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO public.caixas (operador_id, loja_id, status, valor_inicial, data_fechamento, valor_fechamento, fechamento_diferenca)
  VALUES (NULL, v_loja, 'FECHADO', 100, now(), 100, 0);
  RAISE NOTICE 'Positivo OK: FECHADO com data, valor e diferenca foi aceito.';

  INSERT INTO public.caixas (operador_id, loja_id, status, valor_inicial)
  VALUES (NULL, v_loja, 'ABERTO', 100);
  RAISE NOTICE 'Positivo OK: ABERTO sem campos de fechamento foi aceito.';
END
$positivos$;

-- 2) FECHADO com cada campo obrigatório nulo -> rejeitado.
DO $negativos$
DECLARE
  v_loja uuid := 'f3000001-0000-4000-8000-000000000001';
  v_campo text;
BEGIN
  FOREACH v_campo IN ARRAY ARRAY['data_fechamento', 'valor_fechamento', 'fechamento_diferenca'] LOOP
    BEGIN
      INSERT INTO public.caixas (operador_id, loja_id, status, valor_inicial, data_fechamento, valor_fechamento, fechamento_diferenca)
      VALUES (
        NULL, v_loja, 'FECHADO', 100,
        CASE WHEN v_campo = 'data_fechamento' THEN NULL ELSE now() END,
        CASE WHEN v_campo = 'valor_fechamento' THEN NULL ELSE 100 END,
        CASE WHEN v_campo = 'fechamento_diferenca' THEN NULL ELSE 0 END
      );
      RAISE EXCEPTION 'GATE_FALHOU: FECHADO com % nulo foi aceito', v_campo;
    EXCEPTION
      WHEN check_violation THEN
        IF SQLERRM NOT LIKE '%caixas_fechado_exige_dados_fechamento_chk%' THEN RAISE; END IF;
        RAISE NOTICE 'Negativo OK: FECHADO com % nulo rejeitado (23514).', v_campo;
    END;
  END LOOP;
END
$negativos$;

-- 5a) UPDATE direto de status (o caminho das fixtures/testes ruins) -> rejeitado.
DO $update_direto$
DECLARE
  v_loja uuid := 'f3000001-0000-4000-8000-000000000001';
  v_id uuid;
BEGIN
  INSERT INTO public.caixas (operador_id, loja_id, status, valor_inicial)
  VALUES (NULL, v_loja, 'ABERTO', 50) RETURNING id INTO v_id;
  BEGIN
    UPDATE public.caixas SET status = 'FECHADO' WHERE id = v_id;
    RAISE EXCEPTION 'GATE_FALHOU: UPDATE direto para FECHADO sem dados de fechamento foi aceito';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'Negativo OK: UPDATE direto de status para FECHADO sem dados rejeitado (23514).';
  END;
END
$update_direto$;

-- 4) Fluxo normal pelos RPCs -> permitido.
DO $rpcs$
DECLARE
  v_loja uuid := 'f3000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f3000002-0000-4000-8000-000000000001';
  v_operador2 uuid := 'f3000002-0000-4000-8000-000000000002';
  v_caixa2 uuid;
  r record;
  c record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  INSERT INTO public.caixas (operador_id, loja_id, status, valor_inicial)
  VALUES (v_operador, v_loja, 'ABERTO', 200);

  SELECT * INTO r FROM public.fechar_caixa_atomico(v_operador, 200, 'gate-caixa-fechado');
  IF r.o_ja_fechado IS NOT FALSE THEN
    RAISE EXCEPTION 'GATE_FALHOU: fechar_caixa_atomico nao fechou (ja_fechado=%)', r.o_ja_fechado;
  END IF;
  SELECT status, data_fechamento, valor_fechamento, fechamento_diferenca INTO c
  FROM public.caixas WHERE id = r.o_caixa_id;
  IF c.status <> 'FECHADO' OR c.data_fechamento IS NULL OR c.valor_fechamento IS NULL OR c.fechamento_diferenca IS NULL THEN
    RAISE EXCEPTION 'GATE_FALHOU: fechar_caixa_atomico deixou fechamento incompleto (%)', c;
  END IF;
  RAISE NOTICE 'Positivo OK: fechar_caixa_atomico grava os 3 campos e passa pela constraint.';

  INSERT INTO public.caixas (operador_id, loja_id, status, valor_inicial)
  VALUES (v_operador2, v_loja, 'ABERTO', 300) RETURNING id INTO v_caixa2;
  -- fechar_caixa_pdv_atomico é service_role/sync do PDV local: sem auth.uid().
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM public.fechar_caixa_pdv_atomico(v_caixa2, 300, 'gate-caixa-fechado-pdv');
  SELECT status, data_fechamento, valor_fechamento, fechamento_diferenca INTO c
  FROM public.caixas WHERE id = v_caixa2;
  IF c.status <> 'FECHADO' OR c.data_fechamento IS NULL OR c.valor_fechamento IS NULL OR c.fechamento_diferenca IS NULL THEN
    RAISE EXCEPTION 'GATE_FALHOU: fechar_caixa_pdv_atomico deixou fechamento incompleto (%)', c;
  END IF;
  RAISE NOTICE 'Positivo OK: fechar_caixa_pdv_atomico grava os 3 campos e passa pela constraint.';
END
$rpcs$;

-- 5b) RPC com p_valor_contado NULL nao pode mais gravar FECHADO incompleto.
DO $rpc_null$
DECLARE
  v_loja uuid := 'f3000001-0000-4000-8000-000000000001';
  v_operador uuid := 'f3000002-0000-4000-8000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  INSERT INTO public.caixas (operador_id, loja_id, status, valor_inicial)
  VALUES (v_operador, v_loja, 'ABERTO', 10);
  BEGIN
    PERFORM public.fechar_caixa_atomico(v_operador, NULL, '');
    RAISE EXCEPTION 'GATE_FALHOU: fechar_caixa_atomico com valor contado NULL gravou FECHADO incompleto';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'Negativo OK: fechar_caixa_atomico com valor contado NULL rejeitado (23514).';
  END;
END
$rpc_null$;

ROLLBACK;
