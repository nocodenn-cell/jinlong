-- Capture: migration aplicada diretamente no DB em 2026-06-18.
-- Correções de RLS aplicadas via dashboard/CLI direto.
-- Garantia de RLS ativo nas tabelas críticas (idempotente via IF NOT EXISTS).

-- Confirma RLS ativo em tabelas críticas de venda
ALTER TABLE IF EXISTS public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendas_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.estoque_baixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.venda_eventos ENABLE ROW LEVEL SECURITY;
