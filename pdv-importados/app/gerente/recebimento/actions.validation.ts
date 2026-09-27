/** Validações puras de remessa — fora de `'use server'` para compatibilidade com Next (Server Actions só async). */

export function validarRemessaInput(input: {
  fornecedor_id: string
  itens: Array<{
    produto_id: string
    quantidade_esperada: number
    quantidade_conferida: number
    custo_unitario: number
  }>
}): string | null {
  const fornecedorId = input.fornecedor_id?.trim()
  if (!fornecedorId) return 'Selecione o fornecedor.'
  if (!input.itens?.length) return 'Inclua ao menos um item.'
  for (const it of input.itens) {
    if (!it.produto_id?.trim()) return 'Produto inválido na remessa.'
    if (!Number.isFinite(it.quantidade_esperada) || it.quantidade_esperada < 0) {
      return 'Quantidade esperada inválida.'
    }
    if (it.quantidade_esperada === 0) {
      return 'Quantidade esperada deve ser maior que zero.'
    }
    if (!Number.isFinite(it.quantidade_conferida) || it.quantidade_conferida < 0) {
      return 'Quantidade conferida inválida.'
    }
    if (it.quantidade_conferida === 0) {
      return 'Quantidade conferida deve ser maior que zero para confirmar a entrada.'
    }
    if (!Number.isFinite(it.custo_unitario) || it.custo_unitario <= 0) {
      return 'Custo unitário deve ser maior que zero.'
    }
  }
  return null
}
