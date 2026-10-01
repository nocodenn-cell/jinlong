import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdminLoading from './loading'

describe('AdminLoading (UX-021 / P-36)', () => {
  it('mostra um esqueleto no formato da página (título, KPIs e linhas), não um spinner de tela cheia', () => {
    const html = renderToStaticMarkup(<AdminLoading />)
    expect(html).toContain('data-testid="admin-loading"')
    expect(html).toContain('aria-busy="true"')
    // 1 título + 4 KPIs + 6 linhas
    expect((html.match(/animate-pulse/g) ?? []).length).toBe(11)
  })
})
