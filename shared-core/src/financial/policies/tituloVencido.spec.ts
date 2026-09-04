import { describe, expect, it } from 'vitest'
import { hojeYmd, isTituloVencido } from './tituloVencido'

describe('isTituloVencido', () => {
  const hoje = '2026-09-04'

  it('vencimento no passado + status em aberto (PENDENTE) é vencido', () => {
    expect(isTituloVencido('2026-09-01', 'PENDENTE', hoje)).toBe(true)
  })

  it('vencimento no passado + status em aberto (PARCIAL) é vencido', () => {
    expect(isTituloVencido('2026-09-01', 'PARCIAL', hoje)).toBe(true)
  })

  it('vencimento no passado + status em aberto (ABERTO, AR) é vencido', () => {
    expect(isTituloVencido('2026-09-01', 'ABERTO', hoje)).toBe(true)
  })

  it('vencimento hoje não é vencido', () => {
    expect(isTituloVencido('2026-09-04', 'PENDENTE', hoje)).toBe(false)
  })

  it('vencimento futuro não é vencido', () => {
    expect(isTituloVencido('2026-09-05', 'PENDENTE', hoje)).toBe(false)
  })

  it('status PAGO nunca é vencido, mesmo com vencimento no passado', () => {
    expect(isTituloVencido('2026-01-01', 'PAGO', hoje)).toBe(false)
  })

  it('status QUITADO/CANCELADO nunca é vencido', () => {
    expect(isTituloVencido('2026-01-01', 'QUITADO', hoje)).toBe(false)
    expect(isTituloVencido('2026-01-01', 'CANCELADO', hoje)).toBe(false)
  })

  it('sem vencimento nunca é vencido', () => {
    expect(isTituloVencido(null, 'PENDENTE', hoje)).toBe(false)
  })

  it('status legado ATRASADO com vencimento no passado ainda conta como vencido', () => {
    expect(isTituloVencido('2026-09-01', 'ATRASADO', hoje)).toBe(true)
  })
})

describe('hojeYmd', () => {
  it('formata como YYYY-MM-DD', () => {
    expect(hojeYmd(new Date('2026-09-04T23:59:00Z'))).toBe('2026-09-04')
  })
})
