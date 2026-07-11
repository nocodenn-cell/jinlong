-- Create funcionarios table (separate from usuarios)
-- This allows employees to exist without system login credentials
-- and enables flexible user-employee relationships

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Create funcionarios table
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.funcionarios (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id      uuid        NOT NULL REFERENCES public.lojas(id),
  nome         text        NOT NULL,
  cpf          text        UNIQUE,
  telefone     text,
  email        text,
  ativo        boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.funcionarios IS 'Employee master data. Separate from usuarios to allow employees without system login.';
COMMENT ON COLUMN public.funcionarios.cpf IS 'Optional - can add validation in v2 if needed for payroll integration';
COMMENT ON COLUMN public.funcionarios.ativo IS 'Soft delete flag; true = employee can be assigned to sales';

CREATE INDEX idx_funcionarios_loja_ativo ON public.funcionarios(loja_id, ativo);
CREATE INDEX idx_funcionarios_cpf ON public.funcionarios(cpf) WHERE cpf IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Modify usuarios table: add funcionario_id (optional link)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.usuarios.funcionario_id IS 'Optional link to funcionarios table. NULL = user without employee profile. Allows employees without login and users without employee data.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS Policies for funcionarios
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users can see funcionarios in their loja
DROP POLICY IF EXISTS funcionarios_select_loja ON public.funcionarios;
CREATE POLICY funcionarios_select_loja
  ON public.funcionarios FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.loja_id = funcionarios.loja_id
    )
  );

-- SELECT: DONO can see all funcionarios across all lojas
DROP POLICY IF EXISTS funcionarios_select_dono ON public.funcionarios;
CREATE POLICY funcionarios_select_dono
  ON public.funcionarios FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil = 'DONO'
    )
  );

-- INSERT/UPDATE: Only GERENTE/DONO/ADMIN within their loja can create/edit
DROP POLICY IF EXISTS funcionarios_write_loja ON public.funcionarios;
CREATE POLICY funcionarios_write_loja
  ON public.funcionarios FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = funcionarios.loja_id)
    )
  );
