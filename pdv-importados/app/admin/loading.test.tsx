import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'
import AdminLoading from './loading'

describe('AdminLoading', () => {
  it('mostra o selo da marca entre abas, com revelação atrasada para não piscar', () => {
    const html = renderToStaticMarkup(<AdminLoading />)
    expect(html).toContain('data-testid="admin-loading"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('route-loader-delayed')
    expect(html).toContain('data-testid="loading-brand-mark"')
    expect(html).toContain('Carregando...')
  })

  it('rótulo no idioma da sessão (zh)', () => {
    const html = renderToStaticMarkup(
      <AdminV2SessionProvider idioma="zh">
        <AdminLoading />
      </AdminV2SessionProvider>,
    )
    expect(html).toContain('加载中...')
  })
})
