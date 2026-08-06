-- Migration 308: hardening das funções-trigger criadas pela 306 (D-2)
-- Data: 2026-08-06
--
-- O advisor de segurança do Supabase acusou, logo após a 306, que
-- `tg_documentos_fiscais_estado_bi()` e `tg_documentos_fiscais_estado_bu()`
-- ficaram executáveis por `anon`/`authenticated` como SECURITY DEFINER via
-- `/rest/v1/rpc/…` — comportamento padrão do Postgres/PostgREST para função nova
-- em schema `public` sem REVOKE explícito, o mesmo achado que gerou a
-- `20260731200258_hardening_trg_creditar_saldo_caixa.sql`.
--
-- São funções de trigger, sem uso legítimo fora do disparo automático em
-- `documentos_fiscais_pendentes`. O mecanismo de trigger dispara independente de
-- GRANT de EXECUTE — nenhum role precisa de acesso direto.
--
-- Mantido no mesmo padrão da migration precedente, de propósito: hardening novo
-- não deve inventar um estilo próprio.

REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bi() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bi() FROM anon;
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bi() FROM authenticated;

REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bu() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bu() FROM anon;
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bu() FROM authenticated;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.tg_documentos_fiscais_estado_bi()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tg_documentos_fiscais_estado_bi()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tg_documentos_fiscais_estado_bu()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tg_documentos_fiscais_estado_bu()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG308_TRIGGER_AINDA_EXPOSTA';
  END IF;

  -- A trigger tem que continuar funcionando: a 306 provou que EMITIDO→PENDENTE
  -- é bloqueado, e REVOKE de EXECUTE não afeta o disparo automático.
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.documentos_fiscais_pendentes'::regclass
        AND tgname IN ('tr_documentos_fiscais_estado_bi','tr_documentos_fiscais_estado_bu')) <> 2 THEN
    RAISE EXCEPTION 'MIG308_TRIGGERS_SUMIRAM';
  END IF;

  RAISE NOTICE '308 OK - funcoes-trigger da 306 sem EXECUTE para anon/authenticated';
END
$verify$;
