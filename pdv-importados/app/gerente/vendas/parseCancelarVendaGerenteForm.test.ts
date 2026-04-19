import { describe, expect, it } from 'vitest'
import { parseCancelarVendaGerenteForm } from './parseCancelarVendaGerenteForm'

describe('parseCancelarVendaGerenteForm', () => {
  it('extrai venda_id e motivo', () => {
    const fd = new FormData()
    fd.set('venda_id', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    fd.set('motivo', '  erro no cupom  ')
    expect(parseCancelarVendaGerenteForm(fd)).toEqual({
      vendaId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      motivo: 'erro no cupom',
    })
  })

  it('retorna null se faltar campo', () => {
    const fd = new FormData()
    fd.set('venda_id', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    expect(parseCancelarVendaGerenteForm(fd)).toBeNull()
  })
})
