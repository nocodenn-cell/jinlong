import { describe, expect, it } from 'vitest'
import { hubTabIsActive, resolveActiveHubTabId } from './hubNavModel'
import { CATALOGO_HUB_TABS } from './catalogoHubNav'
import { ESTOQUE_HUB_TABS } from './estoqueHubNav'

describe('hubNavModel', () => {
  it('estoque saldos só ativa na rota exata', () => {
    const saldos = ESTOQUE_HUB_TABS.find((t) => t.id === 'saldos')!
    expect(hubTabIsActive('/admin/estoque', saldos)).toBe(true)
    expect(hubTabIsActive('/admin/estoque/recebimento', saldos)).toBe(false)
  })

  it('catálogo produtos inclui /admin/catalogo/novo', () => {
    const produtos = CATALOGO_HUB_TABS.find((t) => t.id === 'produtos')!
    expect(hubTabIsActive('/admin/catalogo/novo', produtos)).toBe(true)
  })

  it('resolveActiveHubTabId retorna null se nenhuma aba casar', () => {
    expect(resolveActiveHubTabId('/admin/dashboard', CATALOGO_HUB_TABS)).toBeNull()
  })
})
