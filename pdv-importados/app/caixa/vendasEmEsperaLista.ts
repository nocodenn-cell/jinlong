/** Pedido que o fechamento recusa e que não é o cupom aberto nesta tela. */
export function vendaEmEsperaRetomadaPresa(status: string | null | undefined): boolean {
  return status === 'RETOMADA'
}

/**
 * Esconde o pedido que já está no carrinho. As outras RETOMADA continuam
 * visíveis para descarte — senão o fechamento fica bloqueado sem saída na tela.
 */
export function vendasEmEsperaVisiveis<T extends { id: string }>(
  vendas: readonly T[],
  origemNoCarrinho: string | null,
): T[] {
  if (!origemNoCarrinho) return [...vendas]
  return vendas.filter((v) => v.id !== origemNoCarrinho)
}
