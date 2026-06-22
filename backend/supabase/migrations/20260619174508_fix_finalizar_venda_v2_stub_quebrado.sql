-- Capture: migration aplicada diretamente no DB em 2026-06-19.
-- Corrige stub quebrado de finalizar_venda_transacional_canonica_v2 (overload sem assinatura).
-- Garante que TODOS os overloads de v2 retornam LEGACY_DISABLED_USE_V4.
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;
