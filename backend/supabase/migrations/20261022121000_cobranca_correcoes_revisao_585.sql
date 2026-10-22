-- Correções da revisão de segurança do PR #585 (cobrança Asaas).
--
-- NÃO APLICAR no Supabase remoto sem revisão do dono e validação em homologação.
--
-- 1) Upgrade de plano não libera recursos antes do pagamento: o pedido fica em colunas *_pendente
--    e só é aplicado em PAYMENT_CONFIRMED/RECEIVED/RECEIVED_IN_CASH. Upgrade = plano de `ordem` maior,
--    add-on novo, ou mais lojas/caixas. Downgrade (reduz recursos) é aplicado NA HORA (decisão: nunca
--    dá acesso sem pagar; o cliente perde recursos imediatamente ao reduzir).
--    Primeira assinatura de empresa sem linha (legado/cliente 1) continua como antes.
-- 2) Estorno/chargeback ⇒ SUSPENSA + bloqueio pelo módulo de suspensão existente.
-- 3) Lock por empresa para o botão Assinar (evita duas assinaturas no Asaas com dois cliques).
-- 4) public.fp_sou_dono_da_empresa: DONO da empresa (vínculo), não perfil global.
BEGIN;

ALTER TABLE saas.assinaturas
  ADD COLUMN IF NOT EXISTS plano_pendente text NULL REFERENCES saas.planos(codigo),
  ADD COLUMN IF NOT EXISTS addons_pendentes text[] NULL,
  ADD COLUMN IF NOT EXISTS qtd_lojas_pendente int NULL CHECK (qtd_lojas_pendente IS NULL OR qtd_lojas_pendente >= 1),
  ADD COLUMN IF NOT EXISTS qtd_caixas_pendente int NULL CHECK (qtd_caixas_pendente IS NULL OR qtd_caixas_pendente >= 1),
  ADD COLUMN IF NOT EXISTS pendente_desde timestamptz NULL;

-- Aplica o upgrade pendente (chamado só pelo webhook em pagamento confirmado).
CREATE OR REPLACE FUNCTION internal.cobranca_aplicar_plano_pendente(p_empresa uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE a saas.assinaturas;
BEGIN
  SELECT * INTO a FROM saas.assinaturas WHERE empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND OR a.plano_pendente IS NULL THEN RETURN false; END IF;
  UPDATE saas.assinaturas SET plano_codigo = a.plano_pendente, addons = coalesce(a.addons_pendentes, '{}'),
    qtd_lojas = coalesce(a.qtd_lojas_pendente, qtd_lojas), qtd_caixas = coalesce(a.qtd_caixas_pendente, qtd_caixas),
    plano_pendente = NULL, addons_pendentes = NULL, qtd_lojas_pendente = NULL, qtd_caixas_pendente = NULL,
    pendente_desde = NULL, updated_at = now()
   WHERE empresa_id = p_empresa;
  UPDATE public.empresas SET plano = a.plano_pendente,
    max_lojas = (SELECT max_lojas FROM saas.planos WHERE codigo = a.plano_pendente), updated_at = now() WHERE id = p_empresa;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION internal.cobranca_aplicar_plano_pendente(uuid) FROM PUBLIC, anon, authenticated;

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
      WHEN p_evento IN ('PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
                        'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL') THEN 'ESTORNADA'
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
    -- Upgrade pendente só vale depois do pagamento confirmado (revisão #585).
    PERFORM internal.cobranca_aplicar_plano_pendente(v_emp);
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
  ELSIF p_evento IN ('PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
                     'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL') THEN
    -- Estorno/chargeback: dinheiro voltou ⇒ assinatura deixa de ser ATIVA e os recursos são bloqueados
    -- pelo mesmo caminho da inadimplência (SUSPENSA ⇒ fp_recursos_empresa = {} + cobranca_suspender).
    -- Upgrade pendente é descartado. Reativa no próximo PAYMENT_CONFIRMED/RECEIVED.
    IF a.status IN ('ATIVA', 'INADIMPLENTE', 'TRIAL', 'SUSPENSA') THEN
      UPDATE saas.assinaturas SET status = 'SUSPENSA',
        motivo_status = CASE WHEN p_evento LIKE '%CHARGEBACK%' THEN 'CHARGEBACK' ELSE 'ESTORNO' END,
        plano_pendente = NULL, addons_pendentes = NULL, qtd_lojas_pendente = NULL, qtd_caixas_pendente = NULL,
        pendente_desde = NULL, updated_at = now()
       WHERE empresa_id = v_emp;
      PERFORM internal.cobranca_suspender(v_emp, 'Pagamento estornado/contestado. Regularize em Assinatura. / 付款已退款或拒付，请在“订阅”中处理。');
      v_res := 'suspensa_estorno';
    ELSE
      v_res := 'estorno_registrado';
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

-- Registra assinatura/troca. Upgrade ⇒ pendente até pagar; downgrade ⇒ imediato.
CREATE OR REPLACE FUNCTION public.cobranca_registrar_assinatura(
  p_empresa uuid, p_plano text, p_addons text[], p_qtd_lojas int, p_qtd_caixas int, p_forma text,
  p_valor_centavos int, p_asaas_customer text, p_asaas_subscription text, p_proximo_vencimento date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE a saas.assinaturas; v_ordem_nova int; v_ordem_atual int; v_upgrade boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM saas.planos WHERE codigo = p_plano AND tipo = 'PLANO' AND ativo) THEN
    RAISE EXCEPTION 'COBRANCA_PLANO_INVALIDO';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_addons, '{}')) x WHERE x NOT IN (SELECT codigo FROM saas.planos WHERE tipo = 'ADDON' AND ativo)) THEN
    RAISE EXCEPTION 'COBRANCA_ADDON_INVALIDO';
  END IF;
  SELECT * INTO a FROM saas.assinaturas WHERE empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND THEN
    -- 1ª assinatura (empresa sem linha): comportamento anterior.
    INSERT INTO saas.assinaturas (empresa_id, plano_codigo, addons, status, qtd_lojas, qtd_caixas, forma_pagamento,
      valor_mensal_centavos, asaas_customer_id, asaas_subscription_id, proximo_vencimento)
    VALUES (p_empresa, p_plano, coalesce(p_addons, '{}'), 'TRIAL', p_qtd_lojas, p_qtd_caixas, p_forma,
      p_valor_centavos, p_asaas_customer, p_asaas_subscription, p_proximo_vencimento);
    UPDATE public.empresas SET plano = p_plano,
      max_lojas = (SELECT max_lojas FROM saas.planos WHERE codigo = p_plano), updated_at = now() WHERE id = p_empresa;
    RETURN;
  END IF;

  SELECT ordem INTO v_ordem_nova FROM saas.planos WHERE codigo = p_plano;
  SELECT ordem INTO v_ordem_atual FROM saas.planos WHERE codigo = a.plano_codigo;
  v_upgrade := coalesce(v_ordem_nova, 0) > coalesce(v_ordem_atual, 0)
    OR EXISTS (SELECT 1 FROM unnest(coalesce(p_addons, '{}')) x WHERE NOT x = ANY (a.addons))
    OR p_qtd_lojas > a.qtd_lojas OR p_qtd_caixas > a.qtd_caixas;

  UPDATE saas.assinaturas SET forma_pagamento = p_forma, valor_mensal_centavos = p_valor_centavos,
    asaas_customer_id = coalesce(p_asaas_customer, asaas_customer_id),
    asaas_subscription_id = coalesce(p_asaas_subscription, asaas_subscription_id),
    proximo_vencimento = coalesce(p_proximo_vencimento, proximo_vencimento),
    status = CASE WHEN status = 'CANCELADA' THEN 'SUSPENSA' ELSE status END,
    cancelada_em = NULL, updated_at = now()
   WHERE empresa_id = p_empresa;

  IF v_upgrade THEN
    UPDATE saas.assinaturas SET plano_pendente = p_plano, addons_pendentes = coalesce(p_addons, '{}'),
      qtd_lojas_pendente = p_qtd_lojas, qtd_caixas_pendente = p_qtd_caixas, pendente_desde = now()
     WHERE empresa_id = p_empresa;
  ELSE
    UPDATE saas.assinaturas SET plano_codigo = p_plano, addons = coalesce(p_addons, '{}'),
      qtd_lojas = p_qtd_lojas, qtd_caixas = p_qtd_caixas,
      plano_pendente = NULL, addons_pendentes = NULL, qtd_lojas_pendente = NULL, qtd_caixas_pendente = NULL,
      pendente_desde = NULL
     WHERE empresa_id = p_empresa;
    UPDATE public.empresas SET plano = p_plano,
      max_lojas = (SELECT max_lojas FROM saas.planos WHERE codigo = p_plano), updated_at = now() WHERE id = p_empresa;
  END IF;
