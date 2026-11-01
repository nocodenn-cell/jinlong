-- GROWTH-001 · Central de Conversão (hub comercial): testes grátis → cliente pagante.
-- NÃO APLICADA em produção. Aplicar só com autorização explícita do dono do produto.
--
-- Regra de negócio: TODA contratação passa pelo dono da Nature Code. Nada aqui cria cobrança,
-- assinatura no Asaas ou pagamento. A conversão é manual (RPC chamada pelo hub, com justificativa) e
-- usa as mesmas regras de plano/limites de saas.planos e o trigger de auditoria de saas.assinaturas.
--
-- Reuso (sem tabela nova): commercial_leads / commercial_lead_events / commercial_customers (hub,
-- 20261021115705) + saas.assinaturas / saas.planos (20261020100000) + internal.cobranca_reativar.
-- O hub continua SEM service role: lê/escreve com o JWT do admin; o acesso a saas/empresas/atividade
-- é feito só por RPCs SECURITY DEFINER que exigem public.is_commercial_admin().
--
-- LGPD: o hub vê só dados de contato do DONO (nome, e-mail, telefone informado no cadastro) e
-- indicadores AGREGADOS de uso (contagens/datas). Nenhum valor de venda, cliente final ou produto.
--
-- ADITIVA. Rollback: backend/supabase/rollback/20261101120000_growth001_central_conversao.rollback.sql
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lead comercial ligado à empresa do teste grátis
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_leads
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'site' CHECK (origem IN ('site', 'teste_gratis')),
  ADD COLUMN IF NOT EXISTS empresa_id uuid NULL REFERENCES public.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email text NULL CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 254),
  ADD COLUMN IF NOT EXISTS interesse text NULL CHECK (interesse IS NULL OR interesse IN ('baixo', 'medio', 'alto')),
  ADD COLUMN IF NOT EXISTS proximo_contato date NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commercial_leads_empresa_uniq
  ON public.commercial_leads (empresa_id) WHERE empresa_id IS NOT NULL;

-- Trial pode não ter telefone: contato por e-mail.
ALTER TABLE public.commercial_leads DROP CONSTRAINT IF EXISTS commercial_leads_channel_check;
ALTER TABLE public.commercial_leads ADD CONSTRAINT commercial_leads_channel_check
  CHECK (channel IN ('whatsapp', 'wechat', 'email'));

-- Histórico: + pedido de contratação feito pelo DONO no ERP e + conversão manual.
ALTER TABLE public.commercial_lead_events DROP CONSTRAINT IF EXISTS commercial_lead_events_kind_check;
ALTER TABLE public.commercial_lead_events ADD CONSTRAINT commercial_lead_events_kind_check
  CHECK (kind IN ('nota', 'contato', 'status', 'solicitacao', 'conversao'));

-- Admin do hub edita interesse e próximo contato direto (RLS commercial_leads_admin_update continua valendo).
-- anon segue só com INSERT nas colunas antigas: não grava origem/empresa_id/email.
GRANT UPDATE (interesse, proximo_contato) ON public.commercial_leads TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Criação idempotente do lead de um teste grátis
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.commercial_protocolo()
RETURNS text LANGUAGE sql VOLATILE SET search_path = pg_temp AS $$
  SELECT 'JL-' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD') || '-' ||
         string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  FROM generate_series(1, 6);
$$;

