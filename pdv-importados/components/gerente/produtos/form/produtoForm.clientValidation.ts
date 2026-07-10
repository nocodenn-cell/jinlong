/**
 * Validação client-side alinhada ao Zod (produtoFormSchema) — feedback antes do server.
 */

export type ProdutoFormClientValidation = Readonly<{
  nome: string
  codigoBarras: string
  precoVarejo: number | null
  precoAtacado: number | null
  comoRascunho: boolean
  messages: {
    nome_obrigatorio: string
    nome_minimo: string
    preco_invalido: string
    codigo_barras_minimo: string
    atacado_maior_varejo: string
  }
}>

export function validarProdutoFormClient(
  input: ProdutoFormClientValidation,
): string | null {
  const nome = input.nome.trim()
  if (!nome) return input.messages.nome_obrigatorio
  if (nome.length < 2) return input.messages.nome_minimo

  const barcode = input.codigoBarras.trim()
  if (barcode.length > 0 && barcode.length < 3) {
    return input.messages.codigo_barras_minimo
  }

  if (!input.comoRascunho) {
    if (input.precoVarejo == null || input.precoVarejo <= 0) {
      return input.messages.preco_invalido
    }
  }

  if (
    input.precoAtacado != null &&
    input.precoVarejo != null &&
    input.precoAtacado >= input.precoVarejo
  ) {
    return input.messages.atacado_maior_varejo
  }

  return null
}
