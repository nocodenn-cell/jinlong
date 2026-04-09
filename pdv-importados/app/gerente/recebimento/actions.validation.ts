/** Validações puras de remessa — fora de `'use server'` para compatibilidade com Next (Server Actions só async). */

export function validarRemessaInput(input: {
  origem: string
  itens: Array<{ produto_id: string; quantidade_esperada: number; quantidade_conferida: number }>
}): string | null {
  const origem = input.origem.trim()
  if (!origem) return 'Informe a origem da remessa.'
  if (!input.itens?.length) return 'Inclua ao menos um item.'
  for (const it of input.itens) {
    if (!it.produto_id?.trim()) return 'Produto inválido na remessa.'
    if (!Number.isFinite(it.quantidade_esperada) || it.quantidade_esperada < 0) {
      return 'Quantidade esperada inválida.'
    }
    if (!Number.isFinite(it.quantidade_conferida) || it.quantidade_conferida < 0) {
      return 'Quantidade conferida inválida.'
    }
  }
  return null
}
