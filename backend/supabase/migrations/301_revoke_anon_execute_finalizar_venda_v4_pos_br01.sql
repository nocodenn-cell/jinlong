-- ============================================================================
-- 301 — Regressão de segurança introduzida pela migration 298 (BR-01):
-- anon voltou a poder executar finalizar_venda_transacional_canonica_v4.
--
-- PROBLEMA
-- --------
-- A migration 277 (2026-07-29) já tinha corrigido exatamente esta classe de
-- bug: EXECUTE de `anon` na RPC canônica de finalização de venda
-- (SECURITY DEFINER, sem verificação de perfil, aceita `p_operador_id` do
-- próprio payload via `COALESCE(auth.uid(), p_operador_id)`).
--
-- A migration 298 (BR-01, 2026-08-05) precisou adicionar um parâmetro novo
-- (`p_limite_credito_gerente_token`) e, para evitar o overload duplicado
-- (Postgres identifica função por nome+tipos, não nome+defaults), usou
-- `DROP FUNCTION` da assinatura de 21 args seguido de `CREATE FUNCTION` da
-- de 22. Isso resolveu o overload — mas todo `CREATE FUNCTION` nasce com
-- `EXECUTE` concedido a `PUBLIC` por padrão do Postgres. A 298 só fez
-- `GRANT EXECUTE ... TO authenticated, service_role` explícito; não revogou
-- de `PUBLIC`. Como `anon` herda de `PUBLIC`, o REVOKE da 277 — que era
-- sobre a assinatura de 21 args, agora inexistente — deixou de valer para a
-- função vigente.
--
-- Achado NESTA migration, durante validação integrada do Pacote 5 (BR-01 +
-- TB-07 + BR-03), via `information_schema.role_routine_grants` e
-- `get_advisors(security)` — não fazia parte de nenhum ticket de auditoria
-- anterior porque é regressão desta sessão, não achado original.
--
-- CONTRASTE: `registrar_pagamento_contas_pagar` (migration 299, TB-07) usou
-- `CREATE OR REPLACE` (assinatura inalterada) — que PRESERVA grants
-- existentes — por isso não sofreu o mesmo problema. Confirmado por consulta
-- direta: apenas authenticated/service_role têm EXECUTE nela.
--
-- CORREÇÃO
-- --------
-- Mesmo padrão da 277, sobre a assinatura de 22 args vigente desde a 298.
-- ============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v4 IS
  'BR-03 (2026-08-05): custo_unitario_snap derivado de produtos.preco_custo no servidor, nunca aceito do payload do cliente. NULL quando custo ausente (ADR-007) — nunca 0. SEGURANÇA (migration 301, 2026-08-05): EXECUTE restrito a authenticated e service_role; PUBLIC e anon revogados — a migration 298 (DROP+CREATE para o parâmetro de limite de crédito) tinha reintroduzido o grant default de PUBLIC que a 277 já havia fechado. Chamador único autorizado: pdv-importados/app/caixa/server/caixaVendas.impl.ts (sessão obrigatória).';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO
-- ============================================================================

DO $verify$
DECLARE
  v_cnt integer;
BEGIN
  SELECT count(*) INTO v_cnt FROM information_schema.role_routine_grants
  WHERE routine_name = 'finalizar_venda_transacional_canonica_v4'
    AND routine_schema = 'public'
    AND grantee IN ('anon', 'PUBLIC');
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'MIG301_ANON_OU_PUBLIC_AINDA_TEM_EXECUTE';
  END IF;

  SELECT count(*) INTO v_cnt FROM information_schema.role_routine_grants
  WHERE routine_name = 'finalizar_venda_transacional_canonica_v4'
    AND routine_schema = 'public'
    AND grantee = 'authenticated';
  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'MIG301_AUTHENTICATED_PERDEU_EXECUTE';
  END IF;

  RAISE NOTICE '301 OK — anon/PUBLIC sem EXECUTE, authenticated preservado';
END
$verify$;

COMMIT;
