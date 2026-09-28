/**
 * Onde cada campo reprovado mora na tela — decisão pura, testável sem UI.
 */
import type { ProdutoFormCampoErro } from './produtoForm.clientValidation'

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
