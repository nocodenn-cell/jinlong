import { describe, expect, it } from 'vitest'
import { validarParAtacado } from './paresAtacado'

describe('validarParAtacado (D6)', () => {
  it('aceita preço e gatilho juntos', () => {
    expect(validarParAtacado(17.9, 10)).toBeNull()
  })
  it('aceita nenhum dos dois', () => {
    expect(validarParAtacado(null, null)).toBeNull()
    expect(validarParAtacado(undefined, undefined)).toBeNull()
  })
  it('recusa preço sem gatilho (o caso que deixava o preço sem efeito na venda)', () => {
    expect(validarParAtacado(17.9, null)).toBe('ATACADO_SEM_GATILHO')
  })
  it('recusa gatilho sem preço', () => {
    expect(validarParAtacado(null, 10)).toBe('GATILHO_SEM_ATACADO')
  })
})
