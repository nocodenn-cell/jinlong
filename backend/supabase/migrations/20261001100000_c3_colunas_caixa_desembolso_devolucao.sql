-- PR-2D / C3 (auditoria JINLONG 2026-09-30) — passo 1/3: estrutura.
--
-- D-2: o dinheiro de uma devolução pertence ao caixa que EFETIVAMENTE desembolsa, nunca ao caixa (possivelmente
-- fechado) da venda de origem. Esta migration só cria colunas anuláveis; nenhum comportamento muda.
--
--   devolucoes.caixa_desembolso_id               caixa aberto que pagou o dinheiro (NULL = legado/sem dinheiro)
--   venda_pos_venda_operacoes.caixa_desembolso_id idem, no nível da operação
--   venda_pos_venda_operacoes.valor_abatido_ar    parte da devolução que abateu o saldo a receber (D-13)
--
-- Conciliação da operação (D-13), testável em SQL:
--     valor_estornado = valor_abatido_ar + valor devolvido em meio de pagamento
-- Registros antigos ficam com NULL / 0, preservando a atribuição histórica (vendas.caixa_id): o valor
-- esperado de nenhum caixa existente muda.
--
-- Rollback: DROP COLUMN das três colunas (nenhuma leitura depende delas antes das migrations seguintes).

ALTER TABLE public.devolucoes
  ADD COLUMN IF NOT EXISTS caixa_desembolso_id uuid REFERENCES public.caixas (id) ON DELETE RESTRICT;

ALTER TABLE public.venda_pos_venda_operacoes
  ADD COLUMN IF NOT EXISTS caixa_desembolso_id uuid REFERENCES public.caixas (id) ON DELETE RESTRICT;

ALTER TABLE public.venda_pos_venda_operacoes
  ADD COLUMN IF NOT EXISTS valor_abatido_ar numeric(10, 2) NOT NULL DEFAULT 0
  CONSTRAINT venda_pos_venda_operacoes_valor_abatido_ar_check CHECK (valor_abatido_ar >= 0);

CREATE INDEX IF NOT EXISTS idx_devolucoes_caixa_desembolso
  ON public.devolucoes (caixa_desembolso_id) WHERE caixa_desembolso_id IS NOT NULL;

COMMENT ON COLUMN public.devolucoes.caixa_desembolso_id IS
  'Caixa ABERTO que desembolsou o dinheiro desta devolução (D-2). NULL = registro legado (atribuído a vendas.caixa_id) ou devolução sem dinheiro (PIX/cartão/abatimento).';
COMMENT ON COLUMN public.venda_pos_venda_operacoes.caixa_desembolso_id IS
  'Caixa ABERTO que desembolsou o dinheiro da operação (D-2). NULL = legado ou operação sem dinheiro. venda_pos_venda_operacoes.caixa_id continua sendo o caixa da venda de origem.';
COMMENT ON COLUMN public.venda_pos_venda_operacoes.valor_abatido_ar IS
  'D-13: parte de valor_estornado que abateu contas_receber.valor_aberto (CREDITO_CLIENTE). valor_estornado = valor_abatido_ar + valor devolvido em meio de pagamento.';
