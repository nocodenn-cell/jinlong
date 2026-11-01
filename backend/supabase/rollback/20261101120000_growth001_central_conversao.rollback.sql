-- Rollback de 20261101120000_growth001_central_conversao (Central de Conversão do hub).
-- Conversões já feitas NÃO são desfeitas (saas.assinaturas fica como está; histórico em saas.assinatura_auditoria).
-- Leads de teste grátis criados pelo backfill são apagados junto com o histórico deles.
BEGIN;
DROP FUNCTION IF EXISTS public.commercial_solicitar_contratacao(text, text);
DROP FUNCTION IF EXISTS public.commercial_converter_trial(uuid, text, text[], int, int, text, int, text);
DROP FUNCTION IF EXISTS public.commercial_planos();
DROP FUNCTION IF EXISTS public.commercial_trials_listar(uuid);
DROP FUNCTION IF EXISTS public.commercial_trial_garantir_lead(uuid, text);
DROP FUNCTION IF EXISTS internal.commercial_valor_tabela(text, text[], int, int);
DROP FUNCTION IF EXISTS internal.commercial_trial_lead(uuid, text);
DROP FUNCTION IF EXISTS internal.commercial_protocolo();

DELETE FROM public.commercial_lead_events WHERE kind IN ('solicitacao', 'conversao');
DELETE FROM public.commercial_leads WHERE origem = 'teste_gratis';
ALTER TABLE public.commercial_lead_events DROP CONSTRAINT IF EXISTS commercial_lead_events_kind_check;
ALTER TABLE public.commercial_lead_events ADD CONSTRAINT commercial_lead_events_kind_check
  CHECK (kind IN ('nota', 'contato', 'status'));
ALTER TABLE public.commercial_leads DROP CONSTRAINT IF EXISTS commercial_leads_channel_check;
ALTER TABLE public.commercial_leads ADD CONSTRAINT commercial_leads_channel_check
  CHECK (channel IN ('whatsapp', 'wechat'));

REVOKE UPDATE (interesse, proximo_contato) ON public.commercial_leads FROM authenticated;
DROP INDEX IF EXISTS public.commercial_leads_empresa_uniq;
ALTER TABLE public.commercial_leads
  DROP COLUMN IF EXISTS proximo_contato,
  DROP COLUMN IF EXISTS interesse,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS empresa_id,
  DROP COLUMN IF EXISTS origem;
COMMIT;
