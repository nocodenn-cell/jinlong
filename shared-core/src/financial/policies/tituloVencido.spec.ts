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

  it('usa o dia civil de Brasília, não o UTC: 23:30 BRT ainda é o mesmo dia', () => {
    // 04/09 23:30 BRT = 05/09 02:30Z → UTC já diria 05/09
    expect(hojeYmd(new Date('2026-09-05T02:30:00Z'))).toBe('2026-09-04')
  })

  it('00:10 BRT já é o dia seguinte (mudança de dia)', () => {
    // 05/09 00:10 BRT = 05/09 03:10Z
    expect(hojeYmd(new Date('2026-09-05T03:10:00Z'))).toBe('2026-09-05')
    expect(hojeYmd(new Date('2026-09-05T02:59:59Z'))).toBe('2026-09-04')
  })

  it('aceita outro fuso explícito', () => {
    expect(hojeYmd(new Date('2026-09-05T02:30:00Z'), 'UTC')).toBe('2026-09-05')
  })

  it('título que vence "hoje" às 23:30 BRT NÃO está vencido', () => {
    const agora = new Date('2026-09-05T02:30:00Z') // 04/09 23:30 BRT
    expect(isTituloVencido('2026-09-04', 'PENDENTE', hojeYmd(agora))).toBe(false)
    // e vira vencido à 00:10 BRT do dia seguinte
    expect(isTituloVencido('2026-09-04', 'PENDENTE', hojeYmd(new Date('2026-09-05T03:10:00Z')))).toBe(true)
  })
})