-- Teste grátis = assinatura criada por plataforma_iniciar_trial (único caminho que grava trial_fim).
CREATE OR REPLACE FUNCTION internal.commercial_trial_lead(p_empresa uuid, p_telefone text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE v_id uuid; v_tel text := left(nullif(btrim(coalesce(p_telefone, '')), ''), 60);
  v_emp text; v_criado timestamptz; v_nome text; v_email text; v_idioma text;
BEGIN
  SELECT id INTO v_id FROM public.commercial_leads WHERE empresa_id = p_empresa;
  IF FOUND THEN
    IF char_length(v_tel) >= 3 THEN
      UPDATE public.commercial_leads SET contact = v_tel, channel = 'whatsapp', updated_at = now()
       WHERE id = v_id AND channel = 'email';
    END IF;
    RETURN v_id;
  END IF;
  SELECT e.nome, a.created_at INTO v_emp, v_criado
    FROM saas.assinaturas a JOIN public.empresas e ON e.id = a.empresa_id
   WHERE a.empresa_id = p_empresa AND a.trial_fim IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_NAO_E_TESTE'; END IF;
  SELECT u.nome, au.email, u.idioma_preferido INTO v_nome, v_email, v_idioma
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
    LEFT JOIN auth.users au ON au.id = u.id
   WHERE v.empresa_id = p_empresa AND v.papel = 'DONO'
   ORDER BY v.ativo DESC, v.created_at
   LIMIT 1;
  IF char_length(coalesce(v_tel, '')) < 3 THEN v_tel := NULL; END IF;
  INSERT INTO public.commercial_leads (protocol, product, name, store, contact, channel, locale, origem, empresa_id, email, created_at, updated_at)
  VALUES (internal.commercial_protocolo(), 'jinlong',
          left(coalesce(nullif(btrim(v_nome), ''), v_emp), 80), left(v_emp, 120),
          coalesce(v_tel, left(v_email, 60), 'sem contato'),
          CASE WHEN v_tel IS NOT NULL THEN 'whatsapp' ELSE 'email' END,
          CASE WHEN v_idioma = 'zh' THEN 'zh-CN' ELSE 'pt-BR' END,
          'teste_gratis', p_empresa, v_email, v_criado, now())
  ON CONFLICT (empresa_id) WHERE empresa_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.commercial_leads WHERE empresa_id = p_empresa; END IF;
  RETURN v_id;
END $$;

-- Servidor do ERP (cadastro do /teste-gratis, service_role) e admin do hub.
CREATE OR REPLACE FUNCTION public.commercial_trial_garantir_lead(p_empresa uuid, p_telefone text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
BEGIN
  IF NOT (public.is_commercial_admin() OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;
  RETURN internal.commercial_trial_lead(p_empresa, p_telefone);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Central: testes grátis + situação da assinatura + uso agregado + funil comercial
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commercial_trials_listar(p_empresa uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE r jsonb;
BEGIN
  -- identidade explícita (guarda c1-secdef): sem sessão nega antes de consultar o papel
  IF auth.uid() IS NULL OR NOT public.is_commercial_admin() THEN RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(t ORDER BY t.criado_em DESC), '[]'::jsonb) INTO r FROM (
    SELECT
      a.empresa_id, e.nome AS empresa_nome, a.created_at AS criado_em, a.trial_fim,
      a.status, a.motivo_status, a.plano_codigo, a.addons, a.qtd_lojas, a.qtd_caixas,
      a.forma_pagamento, a.valor_mensal_centavos,
      (a.asaas_subscription_id IS NOT NULL) AS tem_cobranca_asaas,
      (SELECT to_jsonb(x) FROM (SELECT l.id, l.protocol, l.status, l.interesse, l.proximo_contato, l.name, l.contact,
                                       l.channel, l.email, l.locale, l.created_at
                                  FROM public.commercial_leads l WHERE l.empresa_id = a.empresa_id) x) AS lead,
      (SELECT max(ev.created_at) FROM public.commercial_lead_events ev JOIN public.commercial_leads l ON l.id = ev.lead_id
        WHERE l.empresa_id = a.empresa_id AND ev.kind = 'contato') AS ultimo_contato_em,
      (SELECT max(ev.created_at) FROM public.commercial_lead_events ev JOIN public.commercial_leads l ON l.id = ev.lead_id
        WHERE l.empresa_id = a.empresa_id AND ev.kind = 'solicitacao') AS solicitou_contratacao_em,
      jsonb_build_object(
        'ultimo_acesso', (SELECT max(au.last_sign_in_at) FROM public.usuario_vinculos v JOIN auth.users au ON au.id = v.usuario_id
                           WHERE v.empresa_id = a.empresa_id AND v.ativo),
        'usuarios_ativos', (SELECT count(DISTINCT v.usuario_id) FROM public.usuario_vinculos v
                             WHERE v.empresa_id = a.empresa_id AND v.ativo),
        'lojas_ativas', (SELECT count(*) FROM public.lojas lj WHERE lj.empresa_id = a.empresa_id AND lj.ativo),
        'produtos_proprios', (SELECT count(*) FROM public.produtos p JOIN public.lojas lj ON lj.id = p.loja_id
                               WHERE lj.empresa_id = a.empresa_id AND coalesce(p.observacao, '') <> 'DEMO_TRIAL'),
        'caixas_abertos', (SELECT count(*) FROM public.caixas c JOIN public.lojas lj ON lj.id = c.loja_id
                            WHERE lj.empresa_id = a.empresa_id),
        'vendas_total', (SELECT count(*) FROM public.vendas vd JOIN public.caixas c ON c.id = vd.caixa_id
                          JOIN public.lojas lj ON lj.id = c.loja_id
                          WHERE lj.empresa_id = a.empresa_id AND vd.status = 'CONCLUIDA'),
        'vendas_7d', (SELECT count(*) FROM public.vendas vd JOIN public.caixas c ON c.id = vd.caixa_id
                       JOIN public.lojas lj ON lj.id = c.loja_id
                       WHERE lj.empresa_id = a.empresa_id AND vd.status = 'CONCLUIDA' AND vd.data > now() - interval '7 days'),
        'ultima_venda', (SELECT max(vd.data) FROM public.vendas vd JOIN public.caixas c ON c.id = vd.caixa_id
                          JOIN public.lojas lj ON lj.id = c.loja_id
                          WHERE lj.empresa_id = a.empresa_id AND vd.status = 'CONCLUIDA')
      ) AS atividade
    FROM saas.assinaturas a
    JOIN public.empresas e ON e.id = a.empresa_id
    WHERE a.trial_fim IS NOT NULL AND (p_empresa IS NULL OR a.empresa_id = p_empresa)
    ORDER BY a.created_at DESC
    LIMIT 1000
  ) t;
  RETURN r;
END $$;

-- Catálogo para o formulário de conversão (inclui inativos? não: só o que pode ser contratado).
CREATE OR REPLACE FUNCTION public.commercial_planos()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
BEGIN
  -- identidade explícita (guarda c1-secdef): sem sessão nega antes de consultar o papel
  IF auth.uid() IS NULL OR NOT public.is_commercial_admin() THEN RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'nome', nome, 'tipo', tipo,
            'preco_loja_centavos', preco_loja_centavos, 'preco_caixa_adicional_centavos', preco_caixa_adicional_centavos,
            'caixas_inclusos_por_loja', caixas_inclusos_por_loja, 'max_lojas', max_lojas,
            'preco_placeholder', preco_placeholder) ORDER BY ordem), '[]'::jsonb)
          FROM saas.planos WHERE ativo);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Valor de tabela (espelha calcularValorMensal de pdv-importados/lib/cobranca/planos.ts)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.commercial_valor_tabela(p_plano text, p_addons text[], p_qtd_lojas int, p_qtd_caixas int)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = saas, pg_temp AS $$
