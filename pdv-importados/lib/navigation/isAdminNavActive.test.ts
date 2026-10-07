import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { isAdminNavActive } from './isAdminNavActive'

describe('isAdminNavActive', () => {
  it('marca Visão Geral só no dashboard', () => {
    expect(isAdminNavActive('/admin/dashboard', '', ROUTES.admin.dashboard)).toBe(true)
    expect(isAdminNavActive('/admin/relatorios', 'view=vendas-caixas', ROUTES.admin.dashboard)).toBe(
      false,
    )
  })

  it('respeita ?view= nas abas executivas', () => {
    const href = `${ROUTES.admin.relatorios}?view=dre-financeiro`
    expect(isAdminNavActive('/admin/relatorios', 'view=dre-financeiro', href)).toBe(true)
    expect(isAdminNavActive('/admin/relatorios', 'view=vendas-caixas', href)).toBe(false)
    expect(isAdminNavActive('/admin/relatorios', '', href)).toBe(false)
  })

  it('relatórios sem view não colide com abas ?view=', () => {
    expect(isAdminNavActive('/admin/relatorios', '', ROUTES.admin.relatorios)).toBe(true)
    expect(isAdminNavActive('/admin/relatorios', 'view=vendas-caixas', ROUTES.admin.relatorios)).toBe(
      false,
    )
  })
})
