-- 2026-11-07: remove a policy commercial_leads_anon_insert (INSERT para anon, com check status = 'novo').
--
-- Contexto: a policy foi criada em 20261021115705 / 20261022000000. Hoje é inerte, porque anon não tem o privilégio
-- de INSERT em commercial_leads (20261104120000 e 20261104150000). Mas o privilégio e a policy são duas chaves
-- independentes: se alguém conceder INSERT a anon no futuro, a tabela fica aberta a qualquer um com a chave pública.
-- Remover a policy fecha esse caminho (defesa em profundidade). O único caminho público de escrita continua sendo
-- a RPC registrar_lead_comercial, executada como service_role no servidor do site.
--
-- Não altera grants. A RPC é SECURITY DEFINER e roda como dono da tabela, então não depende desta policy.
--
-- ROLLBACK: backend/supabase/rollback/20261107120000_commercial_leads_remove_anon_insert_policy.rollback.sql

BEGIN;

DROP POLICY IF EXISTS commercial_leads_anon_insert ON public.commercial_leads;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'commercial_leads' AND policyname = 'commercial_leads_anon_insert') THEN
    RAISE EXCEPTION 'REMOVE_POLICY: commercial_leads_anon_insert ainda existe';
  END IF;
  IF has_table_privilege('anon', 'public.commercial_leads', 'INSERT') THEN
    RAISE EXCEPTION 'REMOVE_POLICY: anon com INSERT em commercial_leads';
  END IF;
END
$verify$;

COMMIT;
