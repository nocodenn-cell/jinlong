/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imprimirNoIframe } from './imprimirNoIframe'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('imprimirNoIframe', () => {
  it('clona o nó no iframe com o CSS informado, imprime e remove o iframe após imprimir', () => {
    const el = document.createElement('div')
    el.textContent = 'cupom'
    document.body.appendChild(el)

    const print = vi.fn()
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = originalCreate(tag)
      if (tag === 'iframe') {
        // jsdom não implementa print() no iframe: instala um espião quando o iframe é anexado
        const append = document.body.appendChild.bind(document.body)
        vi.spyOn(document.body, 'appendChild').mockImplementation(((n: Node) => {
          const r = append(n)
          if (n === node) {
            const w = (node as HTMLIFrameElement).contentWindow
            if (w) w.print = print
          }
          return r
        }) as typeof document.body.appendChild)
      }
      return node
    })

    imprimirNoIframe(el, '.x{color:#000}')

    const iframe = document.body.querySelector('iframe') as HTMLIFrameElement
    expect(iframe).not.toBeNull()
    expect(iframe.contentDocument?.body.textContent).toBe('cupom')
    expect(iframe.contentDocument?.head.querySelector('style')?.textContent).toBe('.x{color:#000}')
    expect(print).toHaveBeenCalledTimes(1)

    iframe.contentWindow?.onafterprint?.(new Event('afterprint'))
    expect(document.body.querySelector('iframe')).toBeNull()
  })
})
