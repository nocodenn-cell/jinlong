/** Seletor "Vendedor / 销售员": padrão = operador; lembra o último vendedor por operador neste navegador. */
export type VendedorOpcao = { id: string; nome: string }

const chave = (operadorId: string) => `jl:caixa:vendedor:${operadorId}`

export function vendedorInicial(
  operadorId: string | null,
  vendedores: readonly VendedorOpcao[],
  storage: Pick<Storage, 'getItem'> | null,
): string | null {
  if (!operadorId) return null
  const salvo = storage?.getItem(chave(operadorId)) ?? null
  if (salvo && vendedores.some((v) => v.id === salvo)) return salvo
  return operadorId
}

export function lembrarVendedor(operadorId: string | null, vendedorId: string, storage: Pick<Storage, 'setItem' | 'removeItem'> | null): void {
  if (!operadorId || !storage) return
  if (vendedorId === operadorId) storage.removeItem(chave(operadorId))
  else storage.setItem(chave(operadorId), vendedorId)
}

/** Só chama a RPC quando o vendedor é diferente do operador (NULL no banco = operador). */
export function precisaDefinirVendedor(operadorId: string | null, vendedorId: string | null): vendedorId is string {
  return !!vendedorId && !!operadorId && vendedorId !== operadorId
}
