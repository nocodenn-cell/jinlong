-- Rollback de 20261028150000: remove a função de leitura da tela. revisar_evento_offline volta à versão de
-- 20261028130000 reaplicando aquele trecho (seção 7) — a trilha sync_eventos_revisao não é tocada.
DROP FUNCTION IF EXISTS public.listar_revisoes_offline(text, integer);
