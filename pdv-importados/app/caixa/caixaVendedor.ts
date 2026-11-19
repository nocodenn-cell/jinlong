/**
 * Seletor "Vendedor / 销售员": toda venda começa com o operador.
 *
 * Decisão do dono (2026-11-19, validação operacional): o vendedor NÃO é lembrado
 * entre vendas. Lembrar o último vendedor fazia vendas seguintes irem para quem
 * atendeu antes, sem o operador perceber (comissão errada). Quem atende outra
 * venda escolhe o vendedor nela.
 */
export type VendedorOpcao = { id: string; nome: string }

/** Vendedor de uma venda nova: sempre o operador logado. */
export function vendedorInicial(operadorId: string | null): string | null {
  return operadorId ?? null
}

/** Só chama a RPC quando o vendedor é diferente do operador (NULL no banco = operador). */
export function precisaDefinirVendedor(operadorId: string | null, vendedorId: string | null): vendedorId is string {
  return !!vendedorId && !!operadorId && vendedorId !== operadorId
}

/**
 * Aplica o vendedor numa venda JÁ gravada (caminho normal e recuperação após timeout).
 * Nunca lança: falha vira `false` e a comissão fica com o operador (o gerente corrige em Falhas).
 */
export async function aplicarVendedorAposVenda(
  vendaId: string,
  operadorId: string | null,
  vendedorId: string | null,
  definir: (vendaId: string, vendedorId: string) => Promise<{ ok: boolean }>,
): Promise<boolean> {
  if (!precisaDefinirVendedor(operadorId, vendedorId)) return true
  try {
    return (await definir(vendaId, vendedorId)).ok
  } catch {
    return false
  }
}
