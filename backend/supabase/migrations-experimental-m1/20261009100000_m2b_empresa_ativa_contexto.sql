-- M2-B F1–F2 (LOCAL ONLY): empresa ativa persistida + helpers fail-closed
-- Depende de: 20261009000000_m1_fundacao_multiempresa.sql
-- NÃO aplicar remoto / db push.
--
-- Conflito documentado vs D9: fp_pode_loja deixa de tratar perfil ADMIN como
-- bypass global; usa apenas fp_eh_plataforma() (D1). ADMIN legado sem
-- plataforma_admins não lê dados de cliente via RLS.

-- ============================================================================
-- F1/F2 — Persistência
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.usuario_contexto_ativo (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  loja_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 1,
  FOREIGN KEY (loja_id, empresa_id)
    REFERENCES public.lojas (id, empresa_id)
);

COMMENT ON TABLE public.usuario_contexto_ativo IS
  'M2-B: empresa/loja ativas do usuário. Escrita só via fp_set_empresa_ativa.';

ALTER TABLE public.usuario_contexto_ativo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contexto_ativo_select_proprio ON public.usuario_contexto_ativo;
CREATE POLICY contexto_ativo_select_proprio ON public.usuario_contexto_ativo
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

-- Sem policy de INSERT/UPDATE/DELETE para authenticated (só DEFINER).

GRANT SELECT ON public.usuario_contexto_ativo TO authenticated;
GRANT ALL ON public.usuario_contexto_ativo TO service_role;

-- ============================================================================
-- F2 — Helpers de empresa ativa
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fp_empresa_ativa()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guc text;
  v_ctx uuid;
  v_unica uuid;
  v_n int;
BEGIN
  IF NOT public.fp_usuario_ativo() THEN
    RETURN NULL;
  END IF;

  v_guc := nullif(current_setting('request.fp.empresa_id', true), '');
  IF v_guc IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.usuario_vinculos v
      WHERE v.usuario_id = auth.uid() AND v.ativo AND v.empresa_id = v_guc::uuid
    ) THEN
      RETURN v_guc::uuid;
    END IF;
    RETURN NULL; -- GUC adulterada / revogada
  END IF;

  SELECT c.empresa_id INTO v_ctx
  FROM public.usuario_contexto_ativo c
  WHERE c.usuario_id = auth.uid();

  IF v_ctx IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.usuario_vinculos v
    WHERE v.usuario_id = auth.uid() AND v.ativo AND v.empresa_id = v_ctx
  ) THEN
    RETURN v_ctx;
  END IF;
  -- Contexto órfão (vínculo revogado): ignora linha e resolve pelos vínculos restantes.

  SELECT count(DISTINCT v.empresa_id)::int INTO v_n
  FROM public.usuario_vinculos v
  WHERE v.usuario_id = auth.uid() AND v.ativo;

  IF v_n = 1 THEN
    SELECT v.empresa_id INTO v_unica
    FROM public.usuario_vinculos v
    WHERE v.usuario_id = auth.uid() AND v.ativo
    LIMIT 1;
    RETURN v_unica; -- cliente 1 / single-empresa: auto
  END IF;

  RETURN NULL; -- dual sem seleção → fail closed
END;
$$;

CREATE OR REPLACE FUNCTION public.fp_lojas_permitidas(p_papeis text[] DEFAULT NULL)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT x.loja_id FROM (
    SELECT l.id AS loja_id
    FROM public.usuario_vinculos v
    JOIN public.lojas l ON l.empresa_id = v.empresa_id
    WHERE v.usuario_id = auth.uid()
      AND v.ativo
      AND v.papel = 'DONO'
      AND (p_papeis IS NULL OR v.papel = ANY (p_papeis))
      AND public.fp_usuario_ativo()
      AND public.fp_empresa_ativa() IS NOT NULL
      AND l.empresa_id = public.fp_empresa_ativa()
    UNION ALL
    SELECT v.loja_id
    FROM public.usuario_vinculos v
    WHERE v.usuario_id = auth.uid()
      AND v.ativo
      AND v.papel IN ('GERENTE', 'OPERADOR')
      AND v.loja_id IS NOT NULL
      AND (p_papeis IS NULL OR v.papel = ANY (p_papeis))
      AND public.fp_usuario_ativo()
      AND public.fp_empresa_ativa() IS NOT NULL
      AND v.empresa_id = public.fp_empresa_ativa()
  ) x
  WHERE x.loja_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.fp_pode_loja(p_loja uuid, p_papeis text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_loja IS NULL THEN false
    WHEN NOT public.fp_usuario_ativo() THEN false
    WHEN public.fp_empresa_ativa() IS NULL THEN false
    WHEN public.fp_eh_plataforma() THEN true
    WHEN public.fp_empresa_da_loja(p_loja) IS DISTINCT FROM public.fp_empresa_ativa() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.fp_lojas_permitidas(p_papeis) lid
      WHERE lid = p_loja
    )
  END;
