-- P1 S5 — corrige search_path mutável. NÃO EXECUTAR sem confirmação.
--
-- Evidência (2026-07-16): dos 4 achados do advisor `function_search_path_mutable`,
-- 3 já são resolvidos automaticamente pelo DROP em 03_security_drop_legacy_overloads.sql
-- (eram os stubs finalizar_venda_transacional(7 args), _v2(), _v3()). Resta apenas
-- venda_evento_idempotency_key, uma função ativa e realmente usada.
--
-- Rollback: ALTER FUNCTION public.venda_evento_idempotency_key(text, uuid, boolean) RESET search_path;

ALTER FUNCTION public.venda_evento_idempotency_key(text, uuid, boolean) SET search_path = public;
