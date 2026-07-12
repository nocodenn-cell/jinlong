-- Altera o default de tipo_venda de 'SEM_NF' para 'COM_NF'.
-- A partir desta migration todas as novas vendas serão criadas com tipo_venda = 'COM_NF'
-- (emissão fiscal habilitada por padrão).
-- Vendas existentes com tipo_venda = 'SEM_NF' não são alteradas retroativamente.

ALTER TABLE public.vendas
  ALTER COLUMN tipo_venda SET DEFAULT 'COM_NF';
