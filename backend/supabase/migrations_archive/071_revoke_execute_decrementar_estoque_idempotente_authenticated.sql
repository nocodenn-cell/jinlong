-- Remove EXECUTE de `authenticated` na RPC legada `decrementar_estoque_idempotente`.
-- O caixa web e a app não devem chamar esta função (usam `decrementar_estoque_seguro` / finalizar venda).
-- Mantém `service_role` para compatibilidade com automações ou scripts que ainda invocam o nome.

REVOKE EXECUTE ON FUNCTION public.decrementar_estoque_idempotente(uuid, numeric, uuid) FROM authenticated;
