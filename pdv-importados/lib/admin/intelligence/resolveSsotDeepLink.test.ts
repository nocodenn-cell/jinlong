import { describe, expect, it } from 'vitest'
import { ROUTES } from '@shared-core/navigation/routes'
import { resolveSsotDeepLink } from './resolveSsotDeepLink'

describe('resolveSsotDeepLink', () => {
  it('aceita rotas entity-SSoT com query', () => {
    expect(resolveSsotDeepLink(`${ROUTES.admin.catalogo}?produto=1`)).toBe(
      `${ROUTES.admin.catalogo}?produto=1`,
    )
    expect(resolveSsotDeepLink(ROUTES.admin.estoque)).toBe(ROUTES.admin.estoque)
    expect(resolveSsotDeepLink(ROUTES.caixa.home)).toBe(ROUTES.caixa.home)
  })

  it('rejeita rotas fora do SSoT / relativas', () => {
    expect(resolveSsotDeepLink('/admin/intelligence')).toBeNull()
    expect(resolveSsotDeepLink('https://evil.example/admin/estoque')).toBeNull()
    expect(resolveSsotDeepLink(null)).toBeNull()
    expect(resolveSsotDeepLink('')).toBeNull()
  })
})
