-- ============================================================================
-- 304 — Pacote 6: remove `baixar_estoque_venda`, último caminho de estoque
-- fora do kardex (fecha SSOT-04 junto com a migration 303).
--
-- O QUE É ESSA FUNÇÃO
-- -------------------
-- Drift: existe em produção **sem migration de origem** (aparece só no
-- `remote_schema.sql` do reparo de histórico). Baixa estoque com `UPDATE`
-- direto e não grava em `movimentos_estoque_log` — movimentação invisível à
-- reconciliação. Já era o SEC-01 (exposta a `anon`), resolvido pela 289 via
-- revogação de grants; sobrava o desvio de kardex, que é o SSOT-04.
--
-- EVIDÊNCIA DE DEPENDÊNCIA ZERO (medida em produção, 2026-08-06)
-- --------------------------------------------------------------
--   grants ........................ service_role, postgres (nenhum anon/authenticated/PUBLIC)
--   chamadores no banco ........... 0  (varredura de pg_get_functiondef em todas as funções)
--   dependências em pg_depend ..... 0
--   chamadores no repositório ..... 0  (app/, lib/, edge functions — só docs e tipos gerados)
--
-- `backend/scripts/test-rls-scope.mjs` (linhas 76-78) já trata "função
-- inexistente" como aprovação do gate de SEC-01 — remover não quebra o teste.
--
-- SEM CASCADE, de propósito: se existisse qualquer dependência não mapeada, o
-- próprio Postgres recusaria o DROP em vez de arrastar objetos junto.
--
-- PROVA EM ROLLBACK ANTES DE APLICAR
-- ----------------------------------
-- Executado contra produção em transação desfeita: o DROP passou sem CASCADE,
-- as seis funções de estoque seguiram intactas
-- (`decrementar_estoque_seguro`, `ajustar_estoque_manual`,
-- `transferir_estoque_seguro`, `transferir_estoque_entre_lojas`,
-- `cancelar_venda_transacional`, `devolver_ou_trocar_venda`) e a varredura de
-- "funções que alteram estoque sem gravar kardex" passou a retornar **NENHUMA**.
--
-- Único resíduo conhecido: `pdv-importados/lib/supabase/database.types.ts`
-- ainda declara o tipo da RPC. É arquivo gerado e ninguém a chama, então não
-- quebra build nem runtime; some na próxima regeneração de tipos.
-- ============================================================================

BEGIN;

DROP FUNCTION public.baixar_estoque_venda(uuid, jsonb);

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO
-- ============================================================================

DO $verify$
DECLARE
  v_sem_kardex text;
BEGIN
  IF to_regprocedure('public.baixar_estoque_venda(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'MIG304_FUNCAO_AINDA_EXISTE';
  END IF;

  -- A invariante do SSOT-04: nenhuma função altera `estoque` sem lançar no kardex.
  SELECT string_agg(p.proname, ', ')
  INTO v_sem_kardex
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~* 'UPDATE\s+(public\.)?estoque'
    AND position('movimentos_estoque_log' IN pg_get_functiondef(p.oid)) = 0;

  IF v_sem_kardex IS NOT NULL THEN
    RAISE EXCEPTION 'MIG304_AINDA_HA_ESCRITA_SEM_KARDEX: %', v_sem_kardex;
  END IF;

  RAISE NOTICE '304 OK — SSOT-04 fechado: nenhuma funcao altera estoque sem kardex';
END
$verify$;

COMMIT;
