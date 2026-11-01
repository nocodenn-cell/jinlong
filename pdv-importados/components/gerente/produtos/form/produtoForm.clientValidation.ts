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

/**
 * Identifica o campo inválido. Usa os mesmos valores do atributo `data-field`
 * dos inputs, para o modal localizar e focar o campo sem um mapa de tradução.
 */
export type ProdutoFormCampoErro =
  | 'nome'
  | 'codigo_barras'
  | 'preco_varejo'
  | 'preco_atacado'
  | 'preco_custo'
  | 'estoque_inicial'
  | 'estoque_minimo'
  | 'quantidade_gatilho'

export type ProdutoFormErro = Readonly<{
  campo: ProdutoFormCampoErro
  mensagem: string
}>

export function validarProdutoFormClient(
  input: ProdutoFormClientValidation,
): ProdutoFormErro | null {
  const nome = input.nome.trim()
  if (!nome) return { campo: 'nome', mensagem: input.messages.nome_obrigatorio }
  if (nome.length < 2) return { campo: 'nome', mensagem: input.messages.nome_minimo }

  const barcode = input.codigoBarras.trim()
  if (barcode.length > 0 && barcode.length < 3) {
    return { campo: 'codigo_barras', mensagem: input.messages.codigo_barras_minimo }
  }

  if (!input.comoRascunho) {
    if (input.precoVarejo == null || input.precoVarejo <= 0) {
      return { campo: 'preco_varejo', mensagem: input.messages.preco_invalido }
    }
  }

  if (
    input.precoAtacado != null &&
    input.precoVarejo != null &&
    input.precoAtacado >= input.precoVarejo
  ) {
    return { campo: 'preco_atacado', mensagem: input.messages.atacado_maior_varejo }
  }

  return null
}
