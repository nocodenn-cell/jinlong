/**
 * Escolhe o `p_venda_id` da finalização: fluxo unificado + chave estável = idempotência no RPC.
 */
export function resolveVendaIdForFinalize(args: {
  useUnifiedSalesFlow: boolean
  idempotencyKey?: string | undefined
  randomUuid: () => string
}): string {
  const { useUnifiedSalesFlow, idempotencyKey, randomUuid } = args
  if (useUnifiedSalesFlow && idempotencyKey) return idempotencyKey
  return randomUuid()
}
