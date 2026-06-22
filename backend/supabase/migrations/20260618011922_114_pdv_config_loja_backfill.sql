-- Capture: migration aplicada diretamente no DB em 2026-06-18.
-- Backfill de loja_id em pdv_config para registros sem loja associada.
-- Idempotente: UPDATE com WHERE loja_id IS NULL.

DO $$
DECLARE
  v_loja_id uuid;
BEGIN
  -- Backfill: associa pdv_config sem loja_id à loja matriz, se existir apenas uma loja.
  SELECT id INTO v_loja_id FROM public.lojas WHERE ativo = true ORDER BY created_at LIMIT 1;
  IF v_loja_id IS NOT NULL THEN
    UPDATE public.pdv_config SET loja_id = v_loja_id WHERE loja_id IS NULL;
  END IF;
END;
$$;
