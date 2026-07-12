-- Capture: migration aplicada diretamente no DB em 2026-06-20.
-- Remove tabela venda_fiado (substituída por contas_receber com tipo FIADO).
-- Idempotente: DROP IF EXISTS.

DROP TABLE IF EXISTS public.venda_fiado CASCADE;
DROP TABLE IF EXISTS public.vendas_fiado CASCADE;
