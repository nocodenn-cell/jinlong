-- 278_stub_finalizar_venda_transacional_legada.sql
--
-- FRENTE 3 (Database Integrity Hardening) — desativa a RPC legada de finalização
-- de venda `public.finalizar_venda_transacional` (SEM sufixo `_canonica_vN`).
--
-- ACHADO (evidência de produção, projeto jinlong kbabmewnahysfvlybiak, 2026-07-17)
-- ==============================================================================
-- `finalizar_venda_transacional` tinha 2 overloads em produção:
--   • 7-arg  (…, p_itens jsonb)                    → JÁ era stub LEGACY_DISABLED.
--   • 9-arg  (…, p_desconto_gerente_token text,
--               p_desconto_gerente_percentual numeric) → **VIVO** (6 KB de lógica
--     real, SECURITY DEFINER, GRANT EXECUTE a `authenticated`).
-- No repositório, AMBOS os overloads estavam VIVOS (020 cria o 7-arg, 122 cria o
-- 9-arg). Ou seja: existia um caminho de finalização de venda paralelo à
-- `finalizar_venda_transacional_canonica_v4` (a golden flow), executável por
-- qualquer usuário `authenticated` via PostgREST, SEM as blindagens da v4
-- (cliente_id/contas_receber, revalidação de preço, auditoria de evento).
--
-- Ao contrário de v2 e v3 — que foram formalmente desativadas com
-- `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'` (migrations timestamp 2026-06-19/20)
-- — a função-base nunca recebeu esse stub. Esta migration fecha essa lacuna.
--
-- SEGURANÇA DA MUDANÇA
-- ====================
-- Callers confirmados = ZERO: grep em pdv-importados, pdv-local, shared,
-- shared-core e backend/supabase/functions não encontra nenhum
-- `.rpc('finalizar_venda_transacional', …)` — apenas 2 referências em
-- documentação histórica (.md). O único caller ativo de finalização é
-- `finalizar_venda_transacional_canonica_v4` (caixaVendas.impl.ts). Ver
-- docs/DATABASE_INTEGRITY_DECISIONS.md DEC-05.
--
-- PADRÃO
-- ======
-- Espelha o stub de v3 (20260620004913_stub_v3_full_overload_legacy_disabled.sql):
-- CREATE OR REPLACE mantendo assinatura e RETURNS (void nos dois overloads, já
-- confirmado em pg_get_function_result), corpo = RAISE incondicional. Idempotente.
-- Adiciona REVOKE defesa-em-profundidade (a função desativada não precisa ser
-- executável por anon/authenticated/public).
--
-- ROLLBACK: reaplicar a definição original de 122 (9-arg) / 020 (7-arg).

BEGIN;

-- ── Overload 7-arg ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_forma_pagamento text,
  p_total_bruto numeric,
  p_total_desconto numeric,
  p_total_liquido numeric,
  p_itens jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb
) FROM PUBLIC, anon, authenticated;

-- ── Overload 9-arg (era o overload VIVO) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_forma_pagamento text,
  p_total_bruto numeric,
  p_total_desconto numeric,
  p_total_liquido numeric,
  p_itens jsonb,
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ─── VERIFICAÇÃO (rodar após aplicar) ───────────────────────────────────────
-- Deve retornar 2 linhas, ambas eh_stub=true:
--   SELECT pg_get_function_identity_arguments(p.oid),
--          (pg_get_functiondef(p.oid) ILIKE '%LEGACY_DISABLED%') AS eh_stub
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='finalizar_venda_transacional';
