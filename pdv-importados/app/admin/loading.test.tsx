import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdminLoading from './loading'

describe('AdminLoading', () => {
  it('mostra o selo da marca entre abas, com revelação atrasada para não piscar', () => {
    const html = renderToStaticMarkup(<AdminLoading />)
    expect(html).toContain('data-testid="admin-loading"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('route-loader-delayed')
    expect(html).toContain('data-testid="loading-brand-mark"')
  })
})
