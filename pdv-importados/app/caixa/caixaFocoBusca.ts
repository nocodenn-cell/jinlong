/**
 * Foco do campo de leitura do PDV, compartilhado pelos campos numéricos do fluxo
 * de venda (quantidade no carrinho, valor das parcelas).
 *
 * O operador termina de digitar um número e aperta Enter esperando voltar ao
 * ponto de partida — bipar o próximo item ou acionar F4. Sem isso ele precisa do
 * mouse, justamente no meio do trecho que deveria ser todo por teclado.
 */

const SELETOR_BUSCA = '[data-caixa-busca="true"]'

export function focarBuscaCaixa(): void {
  if (typeof document === "undefined") return
  document.querySelector<HTMLElement>(SELETOR_BUSCA)?.focus()
}

/**
 * Handler de Enter para inputs numéricos do fluxo de venda: confirma o valor
 * (blur, que dispara o commit do campo) e devolve o foco ao campo de leitura.
 */
export function enterVoltaParaBusca(e: React.KeyboardEvent<HTMLInputElement>): void {
  if (e.key !== "Enter") return
  e.preventDefault()
  e.currentTarget.blur()
  focarBuscaCaixa()
}