END $$;

-- Lock curto por empresa para "Assinar" (dois cliques / duas abas ⇒ só um cria no Asaas).
CREATE TABLE IF NOT EXISTS saas.assinar_locks (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id),
  ate timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE saas.assinar_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON saas.assinar_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON saas.assinar_locks TO service_role;

CREATE OR REPLACE FUNCTION public.cobranca_reservar_assinar(p_empresa uuid, p_segundos int DEFAULT 120)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
BEGIN
  INSERT INTO saas.assinar_locks (empresa_id, ate) VALUES (p_empresa, now() + make_interval(secs => least(greatest(p_segundos, 10), 600)))
  ON CONFLICT (empresa_id) DO UPDATE SET ate = EXCLUDED.ate, created_at = now()
    WHERE saas.assinar_locks.ate < now();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.cobranca_liberar_assinar(p_empresa uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
  DELETE FROM saas.assinar_locks WHERE empresa_id = p_empresa;
$$;

-- DONO da empresa (vínculo ativo); fallback legado: perfil DONO com loja da empresa. ADMIN global NÃO basta.
CREATE OR REPLACE FUNCTION public.fp_sou_dono_da_empresa(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_empresa IS NOT NULL AND (SELECT auth.uid()) IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.usuario_vinculos v
             WHERE v.usuario_id = (SELECT auth.uid()) AND v.empresa_id = p_empresa AND v.papel = 'DONO' AND v.ativo)
    OR EXISTS (SELECT 1 FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id
                WHERE u.id = (SELECT auth.uid()) AND u.ativo AND u.perfil = 'DONO' AND l.empresa_id = p_empresa
                  AND NOT EXISTS (SELECT 1 FROM public.usuario_vinculos v2 WHERE v2.usuario_id = u.id AND v2.ativo)));
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.cobranca_reservar_assinar(uuid, int)', 'public.cobranca_liberar_assinar(uuid)',
    'public.cobranca_registrar_assinatura(uuid, text, text[], int, int, text, int, text, text, date)',
    'public.cobranca_aplicar_evento(text, text, jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  REVOKE ALL ON FUNCTION public.fp_sou_dono_da_empresa(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.fp_sou_dono_da_empresa(uuid) TO authenticated, service_role;
END $$;

COMMIT;
