-- M1 experimental: fundação multiempresa (LOCAL ONLY — NÃO aplicar remoto)
-- Spec: ESPEC_MULTIEMPRESA_V1.md §2–§7 (etapas 1–3 + protótipo D16)

-- ============================================================================
-- 1. DDL aditivo
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  razao_social text NULL,
  cnpj text NULL CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
  plano text NOT NULL DEFAULT 'piloto',
  status text NOT NULL DEFAULT 'ATIVA'
    CHECK (status IN ('ATIVA', 'SUSPENSA', 'CANCELADA')),
  vigencia_inicio date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim date NULL,
  max_lojas int NULL,
  max_usuarios int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS empresas_cnpj_uidx
  ON public.empresas (cnpj)
  WHERE cnpj IS NOT NULL;

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lojas_id_empresa_id_key'
      AND conrelid = 'public.lojas'::regclass
  ) THEN
    ALTER TABLE public.lojas
      ADD CONSTRAINT lojas_id_empresa_id_key UNIQUE (id, empresa_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lojas_empresa_id_codigo_key'
      AND conrelid = 'public.lojas'::regclass
  ) THEN
    ALTER TABLE public.lojas
      ADD CONSTRAINT lojas_empresa_id_codigo_key UNIQUE (empresa_id, codigo);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'lojas_empresa_id_codigo_key skipped: dados conflitantes (esperado só em fixtures limpos)';
END $$;

