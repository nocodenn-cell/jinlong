-- Rollback de 20261028101000_cobranca_correcoes_revisao_585.sql (PR #620).
-- Restaura cobranca_aplicar_evento e cobranca_registrar_assinatura com o corpo EXATO de produção antes do #620
-- (pg_get_functiondef, 2026-10-28; md5 normalizado 047c297a… e e9085e0b…) e remove o que a migration criou.
-- ORDEM: reverter ANTES o app (pdv-importados do #620 chama fp_sou_dono_da_empresa e cobranca_reservar_assinar).
-- PERDA: upgrades pendentes ainda não pagos (colunas *_pendente) são descartados — conferir antes:
--   SELECT empresa_id, plano_pendente, pendente_desde FROM saas.assinaturas WHERE plano_pendente IS NOT NULL;
BEGIN;

CREATE OR REPLACE FUNCTION public.cobranca_aplicar_evento(p_evento_id text, p_evento text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'saas', 'pg_temp'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.cobranca_registrar_assinatura(p_empresa uuid, p_plano text, p_addons text[], p_qtd_lojas integer, p_qtd_caixas integer, p_forma text, p_valor_centavos integer, p_asaas_customer text, p_asaas_subscription text, p_proximo_vencimento date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'saas', 'pg_temp'
AS $function$
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
END $function$;

DROP FUNCTION IF EXISTS public.fp_sou_dono_da_empresa(uuid);
DROP FUNCTION IF EXISTS public.cobranca_reservar_assinar(uuid, integer);
DROP FUNCTION IF EXISTS public.cobranca_liberar_assinar(uuid);
DROP FUNCTION IF EXISTS internal.cobranca_aplicar_plano_pendente(uuid);
DROP TABLE IF EXISTS saas.assinar_locks;
ALTER TABLE saas.assinaturas
  DROP COLUMN IF EXISTS plano_pendente,
  DROP COLUMN IF EXISTS addons_pendentes,
  DROP COLUMN IF EXISTS qtd_lojas_pendente,
  DROP COLUMN IF EXISTS qtd_caixas_pendente,
  DROP COLUMN IF EXISTS pendente_desde;
DO $ledger$ BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261028101000';
  END IF;
END $ledger$;

COMMIT;
