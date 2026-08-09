-- Migration 286: revoga EXECUTE de `authenticated` na RPC legada
--                 finalizar_venda_transacional (9 argumentos).
-- Data: 2026-07-29
--
-- CONTEXTO
-- --------
-- Sequência das migrations 277/278 (C-1, hardening pré-baseline). A migration
-- 278 já revogou EXECUTE de `anon`/`authenticated` em todas as RPCs legadas de
-- venda cujo corpo continha o guard LEGACY_DISABLED_USE_V4 — EXCETO esta.
-- O próprio comentário da 278 (linhas 55-60) registrou a lacuna:
--
--   "finalizar_venda_transacional(uuid,uuid,text,numeric,numeric,numeric,
--   jsonb,text,numeric) — a de 9 argumentos. NÃO é LEGACY_DISABLED (é SECURITY
--   DEFINER ativa) e anon já está negado. Não foi possível provar ausência
--   de uso; fica INTACTA para verificação posterior."
--
-- VERIFICAÇÃO REALIZADA (fecha a lacuna acima)
-- ---------------------------------------------
-- has_function_privilege('authenticated', ..., 'EXECUTE') = true (confirmado
-- via execute_sql em produção). Corpo (pg_get_functiondef) confirma que a
-- função É funcional (não tem LEGACY_DISABLED_USE_V4): insere em
-- public.vendas, chama decrementar_estoque_seguro, consome
-- tokens_desconto_gerente e insere em descontos_venda.
--
-- Busca por chamada literal `finalizar_venda_transacional` (nome exato, sem
-- sufixo _v2/_v3/_v4/canonica) em todo o monorepo (pdv-importados, pdv-local,
-- backend, shared-core): ZERO ocorrências em código vivo. As únicas 3
-- ocorrências são:
--   * backend/scripts/test-rls-scope.mjs:396 — chama a sobrecarga de 7
--     argumentos (já revogada de `authenticated` pela migration 278, grupo E),
--     não esta de 9 argumentos.
--   * pdv-importados/VENDA_CONSISTENCY_ANALYSIS.md e
--     IMPLEMENTACAO_CONSISTENCIA_VENDAS.md — documentos históricos, não
--     código executável.
-- Ausência de uso comprovada.
--
-- POR QUE É CRÍTICO
-- -----------------
-- Diferente das demais RPCs legadas (v2/v3), esta função de 9 args NÃO tem o
-- guard LEGACY_DISABLED_USE_V4 — ela executa de ponta a ponta: insere venda
-- com status CONCLUIDA, decrementa estoque real, consome token de gerente
-- real e grava auditoria de desconto real. Além disso, NÃO valida
-- `preco_original`/`preco_unitario` contra o catálogo (public.produtos) —
-- aceita os valores enviados pelo chamador, apenas checando consistência
-- interna entre os totais informados. Com EXECUTE aberto a `authenticated`,
-- qualquer sessão de operador logado podia chamar esta RPC diretamente via
-- PostgREST (fora do app Next.js), definindo qualquer preço para qualquer
-- produto, decrementando estoque real e criando uma venda fraudulenta com
-- status CONCLUIDA — via de bypass total da RPC canônica v4 e de suas
-- validações (SSOT de preço, teto de desconto, motivo obrigatório).
--
-- ESCOPO
-- ------
-- Apenas DDL de permissão. O corpo da função NÃO é alterado. Nenhuma função é
-- removida (DROP fica para decisão separada, após checagem de dependências).
-- `service_role` preservado (uso administrativo/scripts internos, se houver).
--
-- REVERSÃO
-- --------
--   GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional(
--     uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
--   ) TO authenticated;

BEGIN;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
) FROM anon, authenticated;

COMMENT ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
) IS
  'LEGADA — substituída por finalizar_venda_transacional_canonica_v4. '
  'Sem chamador vivo confirmado (migration 286). Não valida preço contra '
  'o catálogo; EXECUTE restrito a service_role para eliminar via de bypass '
  'da RPC canônica.';

NOTIFY pgrst, 'reload schema';

COMMIT;
