-- Fase 2 do plano de remediação Jīn Lóng — regressão do padrão
-- `COALESCE(auth.uid(), p_operador_id)`.
--
-- 6 RPCs usam esse padrão: cancelar_venda_transacional, devolver_ou_trocar_venda,
-- estornar_movimentacao, obter_status_caixa_operador, registrar_movimentacao,
-- finalizar_venda_transacional_canonica_v4_unscoped. O fallback para
-- `p_operador_id` é necessário para chamada via `service_role` (auth.uid() é
-- NULL nesse contexto — ex.: sync do PDV desktop). Não é vulnerabilidade ativa
-- hoje: `authenticated` sempre resolve auth.uid() a partir do JWT real, então
-- p_operador_id fica ignorado para chamador comum; e `anon` não tem EXECUTE em
-- nenhuma delas.
--
-- MAS é o mesmo padrão estrutural que causou o C-1 histórico (migration 277):
-- um `CREATE OR REPLACE` que acrescenta parâmetro cria função NOVA, que nasce
-- com EXECUTE para PUBLIC — e se ninguém revogar, `anon` chamando sem JWT
-- passaria por auth.uid() NULL e teria `p_operador_id` (qualquer UUID) aceito
-- como identidade, sem nenhuma outra checagem de sessão.
--
-- Este teste não muda comportamento — só trava o CI se um future PR reabrir
-- esse grant por acidente, do jeito que a 272/274 fizeram para a v4 original.

\set ON_ERROR_STOP on
BEGIN;

DO $fase2_coalesce_regressao$
DECLARE
  v_fn text;
  v_fail text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.cancelar_venda_transacional(uuid,text,uuid)',
    'public.devolver_ou_trocar_venda(uuid,text,text,text,jsonb,numeric,text,uuid,uuid)',
    'public.estornar_movimentacao(uuid,text,text,inet,text,text,text,uuid)',
    'public.obter_status_caixa_operador(uuid)',
    'public.registrar_movimentacao(uuid,text,text,numeric,text,text,text,uuid,text,inet,text,text,text,uuid,uuid)',
    'public.finalizar_venda_transacional_canonica_v4_unscoped(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,motivo_desconto_enum_tipo,text,text)'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE NOTICE 'Assinatura não encontrada neste banco (ok — pode ter mudado de posição de argumentos): %', v_fn;
      CONTINUE;
    END IF;

    IF has_function_privilege('anon', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': anon tem EXECUTE — COALESCE(auth.uid(), p_operador_id) fica explorável (spoofing de identidade sem sessão)');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure(v_fn)
        AND p.prosrc ILIKE '%COALESCE(auth.uid(), p_operador_id%'
    ) THEN
      RAISE NOTICE 'Aviso: % não usa mais o padrão COALESCE(auth.uid(), p_operador_id) — atualizar este teste.', v_fn;
    END IF;
  END LOOP;

  IF array_length(v_fail, 1) > 0 THEN
    RAISE EXCEPTION 'FASE2_COALESCE_OPERADOR_ID_REGRESSAO_FALHOU: %', array_to_string(v_fail, ' | ');
  END IF;

  RAISE NOTICE 'FASE2: nenhuma das 6 RPCs COALESCE(auth.uid(), p_operador_id) ganhou EXECUTE para anon.';
END
$fase2_coalesce_regressao$;

SELECT 'FASE2 COALESCE OPERADOR ID REGRESSAO: OK' AS resultado;
ROLLBACK;
