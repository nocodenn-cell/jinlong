-- Fase 2 do plano de remediação Jīn Lóng — regressão do padrão
-- "confia em p_operador_id quando auth.uid() é NULL".
--
-- O fallback para `p_operador_id` é necessário para chamada via
-- `service_role` (auth.uid() é NULL nesse contexto — ex.: sync do PDV
-- desktop). Não é vulnerabilidade ativa hoje: `authenticated` sempre
-- resolve auth.uid() a partir do JWT real, então p_operador_id fica
-- ignorado para chamador comum; e `anon` não tem EXECUTE em nenhuma RPC
-- que use o padrão.
--
-- MAS é o mesmo padrão estrutural que causou o C-1 histórico (migration
-- 277): um `CREATE OR REPLACE` que acrescenta parâmetro cria função NOVA,
-- que nasce com EXECUTE para PUBLIC — e se ninguém revogar, `anon`
-- chamando sem JWT passaria por auth.uid() NULL e teria `p_operador_id`
-- (qualquer UUID) aceito como identidade, sem nenhuma outra checagem de
-- sessão.
--
-- DESCOBERTA DINÂMICA (não assinatura/nome fixo) — achado de code review
-- (#337, chatgpt-codex-connector, 3 comentários P1/P2): uma lista de
-- assinaturas hard-coded fica cega exatamente para a regressão que este
-- teste deveria pegar — uma migration que muda a assinatura (o mesmo
-- `CREATE OR REPLACE` com novo parâmetro que causou o C-1) cria um
-- overload novo que `to_regprocedure('...(assinatura antiga)')` não
-- encontra, e o teste silenciosamente pulava (`CONTINUE`) em vez de falhar.
-- Um nome fixo também ficaria cego para RPC renomeada ou nova função com o
-- mesmo padrão. A busca abaixo é por CORPO (contém `auth.uid()` E
-- `p_operador_id`), não por assinatura nem por nome — pega qualquer
-- overload, presente ou futuro, com esse padrão.
--
-- A busca por corpo também corrigiu um gap real: o levantamento manual
-- original listava 6 RPCs com o literal exato
-- `COALESCE(auth.uid(), p_operador_id)`, mas
-- `finalizar_venda_transacional_canonica_v4` (o wrapper CANÔNICO,
-- externamente chamável — não o `_unscoped`) usa a forma
-- `v_auth_uid := auth.uid(); ... COALESCE(v_auth_uid, p_operador_id)`,
-- que não bate no literal e ficou fora da lista original. A busca por
-- corpo pega as duas formas.
--
-- Este teste não muda comportamento — só trava o CI se um futuro PR
-- reabrir esse grant por acidente, do jeito que a 272/274 fizeram para a
-- v4 original.

\set ON_ERROR_STOP on
BEGIN;

DO $fase2_coalesce_regressao$
DECLARE
  v_rec record;
  v_fail text[] := ARRAY[]::text[];
  v_checked int := 0;
BEGIN
  FOR v_rec IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ILIKE '%auth.uid()%'
      AND p.prosrc ILIKE '%p_operador_id%'
  LOOP
    v_checked := v_checked + 1;

    IF has_function_privilege('anon', v_rec.oid, 'EXECUTE') THEN
      v_fail := array_append(
        v_fail,
        format('%s(%s)', v_rec.proname, v_rec.args) ||
        ': anon tem EXECUTE — RPC confia em p_operador_id quando auth.uid() é NULL, spoofing de identidade sem sessão fica explorável'
      );
    END IF;
  END LOOP;

  -- Sanity check da própria descoberta: em 2026-08-28 (produção, ao vivo) o
  -- padrão casava 9 funções (cancelar_venda_transacional,
  -- devolver_ou_trocar_venda, estornar_movimentacao, fechar_caixa_atomico,
  -- finalizar_venda_transacional_canonica_v4,
  -- finalizar_venda_transacional_canonica_v4_unscoped, liquidar_comissoes,
  -- obter_status_caixa_operador, registrar_movimentacao — as duas últimas
  -- (fechar_caixa_atomico, liquidar_comissoes) não estavam no levantamento
  -- manual original, achadas só pela busca por corpo). Se cair abaixo
  -- disso, a descoberta pode ter parado de funcionar silenciosamente —
  -- falhar é melhor que um gate que passa sem checar nada.
  IF v_checked < 9 THEN
    RAISE EXCEPTION 'FASE2_DESCOBERTA_DINAMICA_SUSPEITA: só % função(ões) casaram o padrão auth.uid()+p_operador_id no corpo — esperado >= 9. A descoberta pode ter parado de funcionar.', v_checked;
  END IF;

  IF array_length(v_fail, 1) > 0 THEN
    RAISE EXCEPTION 'FASE2_COALESCE_OPERADOR_ID_REGRESSAO_FALHOU: %', array_to_string(v_fail, ' | ');
  END IF;

  RAISE NOTICE 'FASE2: % função(ões) descobertas dinamicamente por padrão no corpo (auth.uid()+p_operador_id) — nenhuma com EXECUTE para anon.', v_checked;
END
$fase2_coalesce_regressao$;

SELECT 'FASE2 COALESCE OPERADOR ID REGRESSAO: OK' AS resultado;
ROLLBACK;
