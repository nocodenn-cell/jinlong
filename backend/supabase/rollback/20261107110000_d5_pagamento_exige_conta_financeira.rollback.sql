-- Rollback de 20261107110000 (D5): remove a exigência de conta financeira para PIX/cartão.
DROP TRIGGER IF EXISTS trg_vendas_pagamentos_exige_conta ON public.vendas_pagamentos;
DROP FUNCTION IF EXISTS internal.valida_pagamento_exige_conta_financeira();
