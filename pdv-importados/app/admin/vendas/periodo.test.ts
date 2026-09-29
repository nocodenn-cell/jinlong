import { describe, expect, it } from 'vitest'
import { periodoFim, periodoInicio, periodoMultiDia } from './periodo'

// 29/09/2026 23:30 em Brasília = 30/09/2026 02:30Z
const NOITE = new Date('2026-09-30T02:30:00Z')

describe('periodo (fuso BRT)', () => {
  it('hoje começa à meia-noite de Brasília, mesmo com o servidor já em outro dia UTC', () => {
    expect(periodoInicio('hoje', NOITE)).toBe('2026-09-29T03:00:00.000Z')
  })
  it('ontem fecha 1ms antes do início de hoje', () => {
    expect(periodoInicio('ontem', NOITE)).toBe('2026-09-28T03:00:00.000Z')
    expect(periodoFim('ontem', NOITE)).toBe('2026-09-29T02:59:59.999Z')
  })
  it('7d e 30d incluem hoje (janela de 7/30 dias corridos)', () => {
    expect(periodoInicio('7d', NOITE)).toBe('2026-09-23T03:00:00.000Z')
    expect(periodoInicio('30d', NOITE)).toBe('2026-08-31T03:00:00.000Z')
  })
  it('mes começa no dia 1 (BRT)', () => {
    expect(periodoInicio('mes', NOITE)).toBe('2026-09-01T03:00:00.000Z')
  })
  it('tudo não tem limites', () => {
    expect(periodoInicio('tudo', NOITE)).toBeNull()
    expect(periodoFim('tudo', NOITE)).toBeNull()
  })
  it('multi-dia', () => {
    expect(periodoMultiDia('hoje')).toBe(false)
    expect(periodoMultiDia('30d')).toBe(true)
  })
})
