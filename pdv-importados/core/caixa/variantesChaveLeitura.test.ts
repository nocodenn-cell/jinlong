import { describe, expect, it } from 'vitest'
import { variantesChaveLeitura } from './variantesChaveLeitura'

describe('variantesChaveLeitura', () => {
  it('remove zeros à esquerda nos dígitos', () => {
    expect(variantesChaveLeitura('0078901234567')).toContain('78901234567')
  })

  it('aceita leitura com sufixo numérico extra (prefixo EAN)', () => {
    const longa = '00789012345679999'
    expect(variantesChaveLeitura(longa)).toContain('0078901234567')
  })

  it('EAN com zero à esquerda e dígitos extras: inclui GTIN-13 sem zeros à esquerda', () => {
    const lida = '07891234567890'
    expect(variantesChaveLeitura(lida)).toContain('7891234567890')
    expect(variantesChaveLeitura(lida)).toContain('0789123456789')
  })
})
