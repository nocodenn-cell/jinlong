/**
 * Escolhe o `p_venda_id` da finalização: chave estável por cupom = idempotência no RPC.
 * Retorna sempre o mesmo UUID enquanto o cupom não for limpo (handleNovoCupom),
 * garantindo que retentativas não criem vendas duplicadas no banco.
 */
export function resolveVendaIdForFinalize(args: {
  useUnifiedSalesFlow: boolean
  idempotencyKey?: string | undefined
  randomUuid: () => string
}): string {
  const { idempotencyKey, randomUuid } = args
  if (idempotencyKey) return idempotencyKey
  return randomUuid()
}