DECLARE p saas.planos; v_lojas int := greatest(1, p_qtd_lojas); v_caixas int := greatest(v_lojas, p_qtd_caixas);
  v_total bigint; v_add bigint;
BEGIN
  SELECT * INTO p FROM saas.planos WHERE codigo = p_plano AND tipo = 'PLANO' AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'COBRANCA_PLANO_INVALIDO'; END IF;
  IF p.max_lojas IS NOT NULL AND v_lojas > p.max_lojas THEN RAISE EXCEPTION 'PLANO_LIMITE_LOJAS'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_addons, '{}')) x
              WHERE x NOT IN (SELECT codigo FROM saas.planos WHERE tipo = 'ADDON' AND ativo)) THEN
    RAISE EXCEPTION 'COBRANCA_ADDON_INVALIDO';
  END IF;
  v_total := p.preco_loja_centavos::bigint * v_lojas
           + greatest(0, v_caixas - p.caixas_inclusos_por_loja * v_lojas)::bigint * p.preco_caixa_adicional_centavos;
  SELECT coalesce(sum(ad.preco_loja_centavos::bigint * v_lojas), 0) INTO v_add
    FROM saas.planos ad WHERE ad.tipo = 'ADDON' AND ad.ativo AND ad.codigo = ANY (coalesce(p_addons, '{}'));
  RETURN (v_total + v_add)::int;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Conversão MANUAL de teste grátis em cliente pagante (só admin do hub; sem Asaas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commercial_converter_trial(
  p_empresa uuid, p_plano text, p_addons text[], p_qtd_lojas int, p_qtd_caixas int,
  p_forma text, p_valor_centavos int, p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE a saas.assinaturas; v_tabela int; v_valor int; v_lojas_ativas int; v_lead uuid; v_status_ant text;
  v_obs text := btrim(coalesce(p_observacao, '')); v_addons text[] := coalesce(p_addons, '{}');
BEGIN
  -- identidade explícita (guarda c1-secdef): sem sessão nega antes de consultar o papel
  IF auth.uid() IS NULL OR NOT public.is_commercial_admin() THEN RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501'; END IF;
  IF char_length(v_obs) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'COMMERCIAL_OBSERVACAO_OBRIGATORIA'; END IF;
  IF p_forma NOT IN ('PIX', 'BOLETO', 'CARTAO', 'UNDEFINED') THEN RAISE EXCEPTION 'COMMERCIAL_FORMA_INVALIDA'; END IF;
  IF p_qtd_lojas IS NULL OR p_qtd_lojas < 1 OR p_qtd_lojas > 200 OR p_qtd_caixas IS NULL OR p_qtd_caixas < p_qtd_lojas OR p_qtd_caixas > 1000 THEN
    RAISE EXCEPTION 'COMMERCIAL_QUANTIDADE_INVALIDA';
  END IF;

  SELECT * INTO a FROM saas.assinaturas WHERE empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND OR a.trial_fim IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_NAO_E_TESTE'; END IF;
  IF a.status = 'ATIVA' THEN RAISE EXCEPTION 'COMMERCIAL_JA_CLIENTE'; END IF;
  IF NOT (a.status = 'TRIAL' OR (a.status = 'SUSPENSA' AND a.motivo_status = 'TRIAL_EXPIRADO')) THEN
    RAISE EXCEPTION 'COMMERCIAL_STATUS_NAO_CONVERTIVEL';
  END IF;
  -- assinatura já criada no Asaas pelo próprio cliente: converter aqui duplicaria cobrança
  IF a.asaas_subscription_id IS NOT NULL THEN RAISE EXCEPTION 'COMMERCIAL_TEM_COBRANCA_ASAAS'; END IF;

  SELECT count(*) INTO v_lojas_ativas FROM public.lojas WHERE empresa_id = p_empresa AND ativo;
  IF v_lojas_ativas > p_qtd_lojas THEN RAISE EXCEPTION 'COMMERCIAL_LOJAS_ATIVAS_ACIMA'; END IF;
  v_tabela := internal.commercial_valor_tabela(p_plano, v_addons, p_qtd_lojas, p_qtd_caixas);
  v_valor := coalesce(p_valor_centavos, v_tabela);
  IF v_valor < 0 OR v_valor > 100000000 THEN RAISE EXCEPTION 'COMMERCIAL_VALOR_INVALIDO'; END IF;

  -- auditoria (saas.tg_auditar_assinatura): ator = admin do JWT, origem = conversão manual
  PERFORM set_config('fp.cobranca_origem', 'hub_conversao_manual', true);
  UPDATE saas.assinaturas SET
    plano_codigo = p_plano, addons = v_addons, status = 'ATIVA', motivo_status = 'CONVERSAO_MANUAL',
    qtd_lojas = p_qtd_lojas, qtd_caixas = p_qtd_caixas, forma_pagamento = p_forma, valor_mensal_centavos = v_valor,
    inadimplente_desde = NULL, acesso_ate = NULL, cancelada_em = NULL, updated_at = now()
  WHERE empresa_id = p_empresa;
  -- trial expirado tinha suspendido as vendas: devolve o valor anterior (não desfaz suspensão manual)
  PERFORM internal.cobranca_reativar(p_empresa);
  UPDATE public.empresas SET plano = p_plano,
    max_lojas = (SELECT max_lojas FROM saas.planos WHERE codigo = p_plano), updated_at = now()
  WHERE id = p_empresa;

  v_lead := internal.commercial_trial_lead(p_empresa, NULL);
  SELECT status INTO v_status_ant FROM public.commercial_leads WHERE id = v_lead FOR UPDATE;
  UPDATE public.commercial_leads SET status = 'contratado', updated_at = now() WHERE id = v_lead;
  IF v_status_ant IS DISTINCT FROM 'contratado' THEN
    INSERT INTO public.commercial_lead_events (lead_id, kind, from_status, to_status) VALUES (v_lead, 'status', v_status_ant, 'contratado');
  END IF;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body) VALUES (v_lead, 'conversao', left(format(
    'Convertido manualmente: %s%s · %s loja(s) / %s caixa(s) · %s · R$ %s/mês (tabela R$ %s). %s',
    p_plano, CASE WHEN cardinality(v_addons) > 0 THEN ' + ' || array_to_string(v_addons, '+') ELSE '' END,
    p_qtd_lojas, p_qtd_caixas, p_forma, to_char(v_valor / 100.0, 'FM999G999G990D00'),
    to_char(v_tabela / 100.0, 'FM999G999G990D00'), v_obs), 2000));
  INSERT INTO public.commercial_customers (lead_id, product, store_name, contact, plan, monthly_value, subscription_status, notes)
  SELECT l.id, 'jinlong', l.store, l.contact,
         p_plano || CASE WHEN cardinality(v_addons) > 0 THEN ' + ' || array_to_string(v_addons, '+') ELSE '' END,
         round(v_valor / 100.0, 2), 'ativo', left(v_obs, 2000)
    FROM public.commercial_leads l WHERE l.id = v_lead
  ON CONFLICT (lead_id) DO UPDATE SET plan = EXCLUDED.plan, monthly_value = EXCLUDED.monthly_value,
    subscription_status = 'ativo', notes = EXCLUDED.notes;

  RETURN jsonb_build_object('empresa_id', p_empresa, 'lead_id', v_lead, 'plano', p_plano,
    'valor_mensal_centavos', v_valor, 'valor_tabela_centavos', v_tabela);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Pedido de contratação feito pelo DONO no ERP (/admin/assinatura) → cai na Central
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commercial_solicitar_contratacao(p_plano text, p_mensagem text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE v_emp uuid := public.fp_empresa_contexto(NULL); v_lead uuid;
BEGIN
  IF auth.uid() IS NULL OR v_emp IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.usuario_vinculos v
        WHERE v.usuario_id = auth.uid() AND v.empresa_id = v_emp AND v.papel = 'DONO' AND v.ativo) THEN
    RAISE EXCEPTION 'COMMERCIAL_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;
  IF p_plano IS NOT NULL AND NOT EXISTS (SELECT 1 FROM saas.planos WHERE codigo = p_plano AND tipo = 'PLANO' AND ativo) THEN
    RAISE EXCEPTION 'COBRANCA_PLANO_INVALIDO';
  END IF;
  v_lead := internal.commercial_trial_lead(v_emp, NULL);
  -- clique repetido não gera pedido duplicado
  IF EXISTS (SELECT 1 FROM public.commercial_lead_events
              WHERE lead_id = v_lead AND kind = 'solicitacao' AND created_at > now() - interval '10 minutes') THEN
    RETURN true;
  END IF;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (v_lead, 'solicitacao',
          left('Pedido de contratação pelo dono' || coalesce(' · plano ' || p_plano, '') ||
               coalesce(' · ' || nullif(btrim(p_mensagem), ''), ''), 2000),
          auth.uid());
  UPDATE public.commercial_leads SET interesse = 'alto', updated_at = now() WHERE id = v_lead;
  RETURN true;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Backfill: lead para cada teste grátis já existente
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT empresa_id FROM saas.assinaturas WHERE trial_fim IS NOT NULL LOOP
    PERFORM internal.commercial_trial_lead(r.empresa_id, NULL);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Privilégios
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION internal.commercial_protocolo(), internal.commercial_trial_lead(uuid, text),
  internal.commercial_valor_tabela(text, text[], int, int) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.commercial_trials_listar(uuid)', 'public.commercial_planos()',
    'public.commercial_converter_trial(uuid, text, text[], int, int, text, int, text)',
    'public.commercial_solicitar_contratacao(text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.commercial_trial_garantir_lead(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_trial_garantir_lead(uuid, text) TO authenticated, service_role;

COMMIT;
