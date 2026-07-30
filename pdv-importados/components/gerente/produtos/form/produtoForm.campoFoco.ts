/**
 * Onde cada campo reprovado mora na tela — decisão pura, testável sem UI.
 *
 * Um toast dizendo "atacado não pode ser maior que varejo" é inútil se o campo
 * está dentro de "Mais detalhes" e a seção está fechada: o operador lê um erro
 * sobre um campo que não existe na tela. O modal usa isto para abrir a seção
 * antes de focar.
 */
import type { ProdutoFormCampoErro } from './produtoForm.clientValidation'

/** Campos que só renderizam no modo completo. */
const SO_NO_MODO_COMPLETO: ReadonlySet<ProdutoFormCampoErro> = new Set<ProdutoFormCampoErro>([
  'preco_atacado',
])

export function campoExigeModoCompleto(campo: ProdutoFormCampoErro): boolean {
  return SO_NO_MODO_COMPLETO.has(campo)
}

/**
 * Localiza o input pelo `data-field` e devolve o elemento focável.
 * Devolve null quando o campo não está montado — o chamador mantém o toast.
 */
export function localizarCampo(
  raiz: HTMLElement | null,
  campo: ProdutoFormCampoErro,
): HTMLElement | null {
  const el = raiz?.querySelector(`[data-field="${campo}"]`)
  return el instanceof HTMLElement ? el : null
}
