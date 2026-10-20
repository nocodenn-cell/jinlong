-- Rollback de 20261020100000_cobranca_planos_trial.sql.
-- ATENÇÃO: antes, reativa vendas de empresas suspensas pela cobrança (devolve o valor anterior).
BEGIN;
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('saas.assinaturas') IS NOT NULL THEN
    FOR r IN SELECT empresa_id FROM saas.assinaturas WHERE suspensao_aplicada LOOP
      PERFORM internal.cobranca_reativar(r.empresa_id);
    END LOOP;
  END IF;
END $$;
DROP TRIGGER IF EXISTS tg_saas_limite_lojas ON public.lojas;
DROP FUNCTION IF EXISTS public.cobranca_conciliar_pagamento(jsonb);
DROP FUNCTION IF EXISTS public.cobranca_assinaturas_para_conciliar();
DROP FUNCTION IF EXISTS public.cobranca_estado_empresa(uuid);
DROP FUNCTION IF EXISTS public.fp_minhas_faturas(int);
DROP FUNCTION IF EXISTS public.planos_catalogo();
DROP FUNCTION IF EXISTS public.plataforma_iniciar_trial(jsonb, int);
DROP FUNCTION IF EXISTS internal.cobranca_seed_demo(uuid);
DROP FUNCTION IF EXISTS public.trial_registrar_tentativa(text, text, int);
DROP FUNCTION IF EXISTS public.cobranca_cancelar(uuid);
DROP FUNCTION IF EXISTS public.cobranca_registrar_assinatura(uuid, text, text[], int, int, text, int, text, text, date);
DROP FUNCTION IF EXISTS public.cobranca_processar_vencimentos(timestamptz);
DROP FUNCTION IF EXISTS public.cobranca_aplicar_evento(text, text, jsonb);
DROP FUNCTION IF EXISTS internal.cobranca_reativar(uuid);
DROP FUNCTION IF EXISTS internal.cobranca_suspender(uuid, text);
DROP FUNCTION IF EXISTS public.fp_minha_assinatura();
DROP FUNCTION IF EXISTS public.fp_empresa_tem_recurso(uuid, text);
DROP FUNCTION IF EXISTS public.fp_recursos_empresa(uuid);
DROP SCHEMA IF EXISTS saas CASCADE;  -- planos, assinaturas, faturas, eventos, auditoria, parâmetros (dados SaaS)
-- produtos demo dos trials ficam (são dados das empresas de trial); empresas.plano mantém o texto.
COMMIT;
