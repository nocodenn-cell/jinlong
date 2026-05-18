-- Tabela de vendas suspensas (Park / Hold)
-- Permite ao operador "estacionar" um cupom em andamento e atender outro cliente,
-- resgatando depois sem perder itens, quantidades e descontos.

CREATE TABLE IF NOT EXISTS public.vendas_suspensas (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id        uuid        NOT NULL REFERENCES public.lojas(id)   ON DELETE CASCADE,
  caixa_id       uuid        REFERENCES public.caixas(id)           ON DELETE SET NULL,
  operador_id    uuid        NOT NULL REFERENCES auth.users(id),
  identificacao  text        NOT NULL DEFAULT '',
  itens          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  total_bruto    numeric(12,2) NOT NULL DEFAULT 0,
  total_desconto numeric(12,2) NOT NULL DEFAULT 0,
  total_liquido  numeric(12,2) NOT NULL DEFAULT 0,
  total_itens    integer     NOT NULL DEFAULT 0,
  status         text        NOT NULL DEFAULT 'ATIVA'
                             CHECK (status IN ('ATIVA', 'RESGATADA', 'CANCELADA')),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

-- Índice para loja + status (listagem ativa)
CREATE INDEX IF NOT EXISTS idx_vendas_suspensas_loja_status
  ON public.vendas_suspensas (loja_id, status, criado_em DESC);

-- RLS
ALTER TABLE public.vendas_suspensas ENABLE ROW LEVEL SECURITY;

-- Operador vê todas as suspensões ativas da sua loja
CREATE POLICY "vs_loja_select" ON public.vendas_suspensas
  FOR SELECT USING (
    loja_id IN (
      SELECT pu.loja_id FROM public.perfis_usuario pu WHERE pu.id = auth.uid()
    )
  );

-- Operador insere apenas na sua loja
CREATE POLICY "vs_loja_insert" ON public.vendas_suspensas
  FOR INSERT WITH CHECK (
    loja_id IN (
      SELECT pu.loja_id FROM public.perfis_usuario pu WHERE pu.id = auth.uid()
    )
  );

-- Operador atualiza (resgatar/cancelar) registros da sua loja
CREATE POLICY "vs_loja_update" ON public.vendas_suspensas
  FOR UPDATE USING (
    loja_id IN (
      SELECT pu.loja_id FROM public.perfis_usuario pu WHERE pu.id = auth.uid()
    )
  );