CREATE TABLE IF NOT EXISTS public.plataforma_admins (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  motivo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

CREATE TABLE IF NOT EXISTS public.usuario_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  loja_id uuid NULL,
  papel text NOT NULL CHECK (papel IN ('DONO', 'GERENTE', 'OPERADOR')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CHECK (
    (papel = 'DONO' AND loja_id IS NULL)
    OR (papel <> 'DONO' AND loja_id IS NOT NULL)
  ),
  FOREIGN KEY (loja_id, empresa_id)
    REFERENCES public.lojas (id, empresa_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS usuario_vinculos_uidx
  ON public.usuario_vinculos (usuario_id, empresa_id, papel, loja_id)
  NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS usuario_vinculos_operador_uma_loja
  ON public.usuario_vinculos (usuario_id, empresa_id)
  WHERE papel = 'OPERADOR' AND ativo;

CREATE INDEX IF NOT EXISTS usuario_vinculos_usuario_ativo_idx
  ON public.usuario_vinculos (usuario_id)
  WHERE ativo;

CREATE INDEX IF NOT EXISTS usuario_vinculos_loja_ativo_idx
  ON public.usuario_vinculos (loja_id)
  WHERE ativo;

-- ============================================================================
-- 2. Backfill Empresa 1 (não destrutivo)
-- ============================================================================

INSERT INTO public.empresas (id, nome, plano, status, vigencia_inicio)
VALUES (
  'e1000001-0000-4000-8000-000000000001'::uuid,
  'Empresa 1 (Matriz legado)',
  'piloto',
  'ATIVA',
  CURRENT_DATE
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.lojas
SET empresa_id = 'e1000001-0000-4000-8000-000000000001'::uuid
WHERE empresa_id IS NULL;

INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
SELECT
  u.id,
  'e1000001-0000-4000-8000-000000000001'::uuid,
  CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END,
  CASE
    WHEN u.perfil = 'DONO' THEN 'DONO'
    WHEN u.perfil = 'GERENTE' THEN 'GERENTE'
    ELSE 'OPERADOR'
  END,
  COALESCE(u.ativo, true)
FROM public.usuarios u
WHERE u.perfil IN ('DONO', 'GERENTE', 'OPERADOR')
  AND u.loja_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.usuario_vinculos v
    WHERE v.usuario_id = u.id
      AND v.empresa_id = 'e1000001-0000-4000-8000-000000000001'::uuid
  );

-- ADMIN legado: sem vínculo (D9). plataforma_admins permanece vazia.

-- ============================================================================
-- 3. Helpers fp_* (SSOT de escopo)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fp_usuario_ativo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT u.ativo FROM public.usuarios u WHERE u.id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.fp_eh_plataforma()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plataforma_admins p
    WHERE p.usuario_id = auth.uid() AND p.ativo
  );
$$;

CREATE OR REPLACE FUNCTION public.fp_empresas_do_usuario()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT v.empresa_id
  FROM public.usuario_vinculos v
  WHERE v.usuario_id = auth.uid()
    AND v.ativo
    AND public.fp_usuario_ativo();
$$;

CREATE OR REPLACE FUNCTION public.fp_lojas_permitidas(p_papeis text[] DEFAULT NULL)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT x.loja_id FROM (
    -- DONO: todas as lojas das empresas com vínculo DONO
    SELECT l.id AS loja_id
    FROM public.usuario_vinculos v
    JOIN public.lojas l ON l.empresa_id = v.empresa_id
    WHERE v.usuario_id = auth.uid()
      AND v.ativo
      AND v.papel = 'DONO'
      AND (p_papeis IS NULL OR v.papel = ANY (p_papeis))
      AND public.fp_usuario_ativo()
    UNION ALL
    -- GERENTE / OPERADOR: lojas dos vínculos
    SELECT v.loja_id
    FROM public.usuario_vinculos v
    WHERE v.usuario_id = auth.uid()
      AND v.ativo
      AND v.papel IN ('GERENTE', 'OPERADOR')
      AND v.loja_id IS NOT NULL
      AND (p_papeis IS NULL OR v.papel = ANY (p_papeis))
      AND public.fp_usuario_ativo()
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
    -- Compat legado ADMIN global (D9/D10) — remover no corte
    WHEN EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo AND u.perfil = 'ADMIN'
    ) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.fp_lojas_permitidas(p_papeis) lid
      WHERE lid = p_loja
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.fp_empresa_da_loja(p_loja uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.empresa_id FROM public.lojas l WHERE l.id = p_loja;
$$;

CREATE OR REPLACE FUNCTION public.fp_mesma_empresa(p_loja_a uuid, p_loja_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.fp_empresa_da_loja(p_loja_a) IS NOT NULL
    AND public.fp_empresa_da_loja(p_loja_a) = public.fp_empresa_da_loja(p_loja_b);
$$;

CREATE OR REPLACE FUNCTION public.fp_empresa_operacional(p_empresa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresas e
    WHERE e.id = p_empresa
      AND e.status = 'ATIVA'
      AND e.vigencia_inicio <= CURRENT_DATE
      AND (e.vigencia_fim IS NULL OR e.vigencia_fim >= CURRENT_DATE)
  );
$$;

REVOKE ALL ON FUNCTION public.fp_usuario_ativo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_eh_plataforma() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_empresas_do_usuario() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_lojas_permitidas(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_pode_loja(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_empresa_da_loja(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_mesma_empresa(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fp_empresa_operacional(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fp_usuario_ativo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_eh_plataforma() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_empresas_do_usuario() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_lojas_permitidas(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_pode_loja(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_empresa_da_loja(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_mesma_empresa(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_empresa_operacional(uuid) TO authenticated, service_role;

-- ============================================================================
-- 4. Guardas RESTRICTIVE PoC (D16) — 5 tabelas representativas
-- ============================================================================

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_guard ON public.produtos;
CREATE POLICY tenant_guard ON public.produtos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.fp_pode_loja(loja_id, NULL))
  WITH CHECK (public.fp_pode_loja(loja_id, NULL));

DROP POLICY IF EXISTS tenant_guard ON public.clientes;
CREATE POLICY tenant_guard ON public.clientes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.fp_pode_loja(loja_id, NULL))
  WITH CHECK (public.fp_pode_loja(loja_id, NULL));

DROP POLICY IF EXISTS tenant_guard ON public.fornecedores;
CREATE POLICY tenant_guard ON public.fornecedores
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.fp_pode_loja(loja_id, NULL))
  WITH CHECK (public.fp_pode_loja(loja_id, NULL));

DROP POLICY IF EXISTS tenant_guard ON public.contas_receber;
CREATE POLICY tenant_guard ON public.contas_receber
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.fp_pode_loja(loja_id, NULL))
  WITH CHECK (public.fp_pode_loja(loja_id, NULL));

DROP POLICY IF EXISTS tenant_guard ON public.caixas;
CREATE POLICY tenant_guard ON public.caixas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.fp_pode_loja(loja_id, NULL))
  WITH CHECK (public.fp_pode_loja(loja_id, NULL));

-- RLS nas tabelas de identidade M1 (leitura própria / DONO; escrita só servidor)
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresas_select_proprias ON public.empresas;
CREATE POLICY empresas_select_proprias ON public.empresas
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.fp_empresas_do_usuario()));

DROP POLICY IF EXISTS vinculos_select_proprios ON public.usuario_vinculos;
CREATE POLICY vinculos_select_proprios ON public.usuario_vinculos
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR empresa_id IN (SELECT public.fp_empresas_do_usuario()));

-- plataforma_admins: sem policy de SELECT para authenticated (só service_role / DEFINER)
