-- Reconciliação: garantir RLS em public.vendas_pagamentos (split payment).
-- Cenário: Security Advisor em produção acusando "RLS Disabled" — tabela criada ou
-- alterada fora da sequência 051, ou migration 051 não aplicada por completo.
-- Idempotente: repetir em qualquer ambiente alinha com o modelo das migrations 051 + 044 (ADMIN).

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
