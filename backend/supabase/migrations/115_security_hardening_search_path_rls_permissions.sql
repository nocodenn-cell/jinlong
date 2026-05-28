-- ================================================================
-- 115: Hardening de segurança — search_path, SECURITY DEFINER,
--      RLS multi-tenant e schema extensions isolado
-- ================================================================
-- Corrige vulnerabilidades apontadas pelo Database Advisor do Supabase:
--   * search_path mutável → hijacking de schema
--   * SECURITY DEFINER exposta para anon/authenticated → escala de privilégio
--   * RLS USING (true) → quebra isolamento multi-loja
--   * Extensão pg_trgm em public → namespace poluído
-- ================================================================


-- ============================================================
-- 1. FIXAR search_path NAS FUNÇÕES VULNERÁVEIS
-- ============================================================

ALTER FUNCTION public.update_feature_flags_updated_at()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.oc_set_updated_at()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.is_feature_enabled(text)
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.round_abnt(numeric, integer)
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.finalizar_venda_transacional_canonica_v2(
  uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean
) SET search_path = public, pg_catalog;

ALTER FUNCTION public.list_produtos_gerente_filtrados(
  uuid, text, text, text, text, text, text[], uuid, uuid, uuid, text, integer, integer
) SET search_path = public, pg_catalog;


-- ============================================================
-- 2. RESTRINGIR SECURITY DEFINER: ajustar_estoque_manual
--    e aprovar_movimentacao → somente service_role
-- ============================================================
-- Funções SECURITY DEFINER rodam com privilégios do criador (postgres).
-- Expô-las para authenticated representa escalação de privilégio.
-- Chamadas devem ser feitas exclusivamente via Edge Functions com
-- a service_role key, nunca direto pelo cliente autenticado.

REVOKE EXECUTE ON FUNCTION public.ajustar_estoque_manual(
  uuid, uuid, numeric, numeric, text, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ajustar_estoque_manual(
  uuid, uuid, numeric, numeric, text, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ajustar_estoque_manual(
  uuid, uuid, numeric, numeric, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_manual(
  uuid, uuid, numeric, numeric, text, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) TO service_role;


-- ============================================================
-- 3. RLS MULTI-TENANT: substituir USING (true) em
--    ordens_compra e ordens_compra_itens
-- ============================================================
-- USING (true) permite que qualquer usuário autenticado acesse
-- registros de qualquer loja, quebrando o isolamento multi-tenant.

DROP POLICY IF EXISTS oc_auth ON public.ordens_compra;
CREATE POLICY oc_auth ON public.ordens_compra
  FOR ALL TO authenticated
  USING (loja_id = (auth.jwt() -> 'user_metadata' ->> 'loja_id')::uuid)
  WITH CHECK (loja_id = (auth.jwt() -> 'user_metadata' ->> 'loja_id')::uuid);

DROP POLICY IF EXISTS oci_auth ON public.ordens_compra_itens;
CREATE POLICY oci_auth ON public.ordens_compra_itens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ordens_compra oc
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND oc.loja_id = (auth.jwt() -> 'user_metadata' ->> 'loja_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ordens_compra oc
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND oc.loja_id = (auth.jwt() -> 'user_metadata' ->> 'loja_id')::uuid
    )
  );


-- ============================================================
-- 4. MOVER EXTENSÃO pg_trgm PARA SCHEMA ISOLADO
-- ============================================================
-- O schema `extensions` já está em extra_search_path do PostgREST
-- (config.toml: extra_search_path = ["public", "extensions"]),
-- portanto operadores e funções de pg_trgm continuam acessíveis
-- sem qualificação de schema nas queries existentes.

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
