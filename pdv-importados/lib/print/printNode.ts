/**
 * Impressão de um nó do DOM em contexto isolado.
 *
 * Extraído do mecanismo que o PDV já usa em `CaixaReciboModal`,
 * `CaixaFechamentoReciboModal` e `CaixaMovimentacaoReciboModal`: um iframe
 * oculto na própria página, com CSS próprio, em vez de `window.open` — que é
 * bloqueado por popup blocker e dispara o S5148 do Sonar.
 *
 * Os três modais do PDV continuam com a cópia local deles: esta extração é
 * para o back-office não inventar um segundo jeito de imprimir. Unificar o
 * caixa nesta função é higiene para depois, com QA de impressora térmica —
 * não se mexe no caixa de passagem.
 */

/** Folha de estilo do cupom — a mesma do PDV, para o papel sair igual. */
export const CUPOM_PRINT_CSS = [
  '* { box-sizing: border-box; margin: 0; padding: 0; }',
  "body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; padding: 8px; width: 300px; }",
  '.recibo-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }',
  '.recibo-header h1 { font-size: 14px; font-weight: bold; }',
  '.recibo-header p { font-size: 11px; color: #555; }',
  '.recibo-id { font-size: 10px; color: #777; }',
  '.recibo-itens { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }',
  '.recibo-item { margin-bottom: 3px; }',
  '.recibo-item-nome { font-weight: bold; }',
  '.recibo-item-detalhe { display: flex; justify-content: space-between; font-size: 11px; color: #444; }',
  '.recibo-totais { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }',
  '.recibo-linha { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }',
  '.recibo-linha.total { font-weight: bold; font-size: 14px; }',
  '.recibo-pgto { margin-bottom: 6px; }',
  '.recibo-aviso { text-align: center; font-size: 10px; font-weight: bold; margin-bottom: 6px; }',
  '.recibo-footer { text-align: center; font-size: 10px; color: #888; border-top: 1px dashed #000; padding-top: 6px; }',
].join('\n')

/**
 * Clona `el` para um iframe oculto e manda imprimir.
 *
 * Não faz nada se o nó não existir ou se o iframe não expuser documento —
 * imprimir é acessório, nunca deve derrubar a tela que chamou.
 */
export function printNode(el: HTMLElement | null, css: string): void {
  if (!el || typeof document === 'undefined') return

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', 'print')
  document.body.appendChild(iframe)

  const remover = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    remover()
    return
  }

  const style = doc.createElement('style')
  style.textContent = css
  doc.head.appendChild(style)
  doc.body.appendChild(el.cloneNode(true))

  win.onafterprint = remover
  win.print()
}
