import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { useHasMounted } from './useHasMounted'

function Probe() {
  return createElement('span', null, useHasMounted() ? 'mounted' : 'ssr')
}

describe('useHasMounted', () => {
  it('retorna false no render do servidor (SSR) — gate fechado', () => {
    // No SSR não há efeito; o primeiro paint deve refletir o estado neutro,
    // idêntico ao que o cliente renderiza antes de montar (evita React #418).
    const html = renderToStaticMarkup(createElement(Probe))
    expect(html).toContain('ssr')
    expect(html).not.toContain('mounted')
  })
})
