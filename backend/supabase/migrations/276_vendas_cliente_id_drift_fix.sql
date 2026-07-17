-- 276 — Fase 5, Entrega 9: fecha drift encontrado durante a auditoria do
-- histórico do caixa.
--
-- Achado: `finalizar_venda_transacional_canonica_v4` (migrations 24702 e
-- 268) já faz `INSERT INTO public.vendas (..., cliente_id) VALUES (...,
-- p_cliente_id)` e `SELECT ... FROM public.vendas` esperando essa coluna
-- desde a Fase 5b — mas NENHUMA migration no repositório contém o
-- `ALTER TABLE public.vendas ADD COLUMN cliente_id` correspondente, e
-- `database.types.ts` (gerado a partir do schema real) não lista essa
-- coluna em `vendas`. Ou a coluna já existe em produção via um caminho
-- fora do histórico de migrations (drift real — este ALTER idempotente
-- reconcilia o repositório com a realidade), ou nunca existiu e a v4
-- estaria falhando silenciosamente ao tentar gravar `cliente_id` sempre
-- que uma venda com cliente for finalizada. IF NOT EXISTS torna este
-- ALTER seguro nos dois cenários.

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes (id);

CREATE INDEX IF NOT EXISTS idx_vendas_cliente_id
  ON public.vendas (cliente_id)
  WHERE cliente_id IS NOT NULL;

COMMENT ON COLUMN public.vendas.cliente_id IS
  'Cliente associado à venda (opcional). Obrigatório quando há saldo pendente (crediário) — ver finalizar_venda_transacional_canonica_v4.';
