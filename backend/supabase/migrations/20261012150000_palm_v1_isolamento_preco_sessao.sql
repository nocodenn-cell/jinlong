-- PALM V1 — Fase A (parte 1): isolamento de loja e preço pela sessão.
--
-- Não aplica nada em produção. Não altera fila fiscal, Focus NFe nem as
-- migrations da GO-LIVE 02.
--
-- Problemas fechados aqui:
--   1. SELECT/UPDATE de vendas_em_espera liberava GERENTE/DONO/ADMIN de
--      qualquer loja (policy sem predicado de loja).
--   2. INSERT direto aceitava loja_id diferente da sessão.
--   3. calcular_preco_produto (SECURITY DEFINER) aceitava p_loja_id do
--      cliente sem olhar auth.uid().
--
-- Sessão privilegiada: service_role, ou postgres/supabase_admin SEM jwt de
-- usuário. session_user não muda dentro de SECURITY DEFINER; current_user
-- muda e não pode ser usado (mesmo defeito da trava fiscal).
--
-- Rollback manual (não reabre o bypass de propósito):
--   * Recriar as policies da migration 255 só se a decisão de isolamento
--     for revertida por escrito. Não há script automático de volta.
--   * Recriar calcular_preco_produto a partir de
--     20260901030000_calcular_preco_produto_retorna_quantidade_minima.sql
--     também reabre o p_loja_id livre. Só com autorização explícita.

BEGIN;

CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.palm_sessao_privilegiada()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR (
        session_user IN ('postgres', 'supabase_admin')
        AND auth.uid() IS NULL
      );
$$;

REVOKE ALL ON FUNCTION internal.palm_sessao_privilegiada() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION internal.palm_sessao_privilegiada() IS
  'PALM/preço: worker e migration passam; JWT de usuário nunca passa, mesmo com session_user postgres.';

-- Escrita direta sai. O caixa já grava por RPC SECURITY DEFINER.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.vendas_em_espera FROM authenticated, anon;
GRANT SELECT ON TABLE public.vendas_em_espera TO authenticated;

ALTER TABLE public.vendas_em_espera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_em_espera FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendas_em_espera_select ON public.vendas_em_espera;
CREATE POLICY vendas_em_espera_select ON public.vendas_em_espera
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, false)
        AND u.loja_id = vendas_em_espera.loja_id
        AND u.perfil IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN')
        AND (
          u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
          OR vendas_em_espera.operador_id = u.id
        )
    )
  );

DROP POLICY IF EXISTS vendas_em_espera_insert ON public.vendas_em_espera;
CREATE POLICY vendas_em_espera_insert ON public.vendas_em_espera
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, false)
        AND u.loja_id = vendas_em_espera.loja_id
        AND u.id = vendas_em_espera.operador_id
        AND u.perfil IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS vendas_em_espera_update ON public.vendas_em_espera;
CREATE POLICY vendas_em_espera_update ON public.vendas_em_espera
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, false)
        AND u.loja_id = vendas_em_espera.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN', 'OPERADOR')
        AND (
          u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
          OR vendas_em_espera.operador_id = u.id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, false)
        AND u.loja_id = vendas_em_espera.loja_id
    )
  );

CREATE OR REPLACE FUNCTION public.calcular_preco_produto(
  p_produto_id uuid,
  p_quantidade integer,
  p_loja_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_varejo numeric(10, 2);
  v_loja uuid;
  v_uid uuid;
  v_perfil text;
  v_ativo boolean;
  v_loja_usuario uuid;
  r record;
BEGIN
  IF NOT internal.palm_sessao_privilegiada() THEN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
      RETURN jsonb_build_object('preco', NULL, 'tipo', 'VAREJO', 'erro', 'nao_autorizado');
    END IF;

    SELECT u.loja_id, u.perfil, COALESCE(u.ativo, false)
      INTO v_loja_usuario, v_perfil, v_ativo
    FROM public.usuarios u
    WHERE u.id = v_uid;

    IF NOT FOUND OR NOT v_ativo OR v_loja_usuario IS NULL
       OR v_perfil NOT IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN') THEN
      RETURN jsonb_build_object('preco', NULL, 'tipo', 'VAREJO', 'erro', 'nao_autorizado');
    END IF;

    IF p_loja_id IS NOT NULL AND p_loja_id IS DISTINCT FROM v_loja_usuario THEN
      RETURN jsonb_build_object('preco', NULL, 'tipo', 'VAREJO', 'erro', 'loja_nao_autorizada');
    END IF;

    v_loja := v_loja_usuario;
  ELSE
    v_loja := p_loja_id;
  END IF;

  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RETURN jsonb_build_object('preco', NULL, 'tipo', 'VAREJO', 'erro', 'quantidade_invalida');
  END IF;

  SELECT p.preco_varejo
    INTO v_varejo
  FROM public.produtos p
  WHERE p.id = p_produto_id
    AND p.ativo = true
    AND (internal.palm_sessao_privilegiada() OR p.loja_id = v_loja);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('preco', NULL, 'tipo', 'VAREJO', 'erro', 'produto_nao_encontrado');
  END IF;

  SELECT pa.preco_unitario, pa.id, pa.quantidade_minima
    INTO r
  FROM public.precos_atacado pa
  WHERE pa.produto_id = p_produto_id
    AND pa.ativo = true
    AND pa.quantidade_minima <= p_quantidade
    AND (pa.loja_id IS NULL OR pa.loja_id = v_loja)
  ORDER BY pa.quantidade_minima DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'preco', r.preco_unitario,
      'tipo', 'ATACADO',
      'fonte', 'tier',
      'regra_id', r.id,
      'quantidade_minima', r.quantidade_minima
    );
  END IF;

  RETURN jsonb_build_object(
    'preco', v_varejo,
    'tipo', 'VAREJO',
    'fonte', 'varejo',
    'regra_id', NULL,
    'quantidade_minima', NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) IS
  'D0 + PALM: preço por tiers ativos. Com JWT, p_loja_id tem de ser a loja da sessão e o produto tem de ser dessa loja. Sem JWT privilegiado, comportamento anterior.';

REVOKE ALL ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
