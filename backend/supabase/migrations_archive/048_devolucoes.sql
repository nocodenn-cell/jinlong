-- Devoluções / reembolsos vinculados à venda original.
-- Impacto no caixa: apenas quando forma_pagamento = 'DINHEIRO' (dinheiro físico devolvido).
-- Ordem: aplicar antes de 049 (função que agrega devoluções).

CREATE TABLE IF NOT EXISTS public.devolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas (id) ON DELETE RESTRICT,
  valor numeric(10,2) NOT NULL CHECK (valor > 0),
  forma_pagamento text NOT NULL CHECK (
    forma_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO')
  ),
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 2),
  operador_id uuid NOT NULL REFERENCES public.usuarios (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.devolucoes IS
  'Registro de devolução/reembolso; para fechamento de caixa, somar valor em DINHEIRO da venda do mesmo caixa.';

COMMENT ON COLUMN public.devolucoes.forma_pagamento IS
  'Mesmo domínio de public.vendas.forma_pagamento; apenas DINHEIRO reduz o esperado em espécie no caixa.';

CREATE INDEX IF NOT EXISTS idx_devolucoes_venda_id ON public.devolucoes (venda_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_operador_id ON public.devolucoes (operador_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_created_at ON public.devolucoes (created_at DESC);

ALTER TABLE public.devolucoes ENABLE ROW LEVEL SECURITY;

-- Leitura: mesma loja do caixa da venda; operador vê as próprias ou GERENTE/DONO/ADMIN da loja.
DROP POLICY IF EXISTS "devolucoes_select_loja" ON public.devolucoes;
CREATE POLICY "devolucoes_select_loja"
  ON public.devolucoes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = devolucoes.venda_id
        AND c.loja_id = u.loja_id
        AND (
          devolucoes.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

-- Inclusão: operador autenticado registra em nome próprio; venda deve ser da mesma loja.
DROP POLICY IF EXISTS "devolucoes_insert_loja" ON public.devolucoes;
CREATE POLICY "devolucoes_insert_loja"
  ON public.devolucoes FOR INSERT TO authenticated
  WITH CHECK (
    operador_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.vendas v
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = devolucoes.venda_id
        AND c.loja_id = u.loja_id
    )
  );

-- Ajustes/correções apenas gerenciais na loja.
DROP POLICY IF EXISTS "devolucoes_update_gerente_loja" ON public.devolucoes;
CREATE POLICY "devolucoes_update_gerente_loja"
  ON public.devolucoes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = devolucoes.venda_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = devolucoes.venda_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "devolucoes_delete_gerente_loja" ON public.devolucoes;
CREATE POLICY "devolucoes_delete_gerente_loja"
  ON public.devolucoes FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = devolucoes.venda_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );
