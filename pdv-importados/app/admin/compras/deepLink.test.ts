import { describe, expect, it } from 'vitest'
import { adminComprasFornecedorQuery, ROUTES } from '@shared-core/navigation/routes'

describe('adminComprasFornecedorQuery (G-03 — Fornecedor abre "Nova OC" pré-selecionada)', () => {
  it('monta a URL de compras com o id do fornecedor na query string', () => {
    expect(adminComprasFornecedorQuery('fornecedor-123')).toBe(`${ROUTES.admin.compras}?fornecedor=fornecedor-123`)
  })

  it('não adiciona query string para um id vazio', () => {
    expect(adminComprasFornecedorQuery('')).toBe(ROUTES.admin.compras)
    expect(adminComprasFornecedorQuery('   ')).toBe(ROUTES.admin.compras)
  })
})
