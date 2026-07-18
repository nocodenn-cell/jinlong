import { describe, expect, it } from 'vitest'
import { CLIENTES_PAGE_SIZE, mapClienteViewRow } from './customerReader'

describe('customerReader', () => {
  it('mantém page size legado', () => {
    expect(CLIENTES_PAGE_SIZE).toBe(20)
  })

  it('mapClienteViewRow espelha contrato UI (limite_crediario / criado_em)', () => {
    expect(
      mapClienteViewRow({
        id: 'c1',
        nome: 'Ana',
        tipo: 'PF',
        documento: '12345678901',
        email: 'a@b.co',
        telefone: null,
        endereco: null,
        limite_credito: '100',
        saldo_crediario: '12.5',
        ultima_compra: null,
        created_at: '2026-01-01T00:00:00Z',
      }),
    ).toEqual({
      id: 'c1',
      nome: 'Ana',
      tipo: 'PF',
      documento: '12345678901',
      email: 'a@b.co',
      telefone: null,
      endereco: null,
      limite_crediario: 100,
      saldo_crediario: 12.5,
      ultima_compra: null,
      criado_em: '2026-01-01T00:00:00Z',
    })
  })
})
