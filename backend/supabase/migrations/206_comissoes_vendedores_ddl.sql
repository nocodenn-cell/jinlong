-- Subsistema de Comissões: DDL
-- Adiciona campos de comissão por produto e cria tabela comissoes_vendedores.

-- Campos de configuração de comissão no produto
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS comissao_tipo TEXT
    CHECK (comissao_tipo IN ('percentual', 'fixo'))
    DEFAULT 'percentual',
  ADD COLUMN IF NOT EXISTS comissao_valor DECIMAL(10,2) DEFAULT NULL;

COMMENT ON COLUMN public.produtos.comissao_tipo IS
  'Tipo de comissão do produto: percentual (% sobre preco_unitario) ou fixo (R$ por unidade). NULL herda configuração global.';
COMMENT ON COLUMN public.produtos.comissao_valor IS
  'Valor da comissão (% ou R$). NULL = usa comissao_padrao_percentual de configuracoes_gerais.';

-- Tabela de comissões calculadas por item de venda
CREATE TABLE IF NOT EXISTS public.comissoes_vendedores (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id                 UUID        NOT NULL REFERENCES public.lojas(id),
  venda_id                UUID        NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  vendedor_id             UUID        NOT NULL REFERENCES public.usuarios(id),
  produto_id              UUID        NOT NULL REFERENCES public.produtos(id),
  quantidade              NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
  valor_venda_unitario    DECIMAL(10,2) NOT NULL,
  valor_comissao_unitario DECIMAL(10,2) NOT NULL CHECK (valor_comissao_unitario >= 0),
  valor_comissao_total    DECIMAL(10,2) NOT NULL CHECK (valor_comissao_total >= 0),
  status                  TEXT        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'pago')),
  pago_em                 TIMESTAMPTZ,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comissoes_vendedor_loja
  ON public.comissoes_vendedores (vendedor_id, loja_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_comissoes_venda
  ON public.comissoes_vendedores (venda_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_status
  ON public.comissoes_vendedores (loja_id, status);

ALTER TABLE public.comissoes_vendedores ENABLE ROW LEVEL SECURITY;

-- Gerente vê e gerencia comissões da sua loja
CREATE POLICY comissoes_gerente_all ON public.comissoes_vendedores
  FOR ALL TO authenticated
  USING (
    loja_id IN (
      SELECT loja_id FROM public.usuarios WHERE id = auth.uid()
    )
  );
