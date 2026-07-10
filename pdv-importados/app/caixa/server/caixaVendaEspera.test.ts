import { describe, expect, it } from 'vitest'
import { formatNumeroVendaHistorico } from '@/app/caixa/server/caixaVendaEspera.impl'

describe('formatNumeroVendaHistorico', () => {
  it('formata prefixo curto do UUID em maiúsculas', () => {
    expect(formatNumeroVendaHistorico('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('#A1B2C3D4')
  })

  it('retorna traço para id vazio após normalização', () => {
    expect(formatNumeroVendaHistorico('')).toBe('—')
  })
})
