-- Rollback de 20261107120000_commercial_leads_remove_anon_insert_policy.sql.
-- Restaura a policy exatamente como estava (INSERT, TO anon, WITH CHECK status = 'novo').
-- Sem efeito prático enquanto anon não tiver o privilégio de INSERT em commercial_leads.
BEGIN;
CREATE POLICY commercial_leads_anon_insert ON public.commercial_leads
  AS PERMISSIVE FOR INSERT TO anon
  WITH CHECK (status = 'novo'::text);
COMMIT;
