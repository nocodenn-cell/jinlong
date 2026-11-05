-- ROLLBACK OPCIONAL (colunas) de 20261023130000_growth001_central_conversao
-- STATUS: PREPARADO PARA REVISÃO. NÃO APLICADO. Executar SOMENTE depois de 20261023130000_growth001_rollback_seguro.sql.
--
-- Remove colunas, constraints e índice adicionados pela Growth-001, mas ABORTA se existir qualquer
-- dado da Central: lead de teste grátis, lead com empresa vinculada, e-mail, interesse ou próximo
-- contato preenchidos, canal 'email' (não aceito pela constraint original) ou evento de
-- solicitação/conversão. Assim nunca apaga histórico comercial. Se abortar, mantenha as colunas
-- (são aditivas e inofensivas).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.commercial_leads
             WHERE origem = 'teste_gratis' OR empresa_id IS NOT NULL OR email IS NOT NULL
                OR interesse IS NOT NULL OR proximo_contato IS NOT NULL OR channel = 'email') THEN
    RAISE EXCEPTION 'ROLLBACK_COLUNAS_ABORTADO: existem dados da Central em commercial_leads; manter colunas';
  END IF;
  IF EXISTS (SELECT 1 FROM public.commercial_lead_events WHERE kind IN ('solicitacao', 'conversao')) THEN
    RAISE EXCEPTION 'ROLLBACK_COLUNAS_ABORTADO: existem eventos de solicitação/conversão; manter colunas';
  END IF;
END $$;

DROP INDEX IF EXISTS public.commercial_leads_empresa_uniq;
ALTER TABLE public.commercial_leads
  DROP COLUMN IF EXISTS proximo_contato,
  DROP COLUMN IF EXISTS interesse,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS empresa_id,
  DROP COLUMN IF EXISTS origem;

ALTER TABLE public.commercial_lead_events DROP CONSTRAINT IF EXISTS commercial_lead_events_kind_check;
ALTER TABLE public.commercial_lead_events ADD CONSTRAINT commercial_lead_events_kind_check
  CHECK (kind IN ('nota', 'contato', 'status'));
ALTER TABLE public.commercial_leads DROP CONSTRAINT IF EXISTS commercial_leads_channel_check;
ALTER TABLE public.commercial_leads ADD CONSTRAINT commercial_leads_channel_check
  CHECK (channel IN ('whatsapp', 'wechat'));

COMMIT;
