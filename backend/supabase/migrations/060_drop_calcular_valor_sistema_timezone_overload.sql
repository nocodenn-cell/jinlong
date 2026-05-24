-- Remove o overload fantasma calcular_valor_sistema_dinheiro_caixa(uuid, text) que ficou
-- no banco após refatoração. A presença dos dois overloads (uuid) e (uuid, text) causava
-- "Could not choose the best candidate function" ao chamar via PostgREST com named params.
--
-- Mantém apenas a versão canônica (uuid) definida em 049 + 053.

DROP FUNCTION IF EXISTS public.calcular_valor_sistema_dinheiro_caixa(uuid, text);
