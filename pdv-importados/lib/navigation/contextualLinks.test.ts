import { describe, expect, it } from 'vitest'
import { ROUTES, adminComissoesOperadorQuery } from './routes'

describe('links contextuais (UX-IA-01 PR 3)', () => {
  it('Funcionários → Comissões leva o id do operador na query', () => {
    expect(adminComissoesOperadorQuery('abc-123')).toBe(`${ROUTES.admin.comissoes}?operador=abc-123`)
  })

  it('id vazio cai na lista de Comissões, sem query', () => {
    expect(adminComissoesOperadorQuery('  ')).toBe(ROUTES.admin.comissoes)
  })

  it('o id é codificado (sem injeção de parâmetros)', () => {
    const href = adminComissoesOperadorQuery('x&status=pago')
    expect(href).toBe(`${ROUTES.admin.comissoes}?operador=x%26status%3Dpago`)
  })
})
