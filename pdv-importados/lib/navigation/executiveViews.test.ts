import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import {
  executiveRelatoriosHref,
  executiveViewHref,
  isExecutiveRelatoriosView,
  parseExecutiveView,
} from './executiveViews'

describe('executiveViews', () => {
  it('parseExecutiveView aceita as 5 abas e faz fallback para visão geral', () => {
    expect(parseExecutiveView('visao-geral')).toBe('visao-geral')
    expect(parseExecutiveView('vendas-caixas')).toBe('vendas-caixas')
    expect(parseExecutiveView('dre-financeiro')).toBe('dre-financeiro')
    expect(parseExecutiveView('produtos-estoque')).toBe('produtos-estoque')
    expect(parseExecutiveView('crm-auditoria')).toBe('crm-auditoria')
    expect(parseExecutiveView('xyz')).toBe('visao-geral')
    expect(parseExecutiveView(null)).toBe('visao-geral')
  })

  it('hrefs canônicos', () => {
    expect(executiveViewHref('visao-geral')).toBe(ROUTES.admin.dashboard)
    expect(executiveRelatoriosHref('vendas-caixas')).toBe(
      `${ROUTES.admin.relatorios}?view=vendas-caixas`,
    )
  })

  it('isExecutiveRelatoriosView exclui visão geral', () => {
    expect(isExecutiveRelatoriosView('visao-geral')).toBe(false)
    expect(isExecutiveRelatoriosView('crm-auditoria')).toBe(true)
  })
})
