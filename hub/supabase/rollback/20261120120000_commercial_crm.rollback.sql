-- Rollback de CRM-001 (20261120120000_commercial_crm.sql). Executar SÓ com autorização e depois de voltar o hub
-- para a versão anterior (o hub novo chama as RPCs abaixo).
--
-- PERDA DE DADOS: apaga atividades, propostas, auditoria do CRM e as colunas novas dos leads (responsável,
-- UF, funcionários, unidades, observações, motivo de perda, tempos). Antes, exporte:
--   copy (select * from public.commercial_activities) to stdout with csv header;
--   copy (select * from public.commercial_proposals) to stdout with csv header;
--   copy (select * from public.commercial_audit) to stdout with csv header;
--   copy (select id, owner_id, phone, uf, funcionarios, unidades, observacoes, motivo_perda,
--                primeiro_atendimento_em, ultimo_contato_em, etapa_desde from public.commercial_leads) to stdout with csv header;
-- Leads em etapas novas (qualificacao, negociacao ou criadas pelo gestor) voltam para a etapa antiga mais próxima.
-- Leads de origem manual (indicacao, prospeccao, evento, whatsapp, outro) passam a origem 'site'.
BEGIN;

DROP FUNCTION IF EXISTS public.commercial_lead_mover(uuid, text, text), public.commercial_lead_atribuir(uuid, uuid),
  public.commercial_lead_atualizar(uuid, jsonb),
  public.commercial_lead_criar(text, text, text, text, text, text, text, text, text, text, boolean),
  public.commercial_atividade_agendar(uuid, text, text, timestamptz, uuid), public.commercial_atividade_concluir(uuid, text, boolean),
  public.commercial_proposta_criar(uuid, text, text[], int, int, int, text, date), public.commercial_proposta_status(uuid, text, text),
  public.commercial_lead_converter(uuid, uuid, text), public.commercial_equipe_listar(), public.commercial_equipe_salvar(text, text, text, boolean),
  public.commercial_etapa_salvar(text, text, int, boolean), public.commercial_meu_papel();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['commercial_leads', 'commercial_customers', 'commercial_proposals', 'commercial_activities',
                           'commercial_stages', 'commercial_admins'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS commercial_auditar ON public.%I', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS commercial_evento_contato ON public.commercial_lead_events;
DROP FUNCTION IF EXISTS internal.commercial_auditar(), internal.commercial_evento_contato(),
  internal.commercial_lead_travar(uuid), internal.commercial_exigir_membro(), internal.commercial_exigir_gestor(),
  internal.commercial_digitos(text);

DROP TABLE IF EXISTS public.commercial_audit, public.commercial_activities, public.commercial_proposals;

-- políticas originais
DROP POLICY IF EXISTS commercial_leads_member_select ON public.commercial_leads;
DROP POLICY IF EXISTS commercial_leads_admin_select ON public.commercial_leads;
CREATE POLICY commercial_leads_admin_select ON public.commercial_leads FOR SELECT TO authenticated USING (public.is_commercial_admin());
DROP POLICY IF EXISTS commercial_lead_events_select ON public.commercial_lead_events;
DROP POLICY IF EXISTS commercial_lead_events_insert ON public.commercial_lead_events;
DROP POLICY IF EXISTS commercial_lead_events_admin ON public.commercial_lead_events;
CREATE POLICY commercial_lead_events_admin ON public.commercial_lead_events FOR ALL TO authenticated
  USING (public.is_commercial_admin()) WITH CHECK (public.is_commercial_admin());
DROP FUNCTION IF EXISTS public.commercial_lead_visivel(uuid), public.commercial_pode_ver(uuid);
GRANT UPDATE (status, updated_at, interesse, proximo_contato) ON public.commercial_leads TO authenticated;
GRANT INSERT ON public.commercial_customers TO authenticated;

-- eventos dos tipos novos não cabem no CHECK antigo
DELETE FROM public.commercial_lead_events WHERE kind IN ('atribuicao', 'edicao', 'atividade', 'proposta');
ALTER TABLE public.commercial_lead_events DROP CONSTRAINT IF EXISTS commercial_lead_events_kind_check;
ALTER TABLE public.commercial_lead_events ADD CONSTRAINT commercial_lead_events_kind_check
  CHECK (kind IN ('nota', 'contato', 'status', 'solicitacao', 'conversao'));

-- etapas: volta ao CHECK fixo
UPDATE public.commercial_leads SET status = 'novo' WHERE status = 'qualificacao';
UPDATE public.commercial_leads SET status = 'proposta' WHERE status = 'negociacao';
UPDATE public.commercial_leads SET status = 'contatado'
 WHERE status NOT IN ('novo', 'contatado', 'demonstracao', 'proposta', 'contratado', 'perdido');
ALTER TABLE public.commercial_leads DROP CONSTRAINT IF EXISTS commercial_leads_status_fk;
ALTER TABLE public.commercial_leads ADD CONSTRAINT commercial_leads_status_check
  CHECK (status IN ('novo', 'contatado', 'demonstracao', 'proposta', 'contratado', 'perdido'));
DROP TABLE IF EXISTS public.commercial_stages;

UPDATE public.commercial_leads SET origem = 'site' WHERE origem NOT IN ('site', 'teste_gratis');
ALTER TABLE public.commercial_leads DROP CONSTRAINT IF EXISTS commercial_leads_origem_check;
ALTER TABLE public.commercial_leads ADD CONSTRAINT commercial_leads_origem_check CHECK (origem IN ('site', 'teste_gratis'));

DROP INDEX IF EXISTS public.commercial_leads_owner_idx;
ALTER TABLE public.commercial_leads
  DROP COLUMN IF EXISTS owner_id, DROP COLUMN IF EXISTS phone, DROP COLUMN IF EXISTS uf, DROP COLUMN IF EXISTS funcionarios,
  DROP COLUMN IF EXISTS unidades, DROP COLUMN IF EXISTS observacoes, DROP COLUMN IF EXISTS motivo_perda,
  DROP COLUMN IF EXISTS primeiro_atendimento_em, DROP COLUMN IF EXISTS ultimo_contato_em, DROP COLUMN IF EXISTS etapa_desde;

-- papéis: vendedores perdem acesso (no modelo antigo todo admin vê tudo)
DELETE FROM public.commercial_admins WHERE papel <> 'gestor' OR NOT ativo;
CREATE OR REPLACE FUNCTION public.is_commercial_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.commercial_admins a WHERE a.user_id = auth.uid())
$$;
DROP FUNCTION IF EXISTS public.is_commercial_member();
ALTER TABLE public.commercial_admins DROP COLUMN IF EXISTS papel, DROP COLUMN IF EXISTS nome, DROP COLUMN IF EXISTS ativo;

COMMIT;
