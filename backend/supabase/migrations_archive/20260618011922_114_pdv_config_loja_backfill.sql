-- Capture: migration aplicada diretamente no DB em 2026-06-18.
-- Backfill de loja_id em pdv_config para registros sem loja associada.
-- Idempotente: UPDATE com WHERE loja_id IS NULL.
--
-- GUARD (2026-07-03): a CLI ordena migrations por versão LEXICOGRÁFICA, então
-- as versões timestamp (2026…) rodam ENTRE 127 e 205 — ou seja, ANTES da 209,
-- que é quem cria pdv_config.loja_id (ADD COLUMN IF NOT EXISTS). No remoto a
-- coluna já existia (adicionada via dashboard) e o capture aplicou sem erro;
-- num `db reset` do zero a coluna ainda não existe neste ponto e o UPDATE
-- quebrava o reset inteiro (SQLSTATE 42703). O guard pula o backfill quando a
-- coluna não existe — no fluxo do zero não há linhas legadas para backfillar
-- (a coluna nasce na 209 e o seed já escreve loja_id). Editar o conteúdo é
-- seguro: o CLI rastreia por versão; remoto já aplicado não re-executa.

DO $$
DECLARE
  v_loja_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pdv_config' AND column_name = 'loja_id'
  ) THEN
    RAISE NOTICE 'pdv_config.loja_id ainda não existe (criada na 209) — backfill pulado (build do zero).';
    RETURN;
  END IF;

  -- Backfill: associa pdv_config sem loja_id à loja matriz, se existir apenas uma loja.
  SELECT id INTO v_loja_id FROM public.lojas WHERE ativo = true ORDER BY created_at LIMIT 1;
  IF v_loja_id IS NOT NULL THEN
    UPDATE public.pdv_config SET loja_id = v_loja_id WHERE loja_id IS NULL;
  END IF;
END;
$$;
