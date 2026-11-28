-- CRM-001 · Central Comercial Jinlong: equipe e papéis, etapas configuráveis, responsável, atividades/agenda,
-- propostas, conversão sem duplicidade e auditoria append-only.
--
-- NÃO APLICADA em lugar nenhum. Fica em hub/supabase/ (fora de backend/supabase/migrations/) de propósito:
-- nenhum pipeline a aplica. Promover para backend/supabase/migrations/ só com autorização explícita do dono
-- (mesmo rito da 20261021115705). Ordem de deploy: esta migration ANTES do hub desta branch.
--
-- Pré-requisitos (já em produção): 20261021115705 (hub), 20261022000000/20261022001000 (campos do site),
-- growth001 (origem, empresa_id, email, interesse, proximo_contato, internal.commercial_valor_tabela, saas.planos).
--
-- Single Source of Truth: continua UMA tabela de leads (commercial_leads), UM histórico (commercial_lead_events) e
-- UMA tabela de clientes (commercial_customers, única por lead). Etapas viram tabela (commercial_stages) com os
-- MESMOS códigos já gravados — nenhum lead existente muda de valor. Preço de tabela vem só de saas.planos.
--
-- Segurança: RLS em tudo; hub segue sem service role. Escritas sensíveis (mudar etapa, atribuir, agendar,
-- propor, converter, equipe, etapas) só por RPC SECURITY DEFINER com checagem de papel NO BANCO.
--   gestor   = acesso total (inclui Central de Conversão, clientes, equipe, auditoria). É o papel do admin atual.
--   vendedor = vê e trabalha só leads atribuídos a ele ou sem responsável. Não converte, não vê clientes nem auditoria.
-- LGPD: a auditoria registra QUAIS campos pessoais mudaram, nunca os valores.
--
-- Rollback: hub/supabase/rollback/20261120120000_commercial_crm.rollback.sql
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Equipe e papéis
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_admins
  ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'gestor' CHECK (papel IN ('gestor', 'vendedor')),
  ADD COLUMN IF NOT EXISTS nome text NULL CHECK (nome IS NULL OR char_length(nome) BETWEEN 2 AND 80),
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Mantém o significado histórico: "admin" = acesso total. Os admins existentes viram gestor (default acima).
CREATE OR REPLACE FUNCTION public.is_commercial_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.commercial_admins a WHERE a.user_id = auth.uid() AND a.ativo AND a.papel = 'gestor')
$$;

CREATE OR REPLACE FUNCTION public.is_commercial_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.commercial_admins a WHERE a.user_id = auth.uid() AND a.ativo)
$$;

-- Papel do usuário logado (o hub decide menus com isto; a autorização real é a RLS/RPC).
CREATE OR REPLACE FUNCTION public.commercial_meu_papel()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.papel FROM public.commercial_admins a WHERE a.user_id = auth.uid() AND a.ativo
$$;

