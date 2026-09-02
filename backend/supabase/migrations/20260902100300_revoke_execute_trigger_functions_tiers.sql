-- Gate de Convergência, seção 6 — micro-hardening pendente: trigger functions
-- de precos_atacado/produtos com EXECUTE ainda concedido a PUBLIC/anon/authenticated.
--
-- Achado (já classificado como DEFENSE-IN-DEPTH / EXPOSIÇÃO DESNECESSÁRIA, não
-- vulnerabilidade explorável — trigger functions só rodam via evento de
-- trigger, chamada direta falha com "trigger functions can only be called as
-- triggers" independente de EXECUTE): confirmado ainda pendente em produção
-- via introspecção (has_function_privilege) para
-- public.validar_tier_preco_menor_que_varejo() e public.audit_tiers_crud().
-- Esta migration revoga o EXECUTE desnecessário dessas duas mais das duas
-- trigger functions equivalentes criadas nesta convergência
-- (validar_varejo_maior_que_tiers_ativos) — nenhuma delas precisa de EXECUTE
-- por um caller direto; o motor de triggers do Postgres não depende disso.
--
-- ROLLBACK: GRANT EXECUTE ON FUNCTION <nome>() TO PUBLIC;

BEGIN;

REVOKE ALL ON FUNCTION public.validar_tier_preco_menor_que_varejo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_tiers_crud() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_varejo_maior_que_tiers_ativos() FROM PUBLIC, anon, authenticated;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.validar_tier_preco_menor_que_varejo()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.validar_tier_preco_menor_que_varejo()', 'EXECUTE') THEN
    RAISE EXCEPTION 'GATE_SECAO6_REVOKE_FALHOU: validar_tier_preco_menor_que_varejo ainda executável por anon/authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.audit_tiers_crud()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.audit_tiers_crud()', 'EXECUTE') THEN
    RAISE EXCEPTION 'GATE_SECAO6_REVOKE_FALHOU: audit_tiers_crud ainda executável por anon/authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.validar_varejo_maior_que_tiers_ativos()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.validar_varejo_maior_que_tiers_ativos()', 'EXECUTE') THEN
    RAISE EXCEPTION 'GATE_SECAO6_REVOKE_FALHOU: validar_varejo_maior_que_tiers_ativos ainda executável por anon/authenticated';
  END IF;
END
$verify$;

COMMIT;
