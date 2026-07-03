-- 254 (renumerado de 250 em 2026-07-03) - Hardening: escopo da RPC de
-- auditoria de pricing por venda.
--
-- RENUMERADO: colidia com 250_calcular_preco_produto_decision_fields.sql
-- (mesmo prefixo numérico) — quebrava `db reset`/replay sequencial com
-- duplicate key em schema_migrations_pkey. Confirmado com o usuário via
-- `npx supabase migration list` contra produção: nem esta migration nem sua
-- colidente tinham entrada em Remote antes desta mudança. Conteúdo abaixo
-- inalterado (sem dependência cruzada verificada antes de renumerar; a
-- referência à "migration 249" abaixo é histórica e permanece correta).
--
-- Causa raiz:
--   A migration 249 criou registrar_pricing_version_venda como SECURITY DEFINER
--   com EXECUTE para authenticated, mas sem checar auth.uid(), loja ou ownership.
--   Qualquer usuario autenticado que soubesse um venda_id poderia preencher
--   pricing_version_id em vendas/itens_venda de outra loja, bypassando RLS.
--
-- Correcao:
--   Mantem a assinatura usada pelo caixa web, mas exige que o caller seja:
--     * operador da venda e da mesma loja do caixa; ou
--     * GERENTE/DONO/ADMIN da loja do caixa.
--   Tambem valida que a venda esta concluida e que a versao informada e a
--   versao ativa no momento da chamada.

CREATE OR REPLACE FUNCTION public.registrar_pricing_version_venda(
  p_venda_id    uuid,
  p_version_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user record;
  v_venda record;
BEGIN
  IF p_venda_id IS NULL OR p_version_id IS NULL THEN
    RETURN;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PRICING_VERSION_VENDA_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_user
    FROM public.usuarios u
   WHERE u.id = v_uid
     AND COALESCE(u.ativo, true) = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRICING_VERSION_VENDA_USUARIO_INVALIDO';
  END IF;

  PERFORM 1
    FROM public.pricing_config_versions pcv
   WHERE pcv.id = p_version_id
     AND pcv.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRICING_VERSION_VENDA_VERSION_INVALIDA';
  END IF;

  SELECT v.id, v.operador_id, v.status, c.loja_id
    INTO v_venda
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id
   WHERE v.id = p_venda_id
   FOR UPDATE OF v;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRICING_VERSION_VENDA_NAO_ENCONTRADA';
  END IF;

  IF v_venda.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'PRICING_VERSION_VENDA_STATUS_INVALIDO';
  END IF;

  IF NOT (
    v_venda.operador_id = v_uid
    AND v_user.loja_id = v_venda.loja_id
  ) AND NOT (
    v_user.perfil = ANY (ARRAY['GERENTE', 'DONO', 'ADMIN'])
    AND v_user.loja_id = v_venda.loja_id
  ) THEN
    RAISE EXCEPTION 'PRICING_VERSION_VENDA_SEM_PERMISSAO';
  END IF;

  UPDATE public.vendas
     SET pricing_version_id = p_version_id
   WHERE id = p_venda_id
     AND pricing_version_id IS NULL;

  UPDATE public.itens_venda
     SET pricing_version_id = p_version_id
   WHERE venda_id = p_venda_id
     AND pricing_version_id IS NULL;
END;
$$;

COMMENT ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) IS
  'Registra a versao ativa de pricing em vendas e itens_venda apos finalizacao. '
  'SECURITY DEFINER com escopo por auth.uid(), loja do caixa e ownership da venda.';

REVOKE ALL ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) TO service_role;
