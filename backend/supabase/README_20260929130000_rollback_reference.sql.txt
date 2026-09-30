-- Referência MANUAL de rollback de 20260929130000_descontos_venda_exige_pagamento_dinheiro.sql
-- (fora de supabase/migrations/ por design — ver README_224_rollback_reference.sql.txt).
--
-- A migration só cria objetos novos (função internal.* + trigger); nenhuma função
-- ou dado existente foi alterado, então o rollback não precisa restaurar nada.
-- Rodar manualmente contra o ambiente alvo, com autorização explícita:

BEGIN;
DROP TRIGGER IF EXISTS trg_descontos_venda_exige_pagamento_dinheiro ON public.descontos_venda;
DROP FUNCTION IF EXISTS internal.trg_descontos_venda_exige_pagamento_dinheiro();
COMMIT;
