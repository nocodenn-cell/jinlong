-- Coluna aditiva extraída da migration obsoleta 20261006120000 (quarentena).
-- A 120000 inteira permanece FORBIDDEN (função financeiro_capturar_venda obsoleta).
-- Esta migration restaura apenas a coluna esperada por database.types.ts e pelos
-- testes financeiros locais, sem reintroduzir a captura legada.
-- Idempotente: ADD COLUMN IF NOT EXISTS / FK condicionada.

ALTER TABLE public.formas_pagamento
  ADD COLUMN IF NOT EXISTS conta_financeira_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'formas_pagamento_conta_financeira_id_fkey'
      AND conrelid = 'public.formas_pagamento'::regclass
  ) THEN
    ALTER TABLE public.formas_pagamento
      ADD CONSTRAINT formas_pagamento_conta_financeira_id_fkey
      FOREIGN KEY (conta_financeira_id)
      REFERENCES public.contas_financeiras(id);
  END IF;
END $$;

COMMENT ON COLUMN public.formas_pagamento.conta_financeira_id IS
  'Conta financeira opcional da forma (legado + painel). Fonte canônica de liquidação permanece financeiro_contas_forma (mig 180000).';