$$;

-- ============================================================================
-- F2 — Setter com prova de vínculo + caixa aberto + race
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fp_set_empresa_ativa(
  p_empresa_id uuid,
  p_loja_id uuid DEFAULT NULL,
  p_expected_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev uuid;
  v_prev_ver bigint;
  v_papel text;
  v_new_ver bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fp_usuario_ativo() THEN
    RAISE EXCEPTION 'USUARIO_INATIVO' USING ERRCODE = '42501';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  -- Serializa trocas do mesmo usuário (abas / concorrência)
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  SELECT c.empresa_id, c.version INTO v_prev, v_prev_ver
  FROM public.usuario_contexto_ativo c
  WHERE c.usuario_id = v_uid
  FOR UPDATE;

  IF p_expected_version IS NOT NULL AND v_prev_ver IS NOT NULL
     AND p_expected_version IS DISTINCT FROM v_prev_ver THEN
    RAISE EXCEPTION 'CONTEXTO_VERSION_CONFLITO' USING ERRCODE = '40001';
  END IF;

  SELECT v.papel INTO v_papel
  FROM public.usuario_vinculos v
  WHERE v.usuario_id = v_uid AND v.empresa_id = p_empresa_id AND v.ativo
  LIMIT 1;

  IF v_papel IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NAO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fp_empresa_operacional(p_empresa_id) THEN
    RAISE EXCEPTION 'EMPRESA_NAO_OPERACIONAL' USING ERRCODE = '42501';
  END IF;

  IF p_loja_id IS NOT NULL THEN
    IF public.fp_empresa_da_loja(p_loja_id) IS DISTINCT FROM p_empresa_id THEN
      RAISE EXCEPTION 'LOJA_FORA_DA_EMPRESA' USING ERRCODE = '42501';
    END IF;
    IF v_papel <> 'DONO' AND NOT EXISTS (
      SELECT 1 FROM public.usuario_vinculos v
      WHERE v.usuario_id = v_uid AND v.ativo AND v.empresa_id = p_empresa_id
        AND v.loja_id = p_loja_id
    ) THEN
      RAISE EXCEPTION 'LOJA_NAO_AUTORIZADA' USING ERRCODE = '42501';
    END IF;
  ELSIF v_papel = 'OPERADOR' THEN
    SELECT v.loja_id INTO p_loja_id
    FROM public.usuario_vinculos v
    WHERE v.usuario_id = v_uid AND v.empresa_id = p_empresa_id AND v.ativo
      AND v.papel = 'OPERADOR'
    LIMIT 1;
  END IF;

  -- Troca de empresa com caixa aberto na empresa anterior
  IF v_prev IS NOT NULL AND v_prev IS DISTINCT FROM p_empresa_id THEN
    IF EXISTS (
      SELECT 1
      FROM public.caixas c
      JOIN public.lojas l ON l.id = c.loja_id
      WHERE c.operador_id = v_uid
        AND c.status = 'ABERTO'
        AND l.empresa_id = v_prev
    ) THEN
      RAISE EXCEPTION 'CAIXA_ABERTO_BLOQUEIA_TROCA' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.usuario_contexto_ativo (usuario_id, empresa_id, loja_id, updated_at, version)
  VALUES (v_uid, p_empresa_id, p_loja_id, now(), 1)
  ON CONFLICT (usuario_id) DO UPDATE
    SET empresa_id = EXCLUDED.empresa_id,
        loja_id = EXCLUDED.loja_id,
        updated_at = now(),
        version = public.usuario_contexto_ativo.version + 1
  RETURNING version INTO v_new_ver;

  RETURN jsonb_build_object(
    'ok', true,
    'empresa_id', p_empresa_id,
    'loja_id', p_loja_id,
    'version', v_new_ver
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fp_assert_contexto_consistente(p_empresa_esperada uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ativa uuid := public.fp_empresa_ativa();
BEGIN
  IF p_empresa_esperada IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_ESPERADA_AUSENTE' USING ERRCODE = '22023';
  END IF;
  IF v_ativa IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_ATIVA_OBRIGATORIA' USING ERRCODE = '42501';
  END IF;
  IF v_ativa IS DISTINCT FROM p_empresa_esperada THEN
    RAISE EXCEPTION 'EMPRESA_DIVERGENTE' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fp_empresa_ativa() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_set_empresa_ativa(uuid, uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_assert_contexto_consistente(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fp_empresa_ativa() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_set_empresa_ativa(uuid, uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_assert_contexto_consistente(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_lojas_permitidas(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_pode_loja(uuid, text[]) TO authenticated, service_role;
