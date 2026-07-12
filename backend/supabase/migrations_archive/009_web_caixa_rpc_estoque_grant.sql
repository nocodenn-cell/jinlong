-- Permite ao cliente autenticado (caixa web / Server Action) executar a mesma RPC
-- usada pela Edge sync-outbox (`007`), sem expor service_role no browser.
GRANT EXECUTE ON FUNCTION public.decrementar_estoque_idempotente(uuid, numeric, uuid)
  TO authenticated;