CREATE OR REPLACE FUNCTION public.commercial_pode_ver(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_commercial_admin()
      OR (public.is_commercial_member() AND (p_owner IS NULL OR p_owner = auth.uid()))
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Etapas do funil (configuráveis). Códigos iguais aos já gravados em commercial_leads.status.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_stages (
  codigo text PRIMARY KEY CHECK (codigo ~ '^[a-z_]{3,30}$'),
  rotulo text NOT NULL CHECK (char_length(rotulo) BETWEEN 2 AND 40),
  ordem int NOT NULL CHECK (ordem BETWEEN 0 AND 100),
  tipo text NOT NULL DEFAULT 'aberta' CHECK (tipo IN ('aberta', 'ganha', 'perdida')),
  sistema boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.commercial_stages (codigo, rotulo, ordem, tipo, sistema) VALUES
  ('novo', 'Novo', 10, 'aberta', true),
  ('qualificacao', 'Qualificação', 20, 'aberta', false),
  ('contatado', 'Primeiro contato', 30, 'aberta', false),
  ('demonstracao', 'Demonstração', 40, 'aberta', false),
  ('proposta', 'Proposta enviada', 50, 'aberta', true),
  ('negociacao', 'Negociação', 60, 'aberta', true),
  ('contratado', 'Convertido', 90, 'ganha', true),
  ('perdido', 'Perdido', 99, 'perdida', true)
ON CONFLICT (codigo) DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS commercial_stages_uma_ganha ON public.commercial_stages (tipo) WHERE tipo <> 'aberta';
ALTER TABLE public.commercial_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_stages FROM anon, authenticated;
GRANT SELECT ON public.commercial_stages TO authenticated;
DROP POLICY IF EXISTS commercial_stages_member_select ON public.commercial_stages;
CREATE POLICY commercial_stages_member_select ON public.commercial_stages
  FOR SELECT TO authenticated USING (public.is_commercial_member());

-- status passa de CHECK fixo para FK da tabela de etapas (mesmos valores; nenhum dado reescrito)
ALTER TABLE public.commercial_leads DROP CONSTRAINT IF EXISTS commercial_leads_status_check;
ALTER TABLE public.commercial_leads DROP CONSTRAINT IF EXISTS commercial_leads_status_fk;
ALTER TABLE public.commercial_leads ADD CONSTRAINT commercial_leads_status_fk
  FOREIGN KEY (status) REFERENCES public.commercial_stages (codigo) ON UPDATE RESTRICT ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lead: responsável, dados de qualificação, perda, tempos de atendimento
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_leads
  ADD COLUMN IF NOT EXISTS owner_id uuid NULL REFERENCES public.commercial_admins (user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone text NULL CHECK (phone IS NULL OR phone ~ '^[0-9+() .-]{8,25}$'),
  ADD COLUMN IF NOT EXISTS uf text NULL CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS funcionarios int NULL CHECK (funcionarios IS NULL OR funcionarios BETWEEN 0 AND 100000),
  ADD COLUMN IF NOT EXISTS unidades int NULL CHECK (unidades IS NULL OR unidades BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS observacoes text NULL CHECK (observacoes IS NULL OR char_length(observacoes) <= 4000),
  ADD COLUMN IF NOT EXISTS motivo_perda text NULL CHECK (motivo_perda IS NULL OR char_length(motivo_perda) BETWEEN 3 AND 500),
  ADD COLUMN IF NOT EXISTS primeiro_atendimento_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ultimo_contato_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS etapa_desde timestamptz NULL;
UPDATE public.commercial_leads SET etapa_desde = updated_at WHERE etapa_desde IS NULL;
ALTER TABLE public.commercial_leads ALTER COLUMN etapa_desde SET DEFAULT now(), ALTER COLUMN etapa_desde SET NOT NULL;
CREATE INDEX IF NOT EXISTS commercial_leads_owner_idx ON public.commercial_leads (owner_id, status);

-- Origens: site e teste grátis (automáticas) + cadastro manual pela equipe.
ALTER TABLE public.commercial_leads DROP CONSTRAINT IF EXISTS commercial_leads_origem_check;
ALTER TABLE public.commercial_leads ADD CONSTRAINT commercial_leads_origem_check
  CHECK (origem IN ('site', 'teste_gratis', 'indicacao', 'prospeccao', 'evento', 'whatsapp', 'outro'));

-- Backfill dos tempos a partir do histórico existente (nenhum dado inventado).
UPDATE public.commercial_leads l SET
  ultimo_contato_em = x.ultimo,
  primeiro_atendimento_em = coalesce(l.primeiro_atendimento_em, x.primeiro)
FROM (SELECT ev.lead_id,
             max(ev.created_at) FILTER (WHERE ev.kind = 'contato') AS ultimo,
             min(ev.created_at) FILTER (WHERE ev.kind = 'contato' OR (ev.kind = 'status' AND ev.from_status = 'novo')) AS primeiro
        FROM public.commercial_lead_events ev GROUP BY ev.lead_id) x
WHERE x.lead_id = l.id;

-- Leitura: gestor vê tudo; vendedor vê os seus e os sem responsável.
DROP POLICY IF EXISTS commercial_leads_admin_select ON public.commercial_leads;
DROP POLICY IF EXISTS commercial_leads_member_select ON public.commercial_leads;
CREATE POLICY commercial_leads_member_select ON public.commercial_leads
  FOR SELECT TO authenticated USING (public.commercial_pode_ver(owner_id));
-- Escrita direta: só gestor e só interesse/próximo contato (Central). Etapa e demais campos: só por RPC.
REVOKE UPDATE ON public.commercial_leads FROM authenticated;
GRANT UPDATE (interesse, proximo_contato, updated_at) ON public.commercial_leads TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_lead_visivel(p_lead uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT public.commercial_pode_ver(l.owner_id) FROM public.commercial_leads l WHERE l.id = p_lead), false)
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Histórico: novos tipos; escrita direta só nota/contato do próprio autor em lead visível
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_lead_events DROP CONSTRAINT IF EXISTS commercial_lead_events_kind_check;
ALTER TABLE public.commercial_lead_events ADD CONSTRAINT commercial_lead_events_kind_check
  CHECK (kind IN ('nota', 'contato', 'status', 'solicitacao', 'conversao', 'atribuicao', 'edicao', 'atividade', 'proposta'));
DROP POLICY IF EXISTS commercial_lead_events_admin ON public.commercial_lead_events;
DROP POLICY IF EXISTS commercial_lead_events_select ON public.commercial_lead_events;
DROP POLICY IF EXISTS commercial_lead_events_insert ON public.commercial_lead_events;
CREATE POLICY commercial_lead_events_select ON public.commercial_lead_events
  FOR SELECT TO authenticated USING (public.commercial_lead_visivel(lead_id));
CREATE POLICY commercial_lead_events_insert ON public.commercial_lead_events
  FOR INSERT TO authenticated
  WITH CHECK (kind IN ('nota', 'contato') AND author = auth.uid() AND public.commercial_lead_visivel(lead_id));

-- Contato registrado alimenta "último contato" e "primeiro atendimento".
CREATE OR REPLACE FUNCTION internal.commercial_evento_contato()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.kind = 'contato' THEN
    UPDATE public.commercial_leads
       SET ultimo_contato_em = greatest(coalesce(ultimo_contato_em, NEW.created_at), NEW.created_at),
           primeiro_atendimento_em = coalesce(primeiro_atendimento_em, NEW.created_at)
     WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commercial_evento_contato ON public.commercial_lead_events;
CREATE TRIGGER commercial_evento_contato AFTER INSERT ON public.commercial_lead_events
  FOR EACH ROW EXECUTE FUNCTION internal.commercial_evento_contato();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Atividades (agenda: ligações, reuniões, demonstrações, retornos, tarefas, prazos)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.commercial_leads (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ligacao', 'reuniao', 'demonstracao', 'retorno', 'tarefa', 'prazo')),
  titulo text NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 120),
  agendada_para timestamptz NOT NULL,
  responsavel_id uuid NULL REFERENCES public.commercial_admins (user_id) ON DELETE SET NULL,
  concluida_em timestamptz NULL,
  cancelada_em timestamptz NULL,
  resultado text NULL CHECK (resultado IS NULL OR char_length(resultado) <= 2000),
  criado_por uuid NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (concluida_em IS NULL OR cancelada_em IS NULL)
);
CREATE INDEX IF NOT EXISTS commercial_activities_pendentes_idx ON public.commercial_activities (agendada_para)
  WHERE concluida_em IS NULL AND cancelada_em IS NULL;
CREATE INDEX IF NOT EXISTS commercial_activities_lead_idx ON public.commercial_activities (lead_id, agendada_para DESC);
ALTER TABLE public.commercial_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_activities FROM anon, authenticated;
GRANT SELECT ON public.commercial_activities TO authenticated;
DROP POLICY IF EXISTS commercial_activities_select ON public.commercial_activities;
CREATE POLICY commercial_activities_select ON public.commercial_activities
  FOR SELECT TO authenticated USING (public.commercial_lead_visivel(lead_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Propostas (plano/valor de tabela SÓ de saas.planos; valor negociado digitado por pessoa)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.commercial_leads (id) ON DELETE RESTRICT,
  versao int NOT NULL CHECK (versao >= 1),
  plano_codigo text NULL,
  addons text[] NOT NULL DEFAULT '{}',
  qtd_lojas int NULL CHECK (qtd_lojas IS NULL OR qtd_lojas BETWEEN 1 AND 200),
  qtd_caixas int NULL CHECK (qtd_caixas IS NULL OR qtd_caixas BETWEEN 1 AND 1000),
  valor_tabela_centavos int NULL CHECK (valor_tabela_centavos IS NULL OR valor_tabela_centavos >= 0),
  preco_tabela_provisorio boolean NOT NULL DEFAULT false,
  valor_mensal_centavos int NOT NULL CHECK (valor_mensal_centavos BETWEEN 0 AND 100000000),
  condicoes text NULL CHECK (condicoes IS NULL OR char_length(condicoes) <= 2000),
  validade date NOT NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'enviada', 'em_negociacao', 'aceita', 'recusada', 'expirada', 'cancelada')),
  enviada_em timestamptz NULL,
  decidida_em timestamptz NULL,
  motivo text NULL CHECK (motivo IS NULL OR char_length(motivo) <= 500),
  criado_por uuid NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, versao)
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_proposals_uma_aceita ON public.commercial_proposals (lead_id) WHERE status = 'aceita';
ALTER TABLE public.commercial_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_proposals FROM anon, authenticated;
GRANT SELECT ON public.commercial_proposals TO authenticated;
DROP POLICY IF EXISTS commercial_proposals_select ON public.commercial_proposals;
CREATE POLICY commercial_proposals_select ON public.commercial_proposals
  FOR SELECT TO authenticated USING (public.commercial_lead_visivel(lead_id));

-- Clientes: inserção só pelas RPCs de conversão (evita cliente duplicado criado à mão).
REVOKE INSERT ON public.commercial_customers FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Auditoria append-only (trigger; sem grants de escrita; leitura só gestor)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabela text NOT NULL,
  registro text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
  ator uuid NULL,
  campos text[] NOT NULL DEFAULT '{}',
  antes jsonb NULL,
  depois jsonb NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_audit_registro_idx ON public.commercial_audit (tabela, registro, criado_em DESC);
ALTER TABLE public.commercial_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_audit FROM anon, authenticated;
GRANT SELECT ON public.commercial_audit TO authenticated;
DROP POLICY IF EXISTS commercial_audit_gestor ON public.commercial_audit;
CREATE POLICY commercial_audit_gestor ON public.commercial_audit FOR SELECT TO authenticated USING (public.is_commercial_admin());

CREATE OR REPLACE FUNCTION internal.commercial_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  -- dados pessoais: só o NOME do campo vai para a auditoria (LGPD)
  v_pessoais text[] := ARRAY['name', 'store', 'contact', 'email', 'phone', 'wechat', 'city', 'observacoes', 'notes',
                             'store_name', 'resultado', 'condicoes', 'motivo', 'motivo_perda', 'request_hash', 'body'];
  v_ign text[] := ARRAY['updated_at', 'created_at'];
  v_campos text[];
  k text;
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
BEGIN
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO v_campos
    FROM (SELECT key FROM jsonb_object_keys(v_old || v_new) key) x
   WHERE NOT key = ANY (v_ign) AND (v_old -> key) IS DISTINCT FROM (v_new -> key);
  IF TG_OP = 'UPDATE' AND cardinality(v_campos) = 0 THEN RETURN NULL; END IF;
  FOREACH k IN ARRAY v_campos LOOP
    IF k = ANY (v_pessoais) THEN CONTINUE; END IF;
    IF v_old ? k THEN v_antes := v_antes || jsonb_build_object(k, v_old -> k); END IF;
    IF v_new ? k THEN v_depois := v_depois || jsonb_build_object(k, v_new -> k); END IF;
  END LOOP;
  INSERT INTO public.commercial_audit (tabela, registro, acao, ator, campos, antes, depois)
  VALUES (TG_TABLE_NAME, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id', v_new ->> 'codigo', v_old ->> 'codigo'),
          TG_OP, auth.uid(), v_campos,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE v_antes END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_depois END);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION internal.commercial_auditar(), internal.commercial_evento_contato() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['commercial_leads', 'commercial_customers', 'commercial_proposals', 'commercial_activities',
                           'commercial_stages', 'commercial_admins'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS commercial_auditar ON public.%I', t);
    EXECUTE format('CREATE TRIGGER commercial_auditar AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION internal.commercial_auditar()', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPCs do CRM (toda regra de negócio no banco; o hub só chama)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.commercial_exigir_membro()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_commercial_member() THEN
    RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION internal.commercial_exigir_gestor()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_commercial_admin() THEN
    RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;
END $$;

-- Trava o lead e confirma que o usuário pode vê-lo. Lead invisível = "não encontrado" (não revela existência).
CREATE OR REPLACE FUNCTION internal.commercial_lead_travar(p_lead uuid)
RETURNS public.commercial_leads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE l public.commercial_leads;
BEGIN
  PERFORM internal.commercial_exigir_membro();
  SELECT * INTO l FROM public.commercial_leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND OR NOT public.commercial_pode_ver(l.owner_id) THEN RAISE EXCEPTION 'COMMERCIAL_LEAD_NAO_ENCONTRADO'; END IF;
  RETURN l;
END $$;

CREATE OR REPLACE FUNCTION internal.commercial_digitos(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_temp AS $$ SELECT nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '') $$;

-- 8.1 Mover etapa (Kanban e detalhe). Regras: etapa ativa; sem saída de Convertido; Convertido só por conversão;
--     Perdido exige motivo; reabrir um perdido exige justificativa.
CREATE OR REPLACE FUNCTION public.commercial_lead_mover(p_lead uuid, p_para text, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE l public.commercial_leads; de public.commercial_stages; para public.commercial_stages;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  l := internal.commercial_lead_travar(p_lead);
  SELECT * INTO para FROM public.commercial_stages WHERE codigo = p_para;
  IF NOT FOUND OR NOT para.ativo THEN RAISE EXCEPTION 'COMMERCIAL_ETAPA_INVALIDA'; END IF;
  IF l.status = p_para THEN RETURN; END IF;
  SELECT * INTO de FROM public.commercial_stages WHERE codigo = l.status;
  IF de.tipo = 'ganha' THEN RAISE EXCEPTION 'COMMERCIAL_LEAD_CONVERTIDO'; END IF;
  IF para.tipo = 'ganha' THEN RAISE EXCEPTION 'COMMERCIAL_USE_CONVERSAO'; END IF;
  IF para.tipo = 'perdida' AND (v_motivo IS NULL OR char_length(v_motivo) NOT BETWEEN 3 AND 500) THEN
    RAISE EXCEPTION 'COMMERCIAL_MOTIVO_PERDA_OBRIGATORIO';
  END IF;
  IF de.tipo = 'perdida' AND (v_motivo IS NULL OR char_length(v_motivo) NOT BETWEEN 3 AND 500) THEN
    RAISE EXCEPTION 'COMMERCIAL_MOTIVO_REABERTURA_OBRIGATORIO';
  END IF;
  UPDATE public.commercial_leads SET
    status = p_para, etapa_desde = now(), updated_at = now(),
    motivo_perda = CASE WHEN para.tipo = 'perdida' THEN v_motivo ELSE NULL END,
    -- sair de "Novo" para qualquer etapa de trabalho conta como primeiro atendimento
    primeiro_atendimento_em = CASE WHEN l.status = 'novo' AND para.tipo = 'aberta'
                                   THEN coalesce(primeiro_atendimento_em, now()) ELSE primeiro_atendimento_em END
  WHERE id = p_lead;
  INSERT INTO public.commercial_lead_events (lead_id, kind, from_status, to_status, body, author)
  VALUES (p_lead, 'status', l.status, p_para, v_motivo, auth.uid());
END $$;

-- 8.2 Atribuir responsável. Gestor: qualquer membro ativo (ou ninguém). Vendedor: só "puxar" lead sem dono.
CREATE OR REPLACE FUNCTION public.commercial_lead_atribuir(p_lead uuid, p_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE l public.commercial_leads; v_nome text;
BEGIN
  l := internal.commercial_lead_travar(p_lead);
  IF NOT public.is_commercial_admin() AND NOT (l.owner_id IS NULL AND p_owner = auth.uid()) THEN
    RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;
  IF p_owner IS NOT NULL THEN
    SELECT coalesce(a.nome, 'membro da equipe') INTO v_nome FROM public.commercial_admins a WHERE a.user_id = p_owner AND a.ativo;
    IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_RESPONSAVEL_INVALIDO'; END IF;
  END IF;
  IF l.owner_id IS NOT DISTINCT FROM p_owner THEN RETURN; END IF;
  UPDATE public.commercial_leads SET owner_id = p_owner, updated_at = now() WHERE id = p_lead;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (p_lead, 'atribuicao', coalesce('Responsável: ' || v_nome, 'Responsável removido'), auth.uid());
END $$;

-- 8.3 Editar dados do lead (lista fechada de campos; CHECKs da tabela validam formato)
CREATE OR REPLACE FUNCTION public.commercial_lead_atualizar(p_lead uuid, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE l public.commercial_leads; n public.commercial_leads; v_campos text[];
  v_permitidos text[] := ARRAY['name', 'store', 'contact', 'email', 'phone', 'city', 'uf', 'segment',
                               'funcionarios', 'unidades', 'observacoes', 'proximo_contato', 'interesse'];
BEGIN
  l := internal.commercial_lead_travar(p_lead);
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_dados) k WHERE NOT k = ANY (v_permitidos)) THEN
    RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
  END IF;
  n := jsonb_populate_record(l, p_dados);
  IF n.name IS NULL OR n.store IS NULL OR n.contact IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_OBRIGATORIO'; END IF;
  SELECT array_agg(k ORDER BY k) INTO v_campos FROM unnest(v_permitidos) k
   WHERE (to_jsonb(l) -> k) IS DISTINCT FROM (to_jsonb(n) -> k);
  IF v_campos IS NULL THEN RETURN; END IF;
  UPDATE public.commercial_leads SET
    name = n.name, store = n.store, contact = n.contact, email = n.email, phone = n.phone, city = n.city, uf = n.uf,
    segment = n.segment, funcionarios = n.funcionarios, unidades = n.unidades, observacoes = n.observacoes,
    proximo_contato = n.proximo_contato, interesse = n.interesse, updated_at = now()
  WHERE id = p_lead;
  -- histórico registra só os nomes dos campos (sem valores pessoais)
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (p_lead, 'edicao', 'Campos alterados: ' || array_to_string(v_campos, ', '), auth.uid());
EXCEPTION
  WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow
       OR invalid_datetime_format OR foreign_key_violation THEN
    RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
END $$;

-- 8.4 Cadastro manual de lead (prospecção, indicação, evento…). Bloqueia duplicado por contato/e-mail.
CREATE OR REPLACE FUNCTION public.commercial_lead_criar(
  p_product text, p_name text, p_store text, p_contact text, p_channel text, p_origem text,
  p_email text DEFAULT NULL, p_city text DEFAULT NULL, p_uf text DEFAULT NULL, p_observacoes text DEFAULT NULL,
  p_forcar boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE v_id uuid; v_dig text := internal.commercial_digitos(p_contact); v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_proto text;
BEGIN
  PERFORM internal.commercial_exigir_membro();
  IF p_origem NOT IN ('indicacao', 'prospeccao', 'evento', 'whatsapp', 'outro') THEN RAISE EXCEPTION 'COMMERCIAL_ORIGEM_INVALIDA'; END IF;
  IF p_product NOT IN ('jinlong', 'venddi') THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO'; END IF;
  IF NOT coalesce(p_forcar, false) AND EXISTS (
       SELECT 1 FROM public.commercial_leads l
        WHERE (v_dig IS NOT NULL AND char_length(v_dig) >= 8 AND internal.commercial_digitos(l.contact) = v_dig)
           OR (v_email IS NOT NULL AND lower(l.email) = v_email)
           OR (lower(l.contact) = lower(btrim(p_contact)))) THEN
    RAISE EXCEPTION 'COMMERCIAL_LEAD_DUPLICADO';
  END IF;
  LOOP
    v_proto := CASE p_product WHEN 'venddi' THEN 'VD' ELSE 'JL' END || substr(internal.commercial_protocolo(), 3);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.commercial_leads WHERE protocol = v_proto);
  END LOOP;
  INSERT INTO public.commercial_leads (protocol, product, name, store, contact, channel, locale, origem, email, city, uf,
                                       observacoes, owner_id)
  VALUES (v_proto, p_product, btrim(p_name), btrim(p_store), btrim(p_contact), p_channel, 'pt-BR', p_origem, v_email,
          nullif(btrim(coalesce(p_city, '')), ''), nullif(upper(btrim(coalesce(p_uf, ''))), ''),
          nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (v_id, 'nota', 'Lead cadastrado manualmente (origem: ' || p_origem || ')', auth.uid());
  RETURN v_id;
EXCEPTION
  WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
END $$;

-- 8.5 Atividades
CREATE OR REPLACE FUNCTION public.commercial_atividade_agendar(
  p_lead uuid, p_tipo text, p_titulo text, p_quando timestamptz, p_responsavel uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE l public.commercial_leads; v_id uuid; v_resp uuid := coalesce(p_responsavel, auth.uid());
BEGIN
  l := internal.commercial_lead_travar(p_lead);
  IF (SELECT tipo FROM public.commercial_stages WHERE codigo = l.status) <> 'aberta' THEN RAISE EXCEPTION 'COMMERCIAL_LEAD_ENCERRADO'; END IF;
  IF p_quando IS NULL OR p_quando < now() - interval '1 day' OR p_quando > now() + interval '1 year' THEN
    RAISE EXCEPTION 'COMMERCIAL_DATA_INVALIDA';
  END IF;
  IF v_resp <> auth.uid() AND NOT public.is_commercial_admin() THEN RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commercial_admins WHERE user_id = v_resp AND ativo) THEN RAISE EXCEPTION 'COMMERCIAL_RESPONSAVEL_INVALIDO'; END IF;
  INSERT INTO public.commercial_activities (lead_id, tipo, titulo, agendada_para, responsavel_id, criado_por)
  VALUES (p_lead, p_tipo, btrim(p_titulo), p_quando, v_resp, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (p_lead, 'atividade', format('Agendado (%s): %s', p_tipo, left(btrim(p_titulo), 120)), auth.uid());
  RETURN v_id;
EXCEPTION
  WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
END $$;

CREATE OR REPLACE FUNCTION public.commercial_atividade_concluir(p_id uuid, p_resultado text, p_cancelar boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE a public.commercial_activities; v_res text := nullif(btrim(coalesce(p_resultado, '')), '');
BEGIN
  PERFORM internal.commercial_exigir_membro();
  SELECT * INTO a FROM public.commercial_activities WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.commercial_lead_visivel(a.lead_id) THEN RAISE EXCEPTION 'COMMERCIAL_ATIVIDADE_NAO_ENCONTRADA'; END IF;
  IF a.concluida_em IS NOT NULL OR a.cancelada_em IS NOT NULL THEN RAISE EXCEPTION 'COMMERCIAL_ATIVIDADE_ENCERRADA'; END IF;
  IF v_res IS NULL OR char_length(v_res) NOT BETWEEN 2 AND 2000 THEN RAISE EXCEPTION 'COMMERCIAL_RESULTADO_OBRIGATORIO'; END IF;
  UPDATE public.commercial_activities SET
    concluida_em = CASE WHEN p_cancelar THEN NULL ELSE now() END,
    cancelada_em = CASE WHEN p_cancelar THEN now() ELSE NULL END,
    resultado = v_res, updated_at = now()
  WHERE id = p_id;
  -- atividade realizada com o cliente conta como contato (alimenta último contato / primeiro atendimento)
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (a.lead_id,
          CASE WHEN NOT p_cancelar AND a.tipo IN ('ligacao', 'reuniao', 'demonstracao', 'retorno') THEN 'contato' ELSE 'atividade' END,
          left(format('%s (%s): %s — %s', CASE WHEN p_cancelar THEN 'Cancelada' ELSE 'Concluída' END, a.tipo, a.titulo, v_res), 2000),
          auth.uid());
END $$;

-- 8.6 Propostas
CREATE OR REPLACE FUNCTION public.commercial_proposta_criar(
  p_lead uuid, p_plano text, p_addons text[], p_qtd_lojas int, p_qtd_caixas int,
  p_valor_centavos int, p_condicoes text, p_validade date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, internal, pg_temp AS $$
DECLARE l public.commercial_leads; v_tabela int; v_prov boolean := false; v_valor int; v_id uuid; v_versao int;
  v_addons text[] := coalesce(p_addons, '{}');
BEGIN
  l := internal.commercial_lead_travar(p_lead);
  IF (SELECT tipo FROM public.commercial_stages WHERE codigo = l.status) <> 'aberta' THEN RAISE EXCEPTION 'COMMERCIAL_LEAD_ENCERRADO'; END IF;
  IF p_validade IS NULL OR p_validade < current_date OR p_validade > current_date + 180 THEN RAISE EXCEPTION 'COMMERCIAL_VALIDADE_INVALIDA'; END IF;
  IF p_plano IS NOT NULL THEN
    -- valor de tabela calculado pelo banco a partir de saas.planos (mesma regra da Central de Conversão)
    v_tabela := internal.commercial_valor_tabela(p_plano, v_addons, coalesce(p_qtd_lojas, 1), coalesce(p_qtd_caixas, coalesce(p_qtd_lojas, 1)));
    SELECT bool_or(preco_placeholder) INTO v_prov FROM saas.planos WHERE codigo = p_plano OR codigo = ANY (v_addons);
  ELSIF cardinality(v_addons) > 0 THEN
    RAISE EXCEPTION 'COBRANCA_PLANO_INVALIDO';
  END IF;
  v_valor := coalesce(p_valor_centavos, v_tabela);
  IF v_valor IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_VALOR_OBRIGATORIO'; END IF;
  SELECT coalesce(max(versao), 0) + 1 INTO v_versao FROM public.commercial_proposals WHERE lead_id = p_lead;
  INSERT INTO public.commercial_proposals (lead_id, versao, plano_codigo, addons, qtd_lojas, qtd_caixas, valor_tabela_centavos,
    preco_tabela_provisorio, valor_mensal_centavos, condicoes, validade, criado_por)
  VALUES (p_lead, v_versao, p_plano, v_addons, p_qtd_lojas, p_qtd_caixas, v_tabela, coalesce(v_prov, false), v_valor,
          nullif(btrim(coalesce(p_condicoes, '')), ''), p_validade, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (p_lead, 'proposta', format('Proposta v%s criada (rascunho)', v_versao), auth.uid());
  RETURN v_id;
EXCEPTION
  WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
END $$;

-- Transições: rascunho→enviada|cancelada; enviada→em_negociacao|recusada|expirada|cancelada;
-- em_negociacao→enviada|recusada|expirada|cancelada. "aceita" só pela conversão.
-- Enviar move o lead para "Proposta enviada"; negociar move para "Negociação" (só avança, nunca recua).
CREATE OR REPLACE FUNCTION public.commercial_proposta_status(p_id uuid, p_status text, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE p public.commercial_proposals; l public.commercial_leads; v_ok boolean; v_etapa text; v_ordem_atual int; v_ordem_nova int;
BEGIN
  PERFORM internal.commercial_exigir_membro();
  SELECT * INTO p FROM public.commercial_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.commercial_lead_visivel(p.lead_id) THEN RAISE EXCEPTION 'COMMERCIAL_PROPOSTA_NAO_ENCONTRADA'; END IF;
  l := internal.commercial_lead_travar(p.lead_id);
  v_ok := (p.status, p_status) IN (('rascunho', 'enviada'), ('rascunho', 'cancelada'),
            ('enviada', 'em_negociacao'), ('enviada', 'recusada'), ('enviada', 'expirada'), ('enviada', 'cancelada'),
            ('em_negociacao', 'enviada'), ('em_negociacao', 'recusada'), ('em_negociacao', 'expirada'), ('em_negociacao', 'cancelada'));
  IF NOT v_ok THEN RAISE EXCEPTION 'COMMERCIAL_TRANSICAO_PROPOSTA_INVALIDA'; END IF;
  IF p_status = 'enviada' AND p.validade < current_date THEN RAISE EXCEPTION 'COMMERCIAL_VALIDADE_INVALIDA'; END IF;
  UPDATE public.commercial_proposals SET status = p_status, updated_at = now(),
    enviada_em = CASE WHEN p_status = 'enviada' THEN coalesce(enviada_em, now()) ELSE enviada_em END,
    decidida_em = CASE WHEN p_status IN ('recusada', 'expirada', 'cancelada') THEN now() ELSE decidida_em END,
    motivo = coalesce(left(nullif(btrim(coalesce(p_motivo, '')), ''), 500), motivo)
  WHERE id = p_id;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (p.lead_id, 'proposta', left(format('Proposta v%s: %s → %s%s', p.versao, p.status, p_status,
          coalesce(' · ' || nullif(btrim(coalesce(p_motivo, '')), ''), '')), 2000), auth.uid());
  v_etapa := CASE p_status WHEN 'enviada' THEN 'proposta' WHEN 'em_negociacao' THEN 'negociacao' END;
  IF v_etapa IS NOT NULL THEN
    SELECT s.ordem INTO v_ordem_atual FROM public.commercial_stages s WHERE s.codigo = l.status AND s.tipo = 'aberta';
    SELECT s.ordem INTO v_ordem_nova FROM public.commercial_stages s WHERE s.codigo = v_etapa AND s.ativo;
    IF v_ordem_atual IS NOT NULL AND v_ordem_nova IS NOT NULL AND v_ordem_nova > v_ordem_atual THEN
      PERFORM public.commercial_lead_mover(p.lead_id, v_etapa, NULL);
    END IF;
  END IF;
END $$;

-- 8.7 Conversão de lead (site/manual) em cliente. Só gestor (toda contratação passa pelo dono).
--     Exige proposta enviada/em negociação; preserva o lead (mesmo id) e não duplica cliente.
--     NÃO cria cobrança, boleto, Pix nem assinatura. Teste grátis converte pela Central (commercial_converter_trial).
CREATE OR REPLACE FUNCTION public.commercial_lead_converter(p_lead uuid, p_proposta uuid, p_observacao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE l public.commercial_leads; p public.commercial_proposals; v_obs text := btrim(coalesce(p_observacao, ''));
  v_cliente uuid; v_dig text; v_plano text;
BEGIN
  PERFORM internal.commercial_exigir_gestor();
  l := internal.commercial_lead_travar(p_lead);
  IF l.origem = 'teste_gratis' THEN RAISE EXCEPTION 'COMMERCIAL_USE_CENTRAL'; END IF;
  IF l.status = 'contratado' THEN RAISE EXCEPTION 'COMMERCIAL_JA_CLIENTE'; END IF;
  IF l.status = 'perdido' THEN RAISE EXCEPTION 'COMMERCIAL_LEAD_ENCERRADO'; END IF;
  IF char_length(v_obs) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'COMMERCIAL_OBSERVACAO_OBRIGATORIA'; END IF;
  SELECT * INTO p FROM public.commercial_proposals WHERE id = p_proposta AND lead_id = p_lead FOR UPDATE;
  IF NOT FOUND OR p.status NOT IN ('enviada', 'em_negociacao') THEN RAISE EXCEPTION 'COMMERCIAL_PROPOSTA_NAO_CONVERTIVEL'; END IF;
  -- mesmo cliente já cadastrado por outro lead (contato igual, ou mesma loja no mesmo produto)
  v_dig := internal.commercial_digitos(l.contact);
  IF EXISTS (SELECT 1 FROM public.commercial_customers c
              WHERE c.lead_id IS DISTINCT FROM p_lead AND c.subscription_status <> 'cancelado'
                AND ((v_dig IS NOT NULL AND char_length(v_dig) >= 8 AND internal.commercial_digitos(c.contact) = v_dig)
                     OR (c.product = l.product AND lower(btrim(c.store_name)) = lower(btrim(l.store))))) THEN
    RAISE EXCEPTION 'COMMERCIAL_CLIENTE_DUPLICADO';
  END IF;
  v_plano := coalesce(p.plano_codigo || CASE WHEN cardinality(p.addons) > 0 THEN ' + ' || array_to_string(p.addons, '+') ELSE '' END,
                      'Proposta v' || p.versao);
  UPDATE public.commercial_proposals SET status = 'aceita', decidida_em = now(), updated_at = now() WHERE id = p.id;
  UPDATE public.commercial_proposals SET status = 'cancelada', decidida_em = now(), updated_at = now(),
         motivo = 'Outra proposta aceita (v' || p.versao || ')'
   WHERE lead_id = p_lead AND id <> p.id AND status IN ('rascunho', 'enviada', 'em_negociacao');
  UPDATE public.commercial_leads SET status = 'contratado', etapa_desde = now(), updated_at = now(), motivo_perda = NULL WHERE id = p_lead;
  INSERT INTO public.commercial_lead_events (lead_id, kind, from_status, to_status, author) VALUES (p_lead, 'status', l.status, 'contratado', auth.uid());
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author) VALUES (p_lead, 'conversao', left(format(
    'Convertido manualmente com a proposta v%s: %s · R$ %s/mês%s. %s', p.versao, v_plano,
    to_char(p.valor_mensal_centavos / 100.0, 'FM999G999G990D00'),
    CASE WHEN p.preco_tabela_provisorio THEN ' (preço de tabela provisório)' ELSE '' END, v_obs), 2000), auth.uid());
  INSERT INTO public.commercial_customers (lead_id, product, store_name, contact, plan, monthly_value, subscription_status, notes)
  VALUES (p_lead, l.product, l.store, left(l.contact, 60), left(v_plano, 60), round(p.valor_mensal_centavos / 100.0, 2), 'ativo', left(v_obs, 2000))
  ON CONFLICT (lead_id) DO UPDATE SET plan = EXCLUDED.plan, monthly_value = EXCLUDED.monthly_value,
    subscription_status = 'ativo', notes = EXCLUDED.notes
  RETURNING id INTO v_cliente;
  RETURN v_cliente;
END $$;

-- 8.8 Equipe (gestor). O usuário precisa existir no Supabase Auth (convite/criação é fora do hub).
CREATE OR REPLACE FUNCTION public.commercial_equipe_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_gestor boolean := public.is_commercial_admin();
BEGIN
  PERFORM internal.commercial_exigir_membro();
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'user_id', a.user_id, 'nome', coalesce(a.nome, CASE WHEN v_gestor THEN au.email END, 'Membro da equipe'),
            'papel', a.papel, 'ativo', a.ativo,
            'email', CASE WHEN v_gestor THEN au.email END) ORDER BY a.ativo DESC, a.papel, a.nome), '[]'::jsonb)
          FROM public.commercial_admins a LEFT JOIN auth.users au ON au.id = a.user_id
         WHERE v_gestor OR a.ativo);
END $$;

CREATE OR REPLACE FUNCTION public.commercial_equipe_salvar(p_email text, p_nome text, p_papel text, p_ativo boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid;
BEGIN
  PERFORM internal.commercial_exigir_gestor();
  IF p_papel NOT IN ('gestor', 'vendedor') THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO'; END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_USUARIO_NAO_ENCONTRADO'; END IF;
  INSERT INTO public.commercial_admins (user_id, nome, papel, ativo)
  VALUES (v_user, nullif(btrim(coalesce(p_nome, '')), ''), p_papel, coalesce(p_ativo, true))
  ON CONFLICT (user_id) DO UPDATE SET nome = coalesce(EXCLUDED.nome, commercial_admins.nome), papel = EXCLUDED.papel, ativo = EXCLUDED.ativo;
  -- nunca deixar a equipe sem gestor ativo
  IF NOT EXISTS (SELECT 1 FROM public.commercial_admins WHERE papel = 'gestor' AND ativo) THEN
    RAISE EXCEPTION 'COMMERCIAL_ULTIMO_GESTOR';
  END IF;
  RETURN v_user;
EXCEPTION
  WHEN check_violation THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
END $$;

-- 8.9 Etapas (gestor): renomear, reordenar, ativar/desativar etapas de trabalho e criar novas.
--     Novo / Proposta enviada / Negociação / Convertido / Perdido são do sistema: só o rótulo muda.
CREATE OR REPLACE FUNCTION public.commercial_etapa_salvar(p_codigo text, p_rotulo text, p_ordem int, p_ativo boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE s public.commercial_stages;
BEGIN
  PERFORM internal.commercial_exigir_gestor();
  SELECT * INTO s FROM public.commercial_stages WHERE codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    IF p_ordem IS NULL OR p_ordem NOT BETWEEN 11 AND 89 THEN RAISE EXCEPTION 'COMMERCIAL_ORDEM_INVALIDA'; END IF;
    INSERT INTO public.commercial_stages (codigo, rotulo, ordem, tipo, ativo) VALUES (p_codigo, btrim(p_rotulo), p_ordem, 'aberta', coalesce(p_ativo, true));
    RETURN;
  END IF;
  IF s.sistema AND (p_ordem IS DISTINCT FROM s.ordem OR NOT coalesce(p_ativo, true)) THEN RAISE EXCEPTION 'COMMERCIAL_ETAPA_SISTEMA'; END IF;
  IF NOT s.sistema AND (p_ordem IS NULL OR p_ordem NOT BETWEEN 11 AND 89) THEN RAISE EXCEPTION 'COMMERCIAL_ORDEM_INVALIDA'; END IF;
  IF NOT coalesce(p_ativo, true) AND EXISTS (SELECT 1 FROM public.commercial_leads WHERE status = p_codigo) THEN
    RAISE EXCEPTION 'COMMERCIAL_ETAPA_EM_USO';
  END IF;
  UPDATE public.commercial_stages SET rotulo = btrim(p_rotulo), ordem = p_ordem, ativo = coalesce(p_ativo, true), updated_at = now()
   WHERE codigo = p_codigo;
EXCEPTION
  WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Privilégios das funções
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION internal.commercial_exigir_membro(), internal.commercial_exigir_gestor(),
  internal.commercial_lead_travar(uuid), internal.commercial_digitos(text) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.is_commercial_admin()', 'public.is_commercial_member()', 'public.commercial_meu_papel()',
    'public.commercial_pode_ver(uuid)', 'public.commercial_lead_visivel(uuid)',
    'public.commercial_lead_mover(uuid, text, text)', 'public.commercial_lead_atribuir(uuid, uuid)',
    'public.commercial_lead_atualizar(uuid, jsonb)',
    'public.commercial_lead_criar(text, text, text, text, text, text, text, text, text, text, boolean)',
    'public.commercial_atividade_agendar(uuid, text, text, timestamptz, uuid)',
    'public.commercial_atividade_concluir(uuid, text, boolean)',
    'public.commercial_proposta_criar(uuid, text, text[], int, int, int, text, date)',
    'public.commercial_proposta_status(uuid, text, text)', 'public.commercial_lead_converter(uuid, uuid, text)',
    'public.commercial_equipe_listar()', 'public.commercial_equipe_salvar(text, text, text, boolean)',
    'public.commercial_etapa_salvar(text, text, int, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- Prova mínima (falha a migration se algo ficou aberto)
DO $verify$
BEGIN
  IF has_table_privilege('anon', 'public.commercial_activities', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.commercial_proposals', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.commercial_audit', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.commercial_stages', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'CRM: anon com acesso a tabela comercial';
  END IF;
  IF has_table_privilege('authenticated', 'public.commercial_audit', 'INSERT,UPDATE,DELETE')
     OR has_column_privilege('authenticated', 'public.commercial_leads', 'status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.commercial_leads', 'owner_id', 'UPDATE') THEN
    RAISE EXCEPTION 'CRM: authenticated com escrita direta indevida';
  END IF;
END
$verify$;

COMMIT;
