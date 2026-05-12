import { describe, it, expect } from 'vitest'
import { parseTagsFiltroTexto } from './produtoGerenteFiltrosUtils'

describe('parseTagsFiltroTexto', () => {
  it('divide por vírgula e normaliza', () => {
    expect(parseTagsFiltroTexto(' Promo , Verão ')).toEqual(['promo', 'verão'])
  })

  it('remove duplicados e limita a 20', () => {
    const many = Array.from({ length: 25 }, (_, i) => `t${i}`).join(',')
    expect(parseTagsFiltroTexto(many)).toHaveLength(20)
  })
})
