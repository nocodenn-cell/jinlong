-- Cadastro de formas de pagamento para o painel gerencial.

CREATE TABLE IF NOT EXISTS public.formas_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  descricao text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('CARTAO', 'DINHEIRO', 'PIX', 'BOLETO', 'OUTRO')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT formas_pagamento_codigo_unique UNIQUE (codigo)
);

ALTER TABLE public.formas_pagamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "formas_pagamento_gerente_all" ON public.formas_pagamento;
CREATE POLICY "formas_pagamento_gerente_all"
  ON public.formas_pagamento FOR ALL
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

DROP TRIGGER IF EXISTS formas_pagamento_updated_at ON public.formas_pagamento;
CREATE TRIGGER formas_pagamento_updated_at
  BEFORE UPDATE ON public.formas_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

