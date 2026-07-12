-- Marcas de produto (cadastro simples + RLS alinhada a fornecedores/categorias).

CREATE TABLE IF NOT EXISTS public.marcas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marcas_nome ON public.marcas (nome);
CREATE INDEX IF NOT EXISTS idx_marcas_ativo ON public.marcas (ativo) WHERE ativo = true;

COMMENT ON TABLE public.marcas IS 'Marcas comerciais do catálogo (opcional em produtos).';

ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marcas_leitura" ON public.marcas;
CREATE POLICY "marcas_leitura"
  ON public.marcas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "marcas_escrita_gerencial" ON public.marcas;
CREATE POLICY "marcas_escrita_gerencial"
  ON public.marcas FOR ALL
  TO authenticated
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

DROP TRIGGER IF EXISTS marcas_updated_at ON public.marcas;
CREATE TRIGGER marcas_updated_at
  BEFORE UPDATE ON public.marcas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
