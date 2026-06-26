-- Capture: migration aplicada diretamente no DB em 2026-06-20.
-- Confirma bloqueio completo de todos os overloads v2/v3.
-- Garante overload sem-args bloqueado (usado em chamadas sem parâmetros).
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v3()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;
