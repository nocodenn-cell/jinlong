-- Split payment (2+ meios por venda), preservando compatibilidade com forma_pagamento legado.

CREATE TABLE IF NOT EXISTS public.vendas_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  forma_pagamento text NOT NULL CHECK (
    forma_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'FIADO')
  ),
  valor numeric(10,2) NOT NULL CHECK (valor > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_pagamentos_venda_id ON public.vendas_pagamentos(venda_id);
CREATE INDEX IF NOT EXISTS idx_vendas_pagamentos_forma ON public.vendas_pagamentos(forma_pagamento);

ALTER TABLE public.vendas_pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_pagamentos_select_loja" ON public.vendas_pagamentos;
CREATE POLICY "vendas_pagamentos_select_loja"
  ON public.vendas_pagamentos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = vendas_pagamentos.venda_id
        AND c.loja_id = u.loja_id
        AND (
          v.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

DROP POLICY IF EXISTS "vendas_pagamentos_insert_loja" ON public.vendas_pagamentos;
CREATE POLICY "vendas_pagamentos_insert_loja"
  ON public.vendas_pagamentos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = vendas_pagamentos.venda_id
        AND c.loja_id = u.loja_id
        AND (
          v.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

COMMENT ON TABLE public.vendas_pagamentos IS
  'Parcelas de pagamento por venda para suportar split payment (2+ meios).';
