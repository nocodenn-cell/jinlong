import { describe, expect, it } from 'vitest'
import { financeiroHrefForTab } from './financeiroHubQuery'

describe('financeiroHrefForTab', () => {
  it('remove filtros de receber ao ir para pagar', () => {
    const raw = new URLSearchParams('tab=receber&cliente=abc&status=aberto&periodo=2026-01')
    const href = financeiroHrefForTab('pagar', raw)
    expect(href).toContain('tab=pagar')
    expect(href).toContain('status=aberto')
    expect(href).toContain('periodo=2026-01')
    expect(href).not.toContain('cliente=')
  })

  it('mantém filtros de receber ao permanecer em receber', () => {
    const raw = new URLSearchParams('tab=receber&cliente=xyz&q=test')
    const href = financeiroHrefForTab('receber', raw)
    expect(href).toContain('cliente=xyz')
    expect(href).toContain('q=test')
  })

  it('fiscal não herda params de outras abas', () => {
    const raw = new URLSearchParams('tab=pagar&status=aberto&cliente=x')
    const href = financeiroHrefForTab('fiscal', raw)
    expect(href).toBe('/admin/financeiro?tab=fiscal')
  })
})
