-- Financial remediation Phase 1A (EXPAND only).
--
-- Adds the nullable correlation contract required before migrating the AR/AP
-- callers. This migration intentionally does not change either RPC and does
-- not create any cash effect. Existing rows and legacy callers remain valid.

BEGIN;

-- ---------------------------------------------------------------------------
-- Accounts receivable settlements
-- ---------------------------------------------------------------------------

ALTER TABLE public.liquidacoes_receber
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS caixa_id uuid REFERENCES public.caixas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS operacao_tipo text,
  ADD COLUMN IF NOT EXISTS operacao_origem_id uuid
    REFERENCES public.liquidacoes_receber(id) ON DELETE RESTRICT;

ALTER TABLE public.liquidacoes_receber
  DROP CONSTRAINT IF EXISTS liquidacoes_receber_idempotency_key_not_blank,
  ADD CONSTRAINT liquidacoes_receber_idempotency_key_not_blank
    CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) > 0),
  DROP CONSTRAINT IF EXISTS liquidacoes_receber_origem_not_blank,
  ADD CONSTRAINT liquidacoes_receber_origem_not_blank
    CHECK (origem IS NULL OR length(btrim(origem)) > 0),
  DROP CONSTRAINT IF EXISTS liquidacoes_receber_operacao_tipo_check,
  ADD CONSTRAINT liquidacoes_receber_operacao_tipo_check
    CHECK (operacao_tipo IS NULL OR operacao_tipo IN ('RECEBIMENTO', 'ESTORNO')),
  DROP CONSTRAINT IF EXISTS liquidacoes_receber_operacao_origem_distinta,
  ADD CONSTRAINT liquidacoes_receber_operacao_origem_distinta
    CHECK (operacao_origem_id IS NULL OR operacao_origem_id <> id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_liquidacoes_receber_idempotency
  ON public.liquidacoes_receber (titulo_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_liquidacoes_receber_caixa
  ON public.liquidacoes_receber (caixa_id, created_at)
  WHERE caixa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_liquidacoes_receber_operacao_origem
  ON public.liquidacoes_receber (operacao_origem_id)
  WHERE operacao_origem_id IS NOT NULL;

COMMENT ON COLUMN public.liquidacoes_receber.idempotency_key IS
  'Chave de idempotencia do comando financeiro, unica no escopo do titulo. NULL identifica legado pre-remediacao.';
COMMENT ON COLUMN public.liquidacoes_receber.origem IS
  'Origem versionada do comando (UI, integracao ou repair aprovado). NULL identifica legado pre-remediacao.';
COMMENT ON COLUMN public.liquidacoes_receber.loja_id IS
  'Snapshot da loja validada pela RPC. Durante EXPAND permanece nullable para compatibilidade.';
COMMENT ON COLUMN public.liquidacoes_receber.caixa_id IS
  'Caixa fisico explicitamente identificado quando a forma movimentar DINHEIRO; NULL nas demais formas e no legado.';
COMMENT ON COLUMN public.liquidacoes_receber.operacao_tipo IS
  'RECEBIMENTO ou ESTORNO append-only. NULL identifica legado ate MIGRATE CALLERS/ENFORCE.';
COMMENT ON COLUMN public.liquidacoes_receber.operacao_origem_id IS
  'Liquidacao original compensada por um ESTORNO; fatos originais nunca sao apagados.';

-- ---------------------------------------------------------------------------
-- Accounts payable payments
-- ---------------------------------------------------------------------------

ALTER TABLE public.contas_pagar_pagamentos
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS caixa_id uuid REFERENCES public.caixas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS operacao_tipo text,
  ADD COLUMN IF NOT EXISTS operacao_origem_id uuid
    REFERENCES public.contas_pagar_pagamentos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS movimentacao_caixa_id uuid
    REFERENCES public.movimentacoes_caixa(id) ON DELETE RESTRICT;

ALTER TABLE public.contas_pagar_pagamentos
  DROP CONSTRAINT IF EXISTS contas_pagar_pagamentos_idempotency_key_not_blank,
  ADD CONSTRAINT contas_pagar_pagamentos_idempotency_key_not_blank
    CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) > 0),
  DROP CONSTRAINT IF EXISTS contas_pagar_pagamentos_origem_not_blank,
  ADD CONSTRAINT contas_pagar_pagamentos_origem_not_blank
    CHECK (origem IS NULL OR length(btrim(origem)) > 0),
  DROP CONSTRAINT IF EXISTS contas_pagar_pagamentos_operacao_tipo_check,
  ADD CONSTRAINT contas_pagar_pagamentos_operacao_tipo_check
    CHECK (operacao_tipo IS NULL OR operacao_tipo IN ('PAGAMENTO', 'ESTORNO')),
  DROP CONSTRAINT IF EXISTS contas_pagar_pagamentos_operacao_origem_distinta,
  ADD CONSTRAINT contas_pagar_pagamentos_operacao_origem_distinta
    CHECK (operacao_origem_id IS NULL OR operacao_origem_id <> id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_pagar_pagamentos_idempotency
  ON public.contas_pagar_pagamentos (conta_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_pagar_pagamentos_caixa
  ON public.contas_pagar_pagamentos (caixa_id, created_at)
  WHERE caixa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_pagar_pagamentos_operacao_origem
  ON public.contas_pagar_pagamentos (operacao_origem_id)
  WHERE operacao_origem_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_pagar_pagamentos_movimentacao_caixa
  ON public.contas_pagar_pagamentos (movimentacao_caixa_id)
  WHERE movimentacao_caixa_id IS NOT NULL;

COMMENT ON COLUMN public.contas_pagar_pagamentos.idempotency_key IS
  'Chave de idempotencia do comando financeiro, unica no escopo da conta. NULL identifica legado pre-remediacao.';
COMMENT ON COLUMN public.contas_pagar_pagamentos.origem IS
  'Origem versionada do comando. NULL identifica legado pre-remediacao.';
COMMENT ON COLUMN public.contas_pagar_pagamentos.loja_id IS
  'Snapshot da loja validada pela RPC. Durante EXPAND permanece nullable para compatibilidade.';
COMMENT ON COLUMN public.contas_pagar_pagamentos.caixa_id IS
  'Caixa explicitamente identificado quando o pagamento em DINHEIRO usar sangria; NULL nas demais formas e no legado.';
COMMENT ON COLUMN public.contas_pagar_pagamentos.operacao_tipo IS
  'PAGAMENTO ou ESTORNO append-only. NULL identifica legado ate MIGRATE CALLERS/ENFORCE.';
COMMENT ON COLUMN public.contas_pagar_pagamentos.operacao_origem_id IS
  'Pagamento original compensado por um ESTORNO; fatos originais nunca sao apagados.';
COMMENT ON COLUMN public.contas_pagar_pagamentos.movimentacao_caixa_id IS
  'Sangria autorizada correlacionada ao AP em DINHEIRO. UNIQUE impede dois pagamentos para a mesma movimentacao.';

-- RLS remains enabled and scoped through the parent title/account policies.
-- New snapshot columns do not grant access and are not authorization inputs.

COMMIT;
