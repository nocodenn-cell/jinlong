-- Cadastro de vendedores (painel gerencial — sem vínculo obrigatório com auth.users).

CREATE TABLE IF NOT EXISTS public.vendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  cpf text,
  celular text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendedores_codigo_unique UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_vendedores_nome ON public.vendedores (nome);
CREATE INDEX IF NOT EXISTS idx_vendedores_ativo ON public.vendedores (ativo);

COMMENT ON TABLE public.vendedores IS 'Vendedores para cadastro operacional e relatórios.';

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedores_gerente_all" ON public.vendedores;
CREATE POLICY "vendedores_gerente_all"
  ON public.vendedores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP TRIGGER IF EXISTS vendedores_updated_at ON public.vendedores;
CREATE TRIGGER vendedores_updated_at
  BEFORE UPDATE ON public.vendedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
