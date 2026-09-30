/**
 * Impressão de um trecho do DOM pela janela do navegador, usada por todos os
 * comprovantes (cupom, sangria/suprimento, fechamento, devolução, cancelamento).
 *
 * Usa um iframe oculto na própria página (em vez de `window.open`, S5148) para ter
 * um contexto de impressão isolado, só com o CSS informado. O iframe é removido
 * em `onafterprint`.
 */
export function imprimirNoIframe(el: HTMLElement, css: string): void {
  const iframe = document.createElement("iframe")
  iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden"
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    document.body.removeChild(iframe)
    return
  }

  const style = doc.createElement("style")
  style.textContent = css
  doc.head.appendChild(style)
  doc.body.appendChild(el.cloneNode(true))

  win.onafterprint = () => document.body.removeChild(iframe)
  win.print()
}
