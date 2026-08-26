/**
 * Boundary puro: fornecedor_id opcional deve pertencer à loja da OC.
 * Retorna mensagem de erro ou null se ok / sem fornecedor.
 */
export function mensagemSeFornecedorForaDaLoja(opts: {
  fornecedorId: string | null | undefined
  fornecedorLojaId: string | null | undefined
  lojaIdOc: string
}): string | null {
  if (!opts.fornecedorId) return null
  if (!opts.fornecedorLojaId || opts.fornecedorLojaId !== opts.lojaIdOc) {
    return 'Fornecedor inválido para esta loja.'
  }
  return null
}
