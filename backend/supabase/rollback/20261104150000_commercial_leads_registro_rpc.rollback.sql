-- Rollback de 20261104150000_commercial_leads_registro_rpc.sql.
-- Remove a função de registro. Não há dados a restaurar: a função só insere linhas em commercial_leads, e essas
-- linhas continuam na tabela. Depois do rollback, o formulário do site volta a falhar (sem caminho de escrita para anon).
BEGIN;
DROP FUNCTION IF EXISTS public.registrar_lead_comercial(text, text, text, text, text, text, text, text, text, text, text, text);
COMMIT;
