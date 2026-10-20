-- Cobrança, planos e trial automático (sprint "vender o produto").
-- Depende do multiempresa (PR #584): empresas, lojas.empresa_id, fp_pode_empresa, plataforma_provisionar_empresa,
-- configuracoes_gerais por empresa (vendas_suspensas / motivo_suspensao).
--
-- ADITIVA e reversível: rollback em supabase/rollback/20261020100000_cobranca_planos_trial.rollback.sql.
-- Cliente 1 (empresa sem linha em assinaturas) continua com TODOS os recursos: nada muda para ele.
--
-- Suspensão automática reaproveita o módulo existente (105_suspensao_vendas / c2): grava
-- vendas_suspensas='true' + motivo na config da empresa; o trigger de vendas e o caixa já bloqueiam.
-- Reativação no pagamento devolve o valor anterior (não desfaz suspensão manual do gerente).
BEGIN;

-- Cobrança SaaS da Jinlong (empresa → Jinlong) fica num SCHEMA PRÓPRIO, separado do financeiro
-- operacional dos lojistas (contas_pagar, movimentos_financeiros, ...). O schema NÃO é exposto
-- pela API REST (config.toml: schemas = public, graphql_public): acesso só por RPCs SECURITY DEFINER.
CREATE SCHEMA IF NOT EXISTS saas;
REVOKE ALL ON SCHEMA saas FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA saas TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de planos (PREÇOS = PLACEHOLDER, o dono do produto decide)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas.planos (
  codigo text PRIMARY KEY CHECK (codigo ~ '^[A-Z_]+$'),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'PLANO' CHECK (tipo IN ('PLANO', 'ADDON')),
  ordem int NOT NULL DEFAULT 0,
  recursos text[] NOT NULL DEFAULT '{}',
  preco_loja_centavos int NOT NULL CHECK (preco_loja_centavos >= 0),
  preco_caixa_adicional_centavos int NOT NULL DEFAULT 0 CHECK (preco_caixa_adicional_centavos >= 0),
  caixas_inclusos_por_loja int NOT NULL DEFAULT 1 CHECK (caixas_inclusos_por_loja >= 0),
  max_lojas int NULL CHECK (max_lojas IS NULL OR max_lojas > 0),
  preco_placeholder boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE saas.planos IS
  'Catálogo global de planos/add-ons. Preços com preco_placeholder=true são PROVISÓRIOS: definir antes de vender.';

INSERT INTO saas.planos (codigo, nome, tipo, ordem, recursos, preco_loja_centavos, preco_caixa_adicional_centavos, max_lojas)
VALUES
  ('BASICO',  'Básico',  'PLANO', 1, ARRAY['pdv','estoque','caixa'],                                         9900, 3900, 1),
  ('ATACADO', 'Atacado', 'PLANO', 2, ARRAY['pdv','estoque','caixa','faixas_preco','financeiro','comissoes'], 17900, 3900, 1),
  ('REDE',    'Rede',    'PLANO', 3, ARRAY['pdv','estoque','caixa','faixas_preco','financeiro','comissoes',
                                           'multi_loja','transferencias','painel_dono'],                      24900, 3900, NULL),
  ('FISCAL',  'Fiscal (NFC-e/NF-e)', 'ADDON', 9, ARRAY['fiscal'],                                            5900, 0, NULL)
ON CONFLICT (codigo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Assinatura (1 por empresa), faturas, eventos de webhook, tentativas de trial
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas.assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id),
  plano_codigo text NOT NULL REFERENCES saas.planos(codigo),
  addons text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'TRIAL' CHECK (status IN ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'SUSPENSA', 'CANCELADA')),
  motivo_status text NULL,
  trial_fim timestamptz NULL,
  carencia_dias int NOT NULL DEFAULT 5 CHECK (carencia_dias BETWEEN 0 AND 60),
  qtd_lojas int NOT NULL DEFAULT 1 CHECK (qtd_lojas >= 1),
  qtd_caixas int NOT NULL DEFAULT 1 CHECK (qtd_caixas >= 1),
  forma_pagamento text NOT NULL DEFAULT 'PIX' CHECK (forma_pagamento IN ('PIX', 'BOLETO', 'CARTAO', 'UNDEFINED')),
  valor_mensal_centavos int NULL,
  asaas_customer_id text NULL,
  asaas_subscription_id text NULL UNIQUE,
  proximo_vencimento date NULL,
  inadimplente_desde timestamptz NULL,
  acesso_ate timestamptz NULL,
  suspensao_aplicada boolean NOT NULL DEFAULT false,
  vendas_suspensas_antes text NULL,
  motivo_suspensao_antes text NULL,
  cancelada_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas.faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  asaas_payment_id text NOT NULL UNIQUE,
  valor_centavos int NOT NULL CHECK (valor_centavos >= 0),
  vencimento date NULL,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGA', 'VENCIDA', 'CANCELADA', 'ESTORNADA')),
  forma_pagamento text NULL,
  link_pagamento text NULL,
  boleto_url text NULL,
  pago_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faturas_empresa_venc_idx ON saas.faturas (empresa_id, vencimento DESC);

CREATE TABLE IF NOT EXISTS saas.webhook_eventos (
  evento_id text PRIMARY KEY,
  evento text NOT NULL,
  empresa_id uuid NULL,
  resultado text NULL,
  payload jsonb NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas.trial_tentativas (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  email_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trial_tentativas_ip_idx ON saas.trial_tentativas (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS trial_tentativas_email_idx ON saas.trial_tentativas (email_hash);

-- Tabelas do schema saas: RLS ligada sem policy para authenticated/anon (nega tudo); leitura só via RPC.
ALTER TABLE saas.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.webhook_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.trial_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA saas FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA saas TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA saas TO service_role;


-- Parâmetros comerciais configuráveis (sem deploy): duração do trial, carência, avisos, anti-abuso.
CREATE TABLE IF NOT EXISTS saas.parametros (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  descricao text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO saas.parametros (chave, valor, descricao) VALUES
  ('trial_dias', '15', 'Duração do teste grátis (dias)'),
  ('carencia_dias', '5', 'Dias após a fatura vencer até suspender as vendas'),
  ('aviso_dias_antes', '3', 'Dias de antecedência do aviso de fim de trial'),
  ('trial_max_por_ip_24h', '3', 'Cadastros de trial por IP em 24h')
ON CONFLICT (chave) DO NOTHING;
ALTER TABLE saas.parametros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON saas.parametros FROM PUBLIC, anon, authenticated;
GRANT ALL ON saas.parametros TO service_role;

CREATE OR REPLACE FUNCTION saas.param_int(p_chave text, p_padrao int)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = saas, pg_temp AS $$
  SELECT coalesce((SELECT nullif(valor, '')::int FROM saas.parametros WHERE chave = p_chave), p_padrao);
$$;
REVOKE ALL ON FUNCTION saas.param_int(text, int) FROM PUBLIC, anon, authenticated;

-- Auditoria de toda mudança de assinatura (plano, add-ons, lojas, status), com ator e origem.
CREATE TABLE IF NOT EXISTS saas.assinatura_auditoria (
  id bigserial PRIMARY KEY,
  empresa_id uuid NOT NULL,
  operacao text NOT NULL,
  antes jsonb NULL,
  depois jsonb NOT NULL,
  ator uuid NULL,
  origem text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assinatura_auditoria_empresa_idx ON saas.assinatura_auditoria (empresa_id, created_at DESC);
ALTER TABLE saas.assinatura_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON saas.assinatura_auditoria FROM PUBLIC, anon, authenticated;
GRANT ALL ON saas.assinatura_auditoria TO service_role;
GRANT ALL ON SEQUENCE saas.assinatura_auditoria_id_seq TO service_role;

CREATE OR REPLACE FUNCTION saas.tg_auditar_assinatura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = saas, pg_temp AS $$
DECLARE cols text[] := ARRAY['plano_codigo','addons','status','motivo_status','qtd_lojas','qtd_caixas','forma_pagamento',
  'valor_mensal_centavos','trial_fim','acesso_ate','suspensao_aplicada','asaas_subscription_id'];
  vn jsonb; vo jsonb; k text; dif boolean := TG_OP = 'INSERT';
BEGIN
  vn := (SELECT jsonb_object_agg(c, to_jsonb(NEW) -> c) FROM unnest(cols) c);
  IF TG_OP = 'UPDATE' THEN
    vo := (SELECT jsonb_object_agg(c, to_jsonb(OLD) -> c) FROM unnest(cols) c);
    dif := vo IS DISTINCT FROM vn;
  END IF;
  IF dif THEN
    INSERT INTO saas.assinatura_auditoria (empresa_id, operacao, antes, depois, ator, origem)
    VALUES (NEW.empresa_id, TG_OP, vo, vn,
            nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
            coalesce(nullif(current_setting('fp.cobranca_origem', true), ''), 'sistema'));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_auditar_assinatura ON saas.assinaturas;
CREATE TRIGGER tg_auditar_assinatura AFTER INSERT OR UPDATE ON saas.assinaturas
  FOR EACH ROW EXECUTE FUNCTION saas.tg_auditar_assinatura();

-- Limite de lojas do plano contratado (só empresas COM assinatura; cliente 1 inalterado).
-- Justificativa de tocar em public.lojas: é a única forma de o limite valer para qualquer caminho de
-- criação (wizard, SQL, futura tela). Trigger só lê saas.assinaturas; sem assinatura ⇒ no-op.
CREATE OR REPLACE FUNCTION saas.tg_limite_lojas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE v_lim int; n int;
BEGIN
  IF NEW.empresa_id IS NULL OR NOT coalesce(NEW.ativo, true) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.ativo AND OLD.empresa_id IS NOT DISTINCT FROM NEW.empresa_id THEN RETURN NEW; END IF;
  SELECT qtd_lojas INTO v_lim FROM saas.assinaturas WHERE empresa_id = NEW.empresa_id;
  IF v_lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM public.lojas WHERE empresa_id = NEW.empresa_id AND ativo AND id <> NEW.id;
  IF n + 1 > v_lim THEN
    RAISE EXCEPTION 'LOJA_LIMITE_PLANO: plano permite % loja(s)', v_lim USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_saas_limite_lojas ON public.lojas;
CREATE TRIGGER tg_saas_limite_lojas BEFORE INSERT OR UPDATE OF ativo, empresa_id ON public.lojas
  FOR EACH ROW EXECUTE FUNCTION saas.tg_limite_lojas();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Recursos por plano (gating web + sync)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fp_recursos_empresa(p_empresa uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
  -- sem assinatura (cliente 1 / legado) ⇒ NULL = todos os recursos
  SELECT CASE
    WHEN a.id IS NULL THEN NULL
    WHEN a.status IN ('SUSPENSA') THEN ARRAY[]::text[]
    WHEN a.status = 'CANCELADA' AND (a.acesso_ate IS NULL OR a.acesso_ate < now()) THEN ARRAY[]::text[]
    ELSE (SELECT coalesce(array_agg(DISTINCT r ORDER BY r), '{}')
            FROM saas.planos p, unnest(p.recursos) r
           WHERE p.codigo = a.plano_codigo OR p.codigo = ANY (a.addons))
  END
  FROM (SELECT 1) one LEFT JOIN saas.assinaturas a ON a.empresa_id = p_empresa;
$$;

CREATE OR REPLACE FUNCTION public.fp_empresa_tem_recurso(p_empresa uuid, p_recurso text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
  SELECT CASE WHEN r IS NULL THEN true ELSE p_recurso = ANY (r) END
  FROM (SELECT public.fp_recursos_empresa(p_empresa) r) x;
$$;

-- Resumo para a tela do dono (empresa do contexto da sessão).
CREATE OR REPLACE FUNCTION public.fp_minha_assinatura()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
  SELECT CASE WHEN e IS NULL OR NOT public.fp_pode_empresa(e) THEN NULL ELSE (
    SELECT jsonb_build_object(
      'empresa_id', e,
      'legado', a.id IS NULL,
      'plano', a.plano_codigo, 'addons', coalesce(to_jsonb(a.addons), '[]'::jsonb), 'status', a.status,
      'motivo_status', a.motivo_status, 'trial_fim', a.trial_fim, 'proximo_vencimento', a.proximo_vencimento,
      'qtd_lojas', a.qtd_lojas, 'qtd_caixas', a.qtd_caixas, 'forma_pagamento', a.forma_pagamento,
      'valor_mensal_centavos', a.valor_mensal_centavos, 'acesso_ate', a.acesso_ate,
      'recursos', to_jsonb(public.fp_recursos_empresa(e)),
      'suspensao_prevista_em', CASE WHEN a.status = 'INADIMPLENTE' THEN a.inadimplente_desde + make_interval(days => a.carencia_dias)
                                    WHEN a.status = 'TRIAL' THEN a.trial_fim END,
      'aviso_vencimento', (a.status = 'INADIMPLENTE')
         OR (a.status = 'TRIAL' AND a.trial_fim < now() + make_interval(days => saas.param_int('aviso_dias_antes', 3))),
      'lojas_ativas', (SELECT count(*) FROM public.lojas l WHERE l.empresa_id = e AND l.ativo),
      'proxima_fatura', (SELECT to_jsonb(f) - 'empresa_id' FROM saas.faturas f
                          WHERE f.empresa_id = e AND f.status IN ('PENDENTE', 'VENCIDA')
                          ORDER BY f.vencimento NULLS LAST LIMIT 1))
    FROM (SELECT 1) one LEFT JOIN saas.assinaturas a ON a.empresa_id = e)
  END
  FROM (SELECT public.fp_empresa_contexto(NULL) e) c;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Suspensão / reativação ligadas ao módulo de suspensão existente
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.cobranca_suspender(p_empresa uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE a saas.assinaturas;
BEGIN
  SELECT * INTO a FROM saas.assinaturas WHERE empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND OR a.suspensao_aplicada THEN RETURN; END IF;
  UPDATE saas.assinaturas SET
    suspensao_aplicada = true,
    vendas_suspensas_antes = (SELECT valor FROM public.configuracoes_gerais WHERE empresa_id = p_empresa AND chave = 'vendas_suspensas'),
    motivo_suspensao_antes = (SELECT valor FROM public.configuracoes_gerais WHERE empresa_id = p_empresa AND chave = 'motivo_suspensao'),
    updated_at = now()
  WHERE empresa_id = p_empresa;
  INSERT INTO public.configuracoes_gerais (empresa_id, chave, valor, tipo_dado, descricao)
  VALUES (p_empresa, 'vendas_suspensas', 'true', 'text', 'Vendas suspensas'),
         (p_empresa, 'motivo_suspensao', left(p_motivo, 300), 'text', 'Motivo da suspensão')
  ON CONFLICT (empresa_id, chave) DO UPDATE SET valor = EXCLUDED.valor;
END $$;

CREATE OR REPLACE FUNCTION internal.cobranca_reativar(p_empresa uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE a saas.assinaturas;
BEGIN
  SELECT * INTO a FROM saas.assinaturas WHERE empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND OR NOT a.suspensao_aplicada THEN RETURN; END IF;
  UPDATE public.configuracoes_gerais SET valor = coalesce(a.vendas_suspensas_antes, 'false')
   WHERE empresa_id = p_empresa AND chave = 'vendas_suspensas';
  UPDATE public.configuracoes_gerais SET valor = coalesce(a.motivo_suspensao_antes, '')
   WHERE empresa_id = p_empresa AND chave = 'motivo_suspensao';
  UPDATE saas.assinaturas SET suspensao_aplicada = false, vendas_suspensas_antes = NULL,
    motivo_suspensao_antes = NULL, updated_at = now() WHERE empresa_id = p_empresa;
END $$;
REVOKE ALL ON FUNCTION internal.cobranca_suspender(uuid, text), internal.cobranca_reativar(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Webhook Asaas: aplica um evento de forma IDEMPOTENTE (evento_id único)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cobranca_aplicar_evento(p_evento_id text, p_evento text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE
  pay jsonb := p_payload->'payment';
  sub jsonb := p_payload->'subscription';
  v_emp uuid; v_res text := 'ignorado'; a saas.assinaturas; f saas.faturas;
  v_valor int; v_status_fatura text;
BEGIN
  IF coalesce(btrim(p_evento_id), '') = '' OR coalesce(btrim(p_evento), '') = '' THEN
    RAISE EXCEPTION 'COBRANCA_EVENTO_INVALIDO';
  END IF;
  IF coalesce(current_setting('fp.cobranca_origem', true), '') = '' THEN PERFORM set_config('fp.cobranca_origem', 'webhook', true); END IF;
  INSERT INTO saas.webhook_eventos (evento_id, evento, payload) VALUES (p_evento_id, p_evento, p_payload)
  ON CONFLICT (evento_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicado', true, 'resultado',
      (SELECT resultado FROM saas.webhook_eventos WHERE evento_id = p_evento_id));
  END IF;

  -- empresa: assinatura Asaas → externalReference (= empresa_id) do pagamento/assinatura
  SELECT empresa_id INTO v_emp FROM saas.assinaturas
   WHERE asaas_subscription_id IS NOT NULL
     AND asaas_subscription_id = coalesce(pay->>'subscription', sub->>'id');
  IF v_emp IS NULL THEN
    BEGIN
      v_emp := coalesce(pay->>'externalReference', sub->>'externalReference')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN v_emp := NULL; END;
    IF v_emp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM saas.assinaturas WHERE empresa_id = v_emp) THEN v_emp := NULL; END IF;
  END IF;
  IF v_emp IS NULL THEN
    UPDATE saas.webhook_eventos SET resultado = 'empresa_desconhecida' WHERE evento_id = p_evento_id;
    RETURN jsonb_build_object('duplicado', false, 'resultado', 'empresa_desconhecida');
  END IF;
  SELECT * INTO a FROM saas.assinaturas WHERE empresa_id = v_emp FOR UPDATE;

  IF pay IS NOT NULL AND coalesce(pay->>'id', '') <> '' THEN
    v_valor := round(coalesce((pay->>'value')::numeric, 0) * 100)::int;
    v_status_fatura := CASE
      WHEN p_evento IN ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH') THEN 'PAGA'
      WHEN p_evento = 'PAYMENT_OVERDUE' THEN 'VENCIDA'
      WHEN p_evento IN ('PAYMENT_DELETED') THEN 'CANCELADA'
      WHEN p_evento IN ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED') THEN 'ESTORNADA'
      ELSE 'PENDENTE' END;
    INSERT INTO saas.faturas (empresa_id, asaas_payment_id, valor_centavos, vencimento, status, forma_pagamento,
                                link_pagamento, boleto_url, pago_em)
    VALUES (v_emp, pay->>'id', v_valor, nullif(pay->>'dueDate', '')::date, v_status_fatura, pay->>'billingType',
            pay->>'invoiceUrl', pay->>'bankSlipUrl', CASE WHEN v_status_fatura = 'PAGA' THEN now() END)
    ON CONFLICT (asaas_payment_id) DO UPDATE SET
      -- fatura PAGA não volta para VENCIDA/PENDENTE com evento atrasado (fora de ordem)
      status = CASE WHEN saas.faturas.status = 'PAGA' AND EXCLUDED.status IN ('PENDENTE', 'VENCIDA')
                    THEN saas.faturas.status ELSE EXCLUDED.status END,
      valor_centavos = EXCLUDED.valor_centavos, vencimento = EXCLUDED.vencimento,
      link_pagamento = coalesce(EXCLUDED.link_pagamento, saas.faturas.link_pagamento),
      boleto_url = coalesce(EXCLUDED.boleto_url, saas.faturas.boleto_url),
      pago_em = coalesce(saas.faturas.pago_em, EXCLUDED.pago_em), updated_at = now()
    RETURNING * INTO f;
  END IF;

  IF p_evento IN ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH') THEN
    UPDATE saas.assinaturas SET status = 'ATIVA', motivo_status = NULL, inadimplente_desde = NULL,
      trial_fim = NULL, acesso_ate = NULL, cancelada_em = NULL, updated_at = now()
     WHERE empresa_id = v_emp AND status <> 'CANCELADA';
    -- ainda há outra fatura vencida? mantém inadimplente (não reativa)
    IF EXISTS (SELECT 1 FROM saas.faturas WHERE empresa_id = v_emp AND status = 'VENCIDA') THEN
      UPDATE saas.assinaturas SET status = 'INADIMPLENTE',
        inadimplente_desde = coalesce(a.inadimplente_desde, now()) WHERE empresa_id = v_emp AND status = 'ATIVA';
      v_res := 'pago_mas_ha_vencidas';
    ELSIF (SELECT status FROM saas.assinaturas WHERE empresa_id = v_emp) = 'ATIVA' THEN
      PERFORM internal.cobranca_reativar(v_emp);
      v_res := 'ativada';
    ELSE
      v_res := 'pago_assinatura_cancelada';
    END IF;
  ELSIF p_evento = 'PAYMENT_OVERDUE' THEN
    IF f.status = 'VENCIDA' AND a.status IN ('ATIVA', 'TRIAL') THEN
      UPDATE saas.assinaturas SET status = 'INADIMPLENTE', motivo_status = 'FATURA_VENCIDA',
        inadimplente_desde = coalesce(inadimplente_desde, now()), updated_at = now() WHERE empresa_id = v_emp;
      v_res := 'inadimplente';
    ELSE
      v_res := 'vencida_registrada';
    END IF;
  ELSIF p_evento = 'SUBSCRIPTION_DELETED' THEN
    UPDATE saas.assinaturas SET status = 'CANCELADA', motivo_status = 'CANCELADA_NO_ASAAS', cancelada_em = now(),
      acesso_ate = coalesce(acesso_ate, now()), updated_at = now() WHERE empresa_id = v_emp;
    v_res := 'cancelada';
  ELSIF pay IS NOT NULL THEN
    v_res := 'fatura_' || lower(f.status);
  END IF;

  UPDATE saas.webhook_eventos SET empresa_id = v_emp, resultado = v_res WHERE evento_id = p_evento_id;
  RETURN jsonb_build_object('duplicado', false, 'resultado', v_res, 'empresa_id', v_emp);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Job diário: fim do trial, fim da carência, fim do acesso pós-cancelamento
--    (agendar com pg_cron ou chamar pelo webhook/cron da Vercel — ver docs/cobranca/SETUP_ASAAS.md)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cobranca_processar_vencimentos(p_agora timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE r record; n_trial int := 0; n_inad int := 0; n_canc int := 0;
BEGIN
  FOR r IN SELECT empresa_id FROM saas.assinaturas WHERE status = 'TRIAL' AND trial_fim < p_agora FOR UPDATE LOOP
    UPDATE saas.assinaturas SET status = 'SUSPENSA', motivo_status = 'TRIAL_EXPIRADO', updated_at = now() WHERE empresa_id = r.empresa_id;
    PERFORM internal.cobranca_suspender(r.empresa_id, 'Período de teste encerrado. Escolha um plano em Assinatura. / 试用期已结束，请在“订阅”中选择方案。');
    n_trial := n_trial + 1;
  END LOOP;
  FOR r IN SELECT empresa_id FROM saas.assinaturas
            WHERE status = 'INADIMPLENTE' AND inadimplente_desde + make_interval(days => carencia_dias) < p_agora
              -- só com fatura VENCIDA confirmada pelo Asaas (falha transitória/sem dado nunca suspende)
              AND EXISTS (SELECT 1 FROM saas.faturas f WHERE f.empresa_id = saas.assinaturas.empresa_id AND f.status = 'VENCIDA')
            FOR UPDATE LOOP
    UPDATE saas.assinaturas SET status = 'SUSPENSA', motivo_status = 'INADIMPLENCIA', updated_at = now() WHERE empresa_id = r.empresa_id;
    PERFORM internal.cobranca_suspender(r.empresa_id, 'Pagamento em atraso. Regularize em Assinatura. / 付款逾期，请在“订阅”中处理。');
    n_inad := n_inad + 1;
  END LOOP;
  FOR r IN SELECT empresa_id FROM saas.assinaturas
            WHERE status = 'CANCELADA' AND NOT suspensao_aplicada AND (acesso_ate IS NULL OR acesso_ate < p_agora) LOOP
    PERFORM internal.cobranca_suspender(r.empresa_id, 'Assinatura cancelada. / 订阅已取消。');
    n_canc := n_canc + 1;
  END LOOP;
  RETURN jsonb_build_object('trial_expirado', n_trial, 'suspensas_inadimplencia', n_inad, 'canceladas_encerradas', n_canc);
END $$;

-- Servidor registra a assinatura criada no Asaas (troca de plano também passa aqui).
CREATE OR REPLACE FUNCTION public.cobranca_registrar_assinatura(
  p_empresa uuid, p_plano text, p_addons text[], p_qtd_lojas int, p_qtd_caixas int, p_forma text,
  p_valor_centavos int, p_asaas_customer text, p_asaas_subscription text, p_proximo_vencimento date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM saas.planos WHERE codigo = p_plano AND tipo = 'PLANO' AND ativo) THEN
    RAISE EXCEPTION 'COBRANCA_PLANO_INVALIDO';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_addons, '{}')) x WHERE x NOT IN (SELECT codigo FROM saas.planos WHERE tipo = 'ADDON' AND ativo)) THEN
    RAISE EXCEPTION 'COBRANCA_ADDON_INVALIDO';
  END IF;
  INSERT INTO saas.assinaturas (empresa_id, plano_codigo, addons, status, qtd_lojas, qtd_caixas, forma_pagamento,
    valor_mensal_centavos, asaas_customer_id, asaas_subscription_id, proximo_vencimento)
  VALUES (p_empresa, p_plano, coalesce(p_addons, '{}'), 'TRIAL', p_qtd_lojas, p_qtd_caixas, p_forma,
    p_valor_centavos, p_asaas_customer, p_asaas_subscription, p_proximo_vencimento)
  ON CONFLICT (empresa_id) DO UPDATE SET plano_codigo = EXCLUDED.plano_codigo, addons = EXCLUDED.addons,
    qtd_lojas = EXCLUDED.qtd_lojas, qtd_caixas = EXCLUDED.qtd_caixas, forma_pagamento = EXCLUDED.forma_pagamento,
    valor_mensal_centavos = EXCLUDED.valor_mensal_centavos,
    asaas_customer_id = coalesce(EXCLUDED.asaas_customer_id, saas.assinaturas.asaas_customer_id),
    asaas_subscription_id = coalesce(EXCLUDED.asaas_subscription_id, saas.assinaturas.asaas_subscription_id),
    proximo_vencimento = coalesce(EXCLUDED.proximo_vencimento, saas.assinaturas.proximo_vencimento),
    -- reassinar depois de cancelar volta a aguardar o 1º pagamento
    status = CASE WHEN saas.assinaturas.status = 'CANCELADA' THEN 'SUSPENSA' ELSE saas.assinaturas.status END,
    cancelada_em = NULL, updated_at = now();
  UPDATE public.empresas SET plano = p_plano,
    max_lojas = (SELECT max_lojas FROM saas.planos WHERE codigo = p_plano), updated_at = now() WHERE id = p_empresa;
END $$;

CREATE OR REPLACE FUNCTION public.cobranca_cancelar(p_empresa uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
BEGIN
  UPDATE saas.assinaturas SET status = 'CANCELADA', motivo_status = 'CANCELADA_PELO_CLIENTE', cancelada_em = now(),
    -- usa até o fim do período pago; trial/inadimplente/suspensa encerram já
    acesso_ate = CASE WHEN status = 'ATIVA' AND proximo_vencimento IS NOT NULL THEN proximo_vencimento::timestamptz ELSE now() END,
    updated_at = now()
  WHERE empresa_id = p_empresa AND status <> 'CANCELADA';
  IF NOT FOUND THEN RAISE EXCEPTION 'COBRANCA_SEM_ASSINATURA_ATIVA'; END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Trial self-service: rate limit + provisionamento atômico (reusa PR #584) + loja demo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trial_registrar_tentativa(p_ip_hash text, p_email_hash text,
  p_max_por_ip_24h int DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
BEGIN
  p_max_por_ip_24h := coalesce(p_max_por_ip_24h, saas.param_int('trial_max_por_ip_24h', 3));
  IF (SELECT count(*) FROM saas.trial_tentativas
       WHERE ip_hash = p_ip_hash AND created_at > now() - interval '24 hours') >= p_max_por_ip_24h THEN
    RETURN false;
  END IF;
  INSERT INTO saas.trial_tentativas (ip_hash, email_hash) VALUES (p_ip_hash, p_email_hash);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION internal.cobranca_seed_demo(p_loja uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE n int;
BEGIN
  -- mesmo catálogo de 027_seed_produtos_demo_importados_zh (nomes zh · pt), IDs novos e da loja do trial
  INSERT INTO public.produtos (nome, preco_varejo, preco_custo, origem, loja_id, ativo, observacao)
  SELECT d.nome, d.preco, d.custo, 'china_manual', p_loja, true, 'DEMO_TRIAL'
  FROM (VALUES
    ('可口可乐 350ml · Coca-Cola lata 350ml', 5.50, 3.20),
    ('乐事薯片 · Batata Lays 80g', 8.90, 5.10),
    ('不锈钢保温杯 · Garrafa térmica inox 500ml', 39.90, 18.00),
    ('USB-C 数据线 1m · Cabo USB-C 1m', 19.90, 6.50),
    ('陶瓷碗套装 · Jogo de tigelas de cerâmica (4)', 49.90, 22.00),
    ('蓝牙耳机 · Fone bluetooth', 89.90, 38.00)
  ) AS d(nome, preco, custo);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION internal.cobranca_seed_demo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plataforma_iniciar_trial(p jsonb, p_dias int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE r jsonb; v_emp uuid; v_loja uuid; v_plano text := coalesce(nullif(p->>'plano', ''), 'ATACADO'); n int := 0;
  v_uid uuid; v_seguro jsonb;
BEGIN
  p_dias := coalesce(p_dias, saas.param_int('trial_dias', 15));
  -- Trial é autoatendimento: exatamente 1 loja e 1 DONO recém-criado. Ids/campos extras do payload
  -- (empresa.id, loja.id, empresa_id, papéis, lojas do usuário) são descartados — nunca reaproveita
  -- empresa, loja ou usuário existente.
  IF jsonb_typeof(p->'lojas') <> 'array' OR jsonb_array_length(p->'lojas') <> 1
     OR jsonb_typeof(p->'usuarios') <> 'array' OR jsonb_array_length(p->'usuarios') <> 1 THEN
    RAISE EXCEPTION 'TRIAL_PAYLOAD_INVALIDO';
  END IF;
  v_uid := nullif(p->'usuarios'->0->>'id', '')::uuid;
  IF v_uid IS NULL OR EXISTS (SELECT 1 FROM public.usuarios WHERE id = v_uid)
     OR EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = v_uid) THEN
    RAISE EXCEPTION 'TRIAL_USUARIO_JA_EXISTE';
  END IF;
  v_seguro := jsonb_build_object(
    'empresa', jsonb_build_object('nome', p->'empresa'->>'nome', 'cnpj', p->'empresa'->>'cnpj'),
    'lojas', jsonb_build_array(jsonb_build_object('chave', 'l1', 'nome', coalesce(p->'lojas'->0->>'nome', p->'empresa'->>'nome'),
                                                  'codigo', p->'lojas'->0->>'codigo')),
    'usuarios', jsonb_build_array(jsonb_build_object('id', v_uid, 'nome', p->'usuarios'->0->>'nome', 'papel', 'DONO',
                                                     'idioma', p->'usuarios'->0->>'idioma')));
  IF NOT EXISTS (SELECT 1 FROM saas.planos WHERE codigo = v_plano AND tipo = 'PLANO' AND ativo) THEN
    RAISE EXCEPTION 'COBRANCA_PLANO_INVALIDO';
  END IF;
  IF p_dias NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'TRIAL_DIAS_INVALIDO'; END IF;
  -- trial = 1 loja, só o dono (equipe vem depois); mesma RPC transacional do wizard (PR #584)
  r := public.plataforma_provisionar_empresa(
         jsonb_set(jsonb_set(v_seguro, '{empresa,plano}', to_jsonb(v_plano)), '{empresa,max_lojas}', '1'::jsonb), NULL);
  v_emp := (r->>'empresa_id')::uuid;
  SELECT id INTO v_loja FROM public.lojas WHERE empresa_id = v_emp ORDER BY created_at NULLS LAST, id LIMIT 1;
  INSERT INTO saas.assinaturas (empresa_id, plano_codigo, status, trial_fim, qtd_lojas, qtd_caixas, carencia_dias)
  VALUES (v_emp, v_plano, 'TRIAL', now() + make_interval(days => p_dias), 1, 1, saas.param_int('carencia_dias', 5));
  IF coalesce((p->>'demo')::boolean, true) THEN n := internal.cobranca_seed_demo(v_loja); END IF;
  RETURN r || jsonb_build_object('loja_id', v_loja, 'trial_fim', now() + make_interval(days => p_dias), 'produtos_demo', n);
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Leituras para a tela do dono / servidor e conciliação com o Asaas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.planos_catalogo()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'nome', nome, 'tipo', tipo, 'recursos', recursos,
    'preco_loja_centavos', preco_loja_centavos, 'preco_caixa_adicional_centavos', preco_caixa_adicional_centavos,
    'caixas_inclusos_por_loja', caixas_inclusos_por_loja, 'max_lojas', max_lojas, 'preco_placeholder', preco_placeholder)
    ORDER BY ordem), '[]'::jsonb)
  FROM saas.planos WHERE ativo;
$$;

COMMENT ON FUNCTION public.planos_catalogo() IS
  'Multiempresa revisado: catálogo de planos da plataforma (sem dados de empresa; leitura para authenticated).';

CREATE OR REPLACE FUNCTION public.fp_minhas_faturas(p_limite int DEFAULT 24)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
  SELECT CASE WHEN e IS NULL OR NOT public.fp_pode_empresa(e) THEN '[]'::jsonb ELSE coalesce((
    SELECT jsonb_agg(to_jsonb(f) - 'empresa_id' ORDER BY f.vencimento DESC NULLS LAST, f.created_at DESC)
      FROM (SELECT * FROM saas.faturas WHERE empresa_id = e
             ORDER BY vencimento DESC NULLS LAST, created_at DESC LIMIT least(greatest(p_limite, 1), 100)) f), '[]'::jsonb) END
  FROM (SELECT public.fp_empresa_contexto(NULL) e) c;
$$;

-- Servidor (service_role): estado completo para assinar/trocar/cancelar.
CREATE OR REPLACE FUNCTION public.cobranca_estado_empresa(p_empresa uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
  SELECT jsonb_build_object(
    'empresa', (SELECT jsonb_build_object('nome', nome, 'cnpj', cnpj) FROM public.empresas WHERE id = p_empresa),
    'lojas_ativas', (SELECT count(*) FROM public.lojas WHERE empresa_id = p_empresa AND ativo),
    'assinatura', (SELECT to_jsonb(a) FROM saas.assinaturas a WHERE a.empresa_id = p_empresa));
$$;

CREATE OR REPLACE FUNCTION public.cobranca_assinaturas_para_conciliar()
RETURNS TABLE (empresa_id uuid, asaas_subscription_id text) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, saas, pg_temp AS $$
  SELECT empresa_id, asaas_subscription_id FROM saas.assinaturas
   WHERE asaas_subscription_id IS NOT NULL AND status <> 'CANCELADA';
$$;

-- Conciliação: o job consulta as cobranças da assinatura NO ASAAS (fonte da verdade) e aplica o estado
-- atual como evento sintético idempotente ('recon:<payment>:<status>'). Cobre webhook perdido/fora de ordem.
CREATE OR REPLACE FUNCTION public.cobranca_conciliar_pagamento(p_payment jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE v_ev text;
BEGIN
  IF coalesce(p_payment->>'id', '') = '' THEN RAISE EXCEPTION 'COBRANCA_EVENTO_INVALIDO'; END IF;
  v_ev := CASE upper(coalesce(p_payment->>'status', ''))
    WHEN 'RECEIVED' THEN 'PAYMENT_RECEIVED' WHEN 'CONFIRMED' THEN 'PAYMENT_CONFIRMED'
    WHEN 'RECEIVED_IN_CASH' THEN 'PAYMENT_RECEIVED_IN_CASH' WHEN 'OVERDUE' THEN 'PAYMENT_OVERDUE'
    WHEN 'REFUNDED' THEN 'PAYMENT_REFUNDED' WHEN 'PENDING' THEN 'PAYMENT_CREATED'
    ELSE NULL END;
  IF v_ev IS NULL THEN RETURN jsonb_build_object('resultado', 'status_ignorado'); END IF;
  PERFORM set_config('fp.cobranca_origem', 'conciliacao', true);
  RETURN public.cobranca_aplicar_evento('recon:' || (p_payment->>'id') || ':' || upper(p_payment->>'status'), v_ev,
    jsonb_build_object('event', v_ev, 'payment', p_payment));
END $$;

-- privilégios: tudo de escrita só service_role (servidor Next / edge function)
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cobranca_aplicar_evento(text, text, jsonb)', 'public.cobranca_processar_vencimentos(timestamptz)',
    'public.cobranca_registrar_assinatura(uuid, text, text[], int, int, text, int, text, text, date)',
    'public.cobranca_cancelar(uuid)', 'public.trial_registrar_tentativa(text, text, int)',
    'public.plataforma_iniciar_trial(jsonb, int)', 'public.cobranca_conciliar_pagamento(jsonb)',
    'public.cobranca_estado_empresa(uuid)', 'public.cobranca_assinaturas_para_conciliar()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.fp_recursos_empresa(uuid)', 'public.fp_empresa_tem_recurso(uuid, text)', 'public.fp_minha_assinatura()',
    'public.fp_minhas_faturas(int)', 'public.planos_catalogo()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

COMMIT;
