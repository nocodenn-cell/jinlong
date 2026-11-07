-- Rollback de 20261020100000_cobranca_planos_trial.sql.
-- ATENÇÃO: antes, reativa vendas de empresas suspensas pela cobrança (devolve o valor anterior).
BEGIN;
-- se 20261020110000 (venda offline) estiver aplicada, devolve o gatilho de vendas antes de remover o schema
DO $$
DECLARE v_def text := pg_get_functiondef('public.trg_fn_vendas_caixa_aberto()'::regprocedure);
BEGIN
  IF strpos(v_def, 'internal.cobranca_venda_offline_liberada') > 0 THEN
    EXECUTE replace(v_def, 'IF v_suspensas = ''true'' AND NOT internal.cobranca_venda_offline_liberada(NEW.id, NEW.caixa_id) THEN',
                           'IF v_suspensas = ''true'' THEN');
  END IF;
END $$;
DROP FUNCTION IF EXISTS internal.cobranca_venda_offline_liberada(uuid, uuid);
DROP TRIGGER IF EXISTS trg_pdv_dispositivos_ciencia_suspensao ON public.pdv_dispositivos;
DROP FUNCTION IF EXISTS public.cobranca_liberar_venda_offline(uuid, uuid, timestamptz);
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
