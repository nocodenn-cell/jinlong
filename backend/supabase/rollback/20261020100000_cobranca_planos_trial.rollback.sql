-- Rollback de 20261020100000_cobranca_planos_trial.sql.
-- ATENÇÃO: antes, reativa vendas de empresas suspensas pela cobrança (devolve o valor anterior).
BEGIN;
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.assinaturas') IS NOT NULL THEN
    FOR r IN SELECT empresa_id FROM public.assinaturas WHERE suspensao_aplicada LOOP
      PERFORM internal.cobranca_reativar(r.empresa_id);
    END LOOP;
  END IF;
END $$;
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
DELETE FROM internal.fp_tenant_guardas WHERE tabela IN ('assinaturas', 'faturas');
DROP TABLE IF EXISTS public.trial_signup_tentativas;
DROP TABLE IF EXISTS public.cobranca_webhook_eventos;
DROP TABLE IF EXISTS public.faturas;
DROP TABLE IF EXISTS public.assinaturas;
DROP TABLE IF EXISTS public.planos;
-- produtos demo dos trials ficam (são dados das empresas de trial); empresas.plano mantém o texto.
COMMIT;
