/** Chave estável de idempotência: usa `idempotencyKey` quando disponível, UUID aleatório caso contrário. */
export function resolveVendaIdForFinalize(args: {
  idempotencyKey?: string | undefined
  randomUuid: () => string
}): string {
  const { idempotencyKey, randomUuid } = args
  if (idempotencyKey) return idempotencyKey
  return randomUuid()
}
